import { IRepository } from '../../lib/storage/repository.interface';
import { WorkspaceSettings, SourceVideo } from '../../types';
import { IDiscoveryProvider, DiscoveryResult } from './discovery.interface';
import { YouTubeDataApiProvider } from './youtube-data.provider';
import { DevAuthorizedDiscoveryProvider } from './dev-discovery.provider';

export class DiscoveryService {
  constructor(private repo: IRepository) {}

  private getProvider(settings: WorkspaceSettings): IDiscoveryProvider | null {
    // YouTube Data API metadata discovery only
    if (settings.youtubeApiKey && settings.youtubeApiKey.trim().length > 10) {
      return new YouTubeDataApiProvider(settings.youtubeApiKey.trim());
    }

    return null;
  }

  async runDiscovery(settings: WorkspaceSettings): Promise<DiscoveryResult> {
    const provider = this.getProvider(settings);

    if (!provider || !provider.isConnected) {
      throw new Error(
        'DISCOVERY_PROVIDER_UNAVAILABLE: YouTube Data API v3 key is required for video discovery. YouTube Data API serves strictly as a metadata and discovery service. Production discovery never injects development test media.',
      );
    }

    const existingSources = await this.repo.getSources();
    const existingIds = new Set(existingSources.map((s) => s.externalId));

    const result = await provider.discover(settings, existingIds);

    if (result.sources.length > 0) {
      await this.repo.saveSources(result.sources);
    }

    return result;
  }
}
