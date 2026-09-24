import { IDiscoveryProvider, DiscoveryResult } from './discovery.interface';
import { SourceVideo, WorkspaceSettings } from '../../types';

export class DevAuthorizedDiscoveryProvider implements IDiscoveryProvider {
  readonly id = 'dev_authorized';
  readonly name = 'DEVELOPMENT ONLY — Authorized Open-Source Source Provider';

  constructor(private isExplicitlyEnabled: boolean) {}

  get isConnected(): boolean {
    return this.isExplicitlyEnabled;
  }

  async discover(
    settings: WorkspaceSettings,
    existingExternalIds: Set<string>,
  ): Promise<DiscoveryResult> {
    if (!this.isConnected) {
      throw new Error(
        'DISCOVERY_PROVIDER_UNAVAILABLE: Development authorized provider is not active. Enable it in Settings for local testing, or configure a YouTube Data API v3 key.',
      );
    }

    const devSampleId = 'authorized_sample_cc_bbb';
    if (existingExternalIds.has(devSampleId)) {
      return {
        sources: [],
        totalDiscovered: 0,
        totalAccepted: 0,
        totalRejected: 0,
        rejections: [],
        providerName: this.name,
        queryAnglesUsed: [`[DEV] ${settings.niche} authorized sample probe`],
      };
    }

    const sampleVideo: SourceVideo = {
      id: `src_dev_${devSampleId}`,
      externalId: devSampleId,
      platform: 'local_authorized',
      url: '/dev-media/authorized_sample.mp4',
      title: `[DEVELOPMENT ONLY] Open-Source High-Definition Moving Media Sample — ${settings.niche} Test Source`,
      channelTitle: 'Blender Foundation (Creative Commons BY 3.0)',
      thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/640px-Big_buck_bunny_poster_big.jpg',
      publishedAt: '2020-10-03T17:28:45Z',
      duration: 35, // Genuine duration in seconds of /dev-media/authorized_sample.mp4
      description:
        'Authorized open-source moving media sample (Big Buck Bunny, Sunflower Edition) used strictly for exercising the real end-to-end rendering and moment extraction pipeline without violating platform Terms of Service.',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 92,
      relevanceReason: `Verified local authorized media source loaded for niche testing: ${settings.niche}.`,
      status: 'discovered',
    };

    return {
      sources: [sampleVideo],
      totalDiscovered: 1,
      totalAccepted: 1,
      totalRejected: 0,
      rejections: [],
      providerName: this.name,
      queryAnglesUsed: [`[DEV] Local authorized media verification for ${settings.niche}`],
    };
  }
}
