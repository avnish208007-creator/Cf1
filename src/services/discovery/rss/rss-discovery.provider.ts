import { SourceVideo, MonitoredChannel, WorkspaceSettings } from '../../../types';
import { IDiscoveryProvider, DiscoveryResult } from '../discovery.interface';
import { VideoRelevanceScorer } from '../video-relevance-scorer';

export interface RssEntry {
  videoId: string;
  channelId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  url: string;
  thumbnailUrl?: string;
  description?: string;
}

export interface ChannelFeedUpdate {
  channelId: string;
  latestVideoId?: string;
  latestVideoTitle?: string;
  lastSuccessfulCheckAt: string;
}

export interface MonitorChannelsResult {
  newSources: SourceVideo[];
  totalChecked: number;
  videosChecked: number;
  videosAccepted: number;
  videosRejected: number;
  duplicatesSkipped: number;
  rejections: Array<{ videoId: string; title: string; reason: string }>;
  channelUpdates: ChannelFeedUpdate[];
}

export class RSSDiscoveryProvider implements IDiscoveryProvider {
  readonly id = 'youtube_rss_public';
  readonly name = 'YouTube Public Atom RSS Provider';

  private defaultTimeoutMs = 7000;

  get isConnected(): boolean {
    return true; // Public YouTube RSS feeds require no auth or keys
  }

