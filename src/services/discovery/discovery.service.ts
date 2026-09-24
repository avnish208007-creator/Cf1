import { IRepository } from '../../lib/storage/repository.interface';
import { WorkspaceSettings } from '../../types';
import { IDiscoveryProvider, DiscoveryResult } from './discovery.interface';

export class DiscoveryService {
  constructor(
    private repo: IRepository,
    private provider?: IDiscoveryProvider | null,
  ) {}

  async runDiscovery(settings: WorkspaceSettings): Promise<DiscoveryResult> {
    const provider = this.provider;

    if (!provider || !provider.isConnected) {
      throw new Error(
        'DISCOVERY_PROVIDER_UNAVAILABLE: YouTube Data API v3 is not configured in the server environment. Add YOUTUBE_API_KEY to the Google AI Studio Secrets. Production discovery never injects development test media.',
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
