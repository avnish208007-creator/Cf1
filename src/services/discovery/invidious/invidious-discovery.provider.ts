import { IDiscoveryProvider, DiscoveryResult } from '../discovery.interface';
import { ChannelCandidate, SourceVideo, WorkspaceSettings } from '../../../types';
import { InvidiousInstanceManager } from './instance-manager';
import { ChannelScorer, RawDiscoveredChannel } from '../channel-scorer';

export interface InvidiousChannelSearchItem {
  type: string;
  author: string;
  authorId: string;
  authorUrl?: string;
  authorThumbnails?: Array<{ url: string; width?: number; height?: number }>;
  subCount?: number;
  videoCount?: number;
  description?: string;
}

export interface InvidiousVideoSearchItem {
  type: string;
  title: string;
  videoId: string;
  author: string;
  authorId: string;
  authorUrl?: string;
  videoThumbnails?: Array<{ url: string; width?: number; height?: number }>;
  description?: string;
  viewCount?: number;
  published?: number;
  lengthSeconds?: number;
}

export class InvidiousDiscoveryProvider implements IDiscoveryProvider {
  readonly id = 'invidious_public';
  readonly name = 'Invidious Open Discovery Provider';

  constructor(public instanceManager: InvidiousInstanceManager) {}

  get isConnected(): boolean {
    return this.instanceManager.getHealthyInstances().length > 0;
  }

  /**
   * Generates search queries based on workspace niche, subtopics, content style, and language.
   */
  public generateQueries(settings: WorkspaceSettings): string[] {
    const niche = settings.niche.trim();
    if (!niche) {
      throw new Error('DISCOVERY_INVALID_NICHE: Active workspace niche is required.');
    }

    const queries: string[] = [niche];

    if (settings.subtopics && settings.subtopics.length > 0) {
      for (const st of settings.subtopics.slice(0, 3)) {
        const trimmed = st.trim();
        if (trimmed && !queries.includes(trimmed)) {
          queries.push(`${niche} ${trimmed}`);
        }
      }
    }

    // Add targeted angle queries if space permits
    if (queries.length < 4) {
      queries.push(`${niche} news`);
      queries.push(`${niche} tutorial`);
    }

    return queries.slice(0, 5); // Conservative query limit to prevent hammering
  }

  /**
   * Searches Invidious instances for candidate channels matching the niche queries.
   */
  public async discoverChannels(
    settings: WorkspaceSettings,
    maxChannels = 15,
  ): Promise<ChannelCandidate[]> {
    const queries = this.generateQueries(settings);
    const rawChannels: RawDiscoveredChannel[] = [];

    const queryPromises = queries.map(async (query) => {
      try {
        // Search for channels directly (pure channel discovery)
        const channelRes = await this.instanceManager.fetchJson<any[]>('/api/v1/search', {
          searchParams: {
            q: query,
            type: 'channel',
            sort_by: 'relevance',
          },
        });

        if (Array.isArray(channelRes.data)) {
          const results: RawDiscoveredChannel[] = [];
          for (const item of channelRes.data) {
            if (item.type === 'channel' && item.authorId) {
              const bestThumb =
                item.authorThumbnails && item.authorThumbnails.length > 0
                  ? item.authorThumbnails[item.authorThumbnails.length - 1].url
                  : undefined;

              results.push({
                channelId: item.authorId,
                channelName: item.author || 'Unknown Channel',
                channelUrl: item.authorUrl
                  ? item.authorUrl.startsWith('http')
                    ? item.authorUrl
                    : `https://www.youtube.com${item.authorUrl}`
                  : `https://www.youtube.com/channel/${item.authorId}`,
                thumbnail: bestThumb,
                description: item.description || '',
                subscriberCount: typeof item.subCount === 'number' ? item.subCount : undefined,
                videoCount: typeof item.videoCount === 'number' ? item.videoCount : undefined,
                matchedQuery: query,
              });
            }
          }
          return results;
        }
      } catch {
        // Continue to other queries if one fails or is rate-limited
      }
      return [];
    });

    const settled = await Promise.allSettled(queryPromises);
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        rawChannels.push(...res.value);
      }
    }

    if (rawChannels.length === 0) {
      return [];
    }

    const consolidated = ChannelScorer.consolidateChannels(rawChannels, settings);
    return consolidated.slice(0, maxChannels);
  }

  /**
   * Implements IDiscoveryProvider interface.
   * Discovers channels and extracts metadata references without downloading media.
   */
  async discover(
    settings: WorkspaceSettings,
    existingExternalIds: Set<string>,
  ): Promise<DiscoveryResult> {
    const candidates = await this.discoverChannels(settings);

    return {
      sources: [],
      totalDiscovered: candidates.length,
      totalAccepted: candidates.length,
      totalRejected: 0,
      providerName: this.name,
      queryAnglesUsed: this.generateQueries(settings),
      channelsDiscovered: candidates.length,
      channelsAdded: candidates.length,
      newVideos: 0,
      duplicatesSkipped: 0,
    };
  }
}