  /**
   * Constructs the official public YouTube Atom RSS feed URL for a given channel ID.
   */
  public getFeedUrl(channelId: string): string {
    const cleanId = channelId.trim();
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${cleanId}`;
  }

  /**
   * Robust parser for YouTube's public Atom/XML feed.
   * Extracts videoId, channelId, title, author, published date, thumbnail, description.
   */
  public parseFeedXml(xml: string, expectedChannelId?: string): RssEntry[] {
    if (!xml || typeof xml !== 'string' || !xml.includes('<feed')) {
      throw new Error('RSS_INVALID_RESPONSE: Malformed or non-XML response received from YouTube RSS feed.');
    }

    const entries: RssEntry[] = [];
    const entryBlocks = xml.split('<entry>').slice(1);

    for (const block of entryBlocks) {
      const entryContent = block.split('</entry>')[0];
      if (!entryContent) continue;

      // Extract video ID: either <yt:videoId>VALUE</yt:videoId> or <id>yt:video:VALUE</id>
      let videoId = '';
      const ytVideoIdMatch = entryContent.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
      if (ytVideoIdMatch) {
        videoId = ytVideoIdMatch[1].trim();
      } else {
        const idMatch = entryContent.match(/<id>[^:]*:video:([^<]+)<\/id>/i);
        if (idMatch) {
          videoId = idMatch[1].trim();
        }
      }

      if (!videoId) continue;

      // Extract channel ID: <yt:channelId>VALUE</yt:channelId>
      let channelId = '';
      const ytChannelIdMatch = entryContent.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i);
      if (ytChannelIdMatch) {
        channelId = ytChannelIdMatch[1].trim();
      }

      // Channel ID mismatch validation
      if (expectedChannelId && channelId && channelId !== expectedChannelId) {
        console.warn(
          `[RSSDiscoveryProvider] Channel ID mismatch: expected ${expectedChannelId}, got ${channelId}. Skipping entry.`,
        );
        continue;
      }

      // Extract title: <title>VALUE</title>
      let title = '';
      const titleMatch = entryContent.match(/<title>([^<]*)<\/title>/i);
      if (titleMatch) {
        title = this.decodeXmlEntities(titleMatch[1].trim());
      }

      // Extract author/channel title: <author><name>VALUE</name>
      let channelTitle = '';
      const authorMatch = entryContent.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/i);
      if (authorMatch) {
        channelTitle = this.decodeXmlEntities(authorMatch[1].trim());
      }

      // Extract published date: <published>VALUE</published>
      let publishedAt = new Date().toISOString();
      const pubMatch = entryContent.match(/<published>([^<]+)<\/published>/i);
      if (pubMatch) {
        publishedAt = pubMatch[1].trim();
      }

      // Extract thumbnail: <media:thumbnail url="VALUE"
      let thumbnailUrl: string | undefined;
      const thumbMatch = entryContent.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
      if (thumbMatch) {
        thumbnailUrl = thumbMatch[1].trim();
      } else {
        thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }

      // Extract description: <media:description>VALUE</media:description>
      let description = '';
      const descMatch = entryContent.match(/<media:description>([\s\S]*?)<\/media:description>/i);
      if (descMatch) {
        description = this.decodeXmlEntities(descMatch[1].trim());
      }

      entries.push({
        videoId,
        channelId: channelId || expectedChannelId || '',
        title: title || 'Untitled Upload',
        channelTitle: channelTitle || 'YouTube Creator',
        publishedAt,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl,
        description,
      });
    }

    return entries;
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  /**
   * Fetches the public YouTube RSS feed for a monitored channel with timeout and error handling.
   */
  public async fetchChannelFeed(
    channelId: string,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<RssEntry[]> {
    const feedUrl = this.getFeedUrl(channelId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(feedUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/atom+xml, application/xml, text/xml',
          'User-Agent': 'ClipFlow/1.0 (PublicRssFeedBot)',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(
          `RSS_REQUEST_FAILED: Feed for channel ${channelId} returned HTTP ${res.status}: ${res.statusText}`,
        );
      }

      const xml = await res.text();
      return this.parseFeedXml(xml, channelId);
    } catch (err: any) {
      clearTimeout(timer);
      if (err.message?.startsWith('RSS_')) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new Error(
          `RSS_REQUEST_FAILED: Fetching RSS feed for channel ${channelId} timed out after ${timeoutMs}ms.`,
        );
      }
      throw new Error(`RSS_REQUEST_FAILED: Network error fetching feed: ${err.message}`);
    }
  }

  /**
   * Normalizes an RssEntry into a ClipFlow SourceVideo record.
   */
  public normalizeSourceVideo(
    entry: RssEntry,
    workspaceId: string,
    relevanceScore = 80,
    relevanceReason?: string,
    channelId?: string,
  ): SourceVideo {
    const canonicalChannelId = channelId || entry.channelId;
    return {
      id: `src_yt_${entry.videoId}`,
      workspaceId,
      externalId: entry.videoId,
      channelId: canonicalChannelId,
      authorId: entry.channelId || canonicalChannelId,
      platform: 'youtube',
      url: entry.url,
      title: entry.title,
      channelTitle: entry.channelTitle,
      thumbnailUrl: entry.thumbnailUrl || '',
      publishedAt: entry.publishedAt,
      duration: 0, // In RSS duration is not supplied; probed on downstream analysis
      description: entry.description || '',
      discoveredAt: new Date().toISOString(),
      relevanceScore,
      relevanceReason:
        relevanceReason ||
        `Discovered from monitored YouTube channel: ${entry.channelTitle} (Relevance: ${relevanceScore}/100).`,
      status: 'discovered',
    };
  }

  /**
   * Checks multiple monitored channels for new uploads and returns filtered, relevant SourceVideo records.
   */
  public async monitorChannels(
    channels: MonitoredChannel[],
    existingExternalIds: Set<string>,
    maxChannelsToCheck = 10,
    settings?: WorkspaceSettings,
  ): Promise<MonitorChannelsResult> {
    const activeChannels = channels.filter((c) => c.status !== 'paused').slice(0, maxChannelsToCheck);
    const newSources: SourceVideo[] = [];
    let videosChecked = 0;
    let videosAccepted = 0;
    let videosRejected = 0;
    let duplicatesSkipped = 0;
    const rejections: Array<{ videoId: string; title: string; reason: string }> = [];
    const channelUpdates: ChannelFeedUpdate[] = [];

    const feedPromises = activeChannels.map(async (ch) => {
      try {
        const entries = await this.fetchChannelFeed(ch.channelId);
        return { ch, entries, error: null };
      } catch (err: any) {
        return { ch, entries: [], error: err };
      }
    });

    const settledFeeds = await Promise.all(feedPromises);

    for (const { ch, entries, error } of settledFeeds) {
      const checkTime = new Date().toISOString();
      if (error) {
        console.warn(`[RSSDiscoveryProvider] Failed checking channel ${ch.channelId}:`, error.message);
        continue;
      }

      if (entries.length > 0) {
        const latest = entries[0];
        channelUpdates.push({
          channelId: ch.channelId,
          latestVideoId: latest.videoId,
          latestVideoTitle: latest.title,
          lastSuccessfulCheckAt: checkTime,
        });

        for (const entry of entries) {
          videosChecked++;

          // Critical invariant: Enforce video belongs strictly to THIS channel
          // video.authorId === channel.channelId
          const entryAuthorId = entry.channelId?.trim();
          const targetChannelId = ch.channelId?.trim();
          if (entryAuthorId && targetChannelId && entryAuthorId !== targetChannelId) {
            videosRejected++;
            rejections.push({
              videoId: entry.videoId,
              title: entry.title,
              reason: `VIDEO_CHANNEL_MISMATCH: Video authorId "${entryAuthorId}" does not match monitored channelId "${targetChannelId}". Rejected to maintain channel relationship integrity.`,
            });
            continue;
          }

          if (existingExternalIds.has(entry.videoId)) {
            duplicatesSkipped++;
            continue;
          }

          // Score video relevance if workspace settings are provided
          if (settings && settings.niche) {
            const relevance = VideoRelevanceScorer.scoreVideo(entry, ch, settings);

            if (!relevance.relevant) {
              videosRejected++;
              rejections.push({
                videoId: entry.videoId,
                title: entry.title,
                reason:
                  relevance.rejectionReason ||
                  `Video title and description do not sufficiently match active niche "${settings.niche}".`,
              });
              continue;
            }

            videosAccepted++;
            const relevanceReason = `Score ${relevance.score}/100: ${relevance.reasons.join(' · ')}`;
            const source = this.normalizeSourceVideo(
              entry,
              ch.workspaceId,
              relevance.score,
              relevanceReason,
              ch.channelId,
            );
            newSources.push(source);
            existingExternalIds.add(entry.videoId);
          } else {
            // Legacy/fallback path when settings are omitted
            videosAccepted++;
            const source = this.normalizeSourceVideo(
              entry,
              ch.workspaceId,
              ch.relevanceScore,
              undefined,
              ch.channelId,
            );
            newSources.push(source);
            existingExternalIds.add(entry.videoId);
          }
        }
      } else {
        channelUpdates.push({
          channelId: ch.channelId,
          lastSuccessfulCheckAt: checkTime,
        });
      }
    }

    return {
      newSources,
      totalChecked: activeChannels.length,
      videosChecked,
      videosAccepted,
      videosRejected,
      duplicatesSkipped,
      rejections,
      channelUpdates,
    };
  }

  /**
   * Implements IDiscoveryProvider interface.
   */
  async discover(
    settings: WorkspaceSettings,
    existingExternalIds: Set<string>,
  ): Promise<DiscoveryResult> {
    return {
      sources: [],
      totalDiscovered: 0,
      totalAccepted: 0,
      totalRejected: 0,
      providerName: this.name,
      queryAnglesUsed: [settings.niche],
      newVideos: 0,
      duplicatesSkipped: 0,
    };
  }
}
