import { IDiscoveryProvider, DiscoveryResult, DiscoveryRejection } from './discovery.interface';
import { SourceVideo, WorkspaceSettings } from '../../types';
import { SourceAnalyzer } from '../analysis/source-analyzer';

export class YouTubeDataApiProvider implements IDiscoveryProvider {
  readonly id = 'youtube_data_api';
  readonly name = 'YouTube Data API v3';

  constructor(private apiKey?: string) {}

  get isConnected(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 10);
  }

  // Parse ISO 8601 duration e.g. PT14M33S -> 873 seconds
  private parseIsoDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  async discover(
    settings: WorkspaceSettings,
    existingExternalIds: Set<string>,
  ): Promise<DiscoveryResult> {
    if (!this.isConnected || !this.apiKey) {
      throw new Error(
        'DISCOVERY_PROVIDER_UNAVAILABLE: YouTube Data API v3 key is not configured. Please configure your API key in Workspace Settings.',
      );
    }

    if (!settings.niche || settings.niche.trim().length === 0) {
      throw new Error(
        'DISCOVERY_INVALID_NICHE: Active workspace niche is required to generate discovery angles.',
      );
    }

    const baseNiche = settings.niche.trim();

    // Build multiple query angles dynamically based on user niche + subtopics + style
    const queries: string[] = [];
    if (settings.subtopics && settings.subtopics.length > 0) {
      for (const sub of settings.subtopics.slice(0, 3)) {
        const cleanSub = sub.trim();
        if (!cleanSub) continue;
        queries.push(`${baseNiche} ${cleanSub} breakdown`);
        queries.push(`how to ${baseNiche} ${cleanSub}`);
      }
    }
    if (queries.length === 0) {
      queries.push(`${baseNiche} guide tutorial`);
      queries.push(`${baseNiche} breakdown analysis`);
      queries.push(`${baseNiche} best advice`);
    }

    const acceptedSources: SourceVideo[] = [];
    const rejections: DiscoveryRejection[] = [];
    const queryAnglesUsed: string[] = [];
    const inFlightIds = new Set<string>(existingExternalIds);

    for (const query of queries.slice(0, 4)) {
      queryAnglesUsed.push(query);

      try {
        const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
        searchUrl.searchParams.set('part', 'snippet');
        searchUrl.searchParams.set('q', query);
        searchUrl.searchParams.set('type', 'video');
        searchUrl.searchParams.set('videoDuration', 'medium'); // 4 to 20 mins: high-density moment extraction window
        searchUrl.searchParams.set('maxResults', '6');
        searchUrl.searchParams.set('relevanceLanguage', settings.language || 'en');
        searchUrl.searchParams.set('key', this.apiKey);

        const res = await fetch(searchUrl.toString());
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg = errBody.error?.message || res.statusText;
          if (res.status === 403 && (msg.includes('quota') || msg.includes('Quota'))) {
            throw new Error(
              `DISCOVERY_QUOTA_EXCEEDED: YouTube Data API v3 daily quota limit reached (${msg}). Please try again tomorrow or supply a different API key.`,
            );
          }
          if (res.status === 400 || (res.status === 403 && msg.includes('API key'))) {
            throw new Error(
              `DISCOVERY_API_KEY_INVALID: YouTube Data API v3 key is invalid or lacks access permissions (${msg}).`,
            );
          }
          throw new Error(`YouTube Search API error (${res.status}): ${msg}`);
        }

        const data = await res.json();
        const items = data.items || [];
        const candidateIds: string[] = [];

        for (const item of items) {
          const vidId = item.id?.videoId;
          if (!vidId) {
            rejections.push({
              title: item.snippet?.title || 'Unknown',
              reason: 'Missing YouTube video ID in search item.',
            });
            continue;
          }

          // Deduplication check
          if (inFlightIds.has(vidId)) {
            continue;
          }

          candidateIds.push(vidId);
        }

        if (candidateIds.length === 0) continue;

        // Fetch detailed video contentDetails for exact duration and status verification
        const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        detailsUrl.searchParams.set('part', 'snippet,contentDetails,status');
        detailsUrl.searchParams.set('id', candidateIds.join(','));
        detailsUrl.searchParams.set('key', this.apiKey);

        const detailsRes = await fetch(detailsUrl.toString());
        if (!detailsRes.ok) {
          const detailsErr = await detailsRes.json().catch(() => ({}));
          throw new Error(
            `YouTube Video Details API error (${detailsRes.status}): ${detailsErr.error?.message || detailsRes.statusText}`,
          );
        }

        const detailsData = await detailsRes.json();
        const detailedItems = detailsData.items || [];

        for (const item of detailedItems) {
          const vidId = item.id;
          if (inFlightIds.has(vidId)) continue;

          const snippet = item.snippet;
          const contentDetails = item.contentDetails;

          // 1. Validate title
          if (!snippet || !snippet.title || snippet.title.trim().length < 4) {
            inFlightIds.add(vidId);
            rejections.push({
              id: vidId,
              title: snippet?.title || 'Unknown',
              reason: 'Source rejected: Title is missing or too brief for meaningful content analysis.',
            });
            continue;
          }

          // 2. Reject deleted / private placeholders
          const lowerTitle = snippet.title.toLowerCase();
          if (lowerTitle.includes('[deleted video]') || lowerTitle.includes('[private video]')) {
            inFlightIds.add(vidId);
            rejections.push({
              id: vidId,
              title: snippet.title,
              reason: 'Source rejected: Video has been deleted or marked private on YouTube.',
            });
            continue;
          }

          // 3. Validate duration
          const durationSeconds = this.parseIsoDuration(contentDetails?.duration || '');
          if (durationSeconds < 15) {
            inFlightIds.add(vidId);
            rejections.push({
              id: vidId,
              title: snippet.title,
              reason: `Source rejected: Video duration (${durationSeconds}s) is shorter than minimum required 15s.`,
            });
            continue;
          }

          // 4. Validate channel
          if (!snippet.channelTitle || snippet.channelTitle.trim().length === 0) {
            inFlightIds.add(vidId);
            rejections.push({
              id: vidId,
              title: snippet.title,
              reason: 'Source rejected: Missing channel publisher metadata.',
            });
            continue;
          }

          // Mark as processed to prevent duplicates
          inFlightIds.add(vidId);

          // Build canonical normalized SourceVideo record
          const rawSource: SourceVideo = {
            id: `src_yt_${vidId}`,
            externalId: vidId,
            platform: 'youtube',
            provider: this.name,
            url: `https://www.youtube.com/watch?v=${vidId}`,
            title: snippet.title,
            channelTitle: snippet.channelTitle,
            thumbnailUrl:
              snippet.thumbnails?.high?.url ||
              snippet.thumbnails?.medium?.url ||
              snippet.thumbnails?.default?.url ||
              '',
            publishedAt: snippet.publishedAt || new Date().toISOString(),
            duration: durationSeconds,
            description: snippet.description || '',
            discoveryQuery: query,
            discoveredAt: new Date().toISOString(),
            relevanceScore: 0,
            relevanceReason: '',
            status: 'discovered',
          };

          // Perform initial relevance analysis and calculate transparent rank score
          const analysis = SourceAnalyzer.analyze(rawSource, settings);
          const rankScore = SourceAnalyzer.calculateRankScore(rawSource, analysis);

          rawSource.relevanceScore = analysis.relevance;
          rawSource.rankScore = rankScore;
          rawSource.relevanceReason = `Discovered via query angle "${query}" with ${analysis.relevance}% affinity for "${baseNiche}". Categorized as ${analysis.topicCategory}.`;

          acceptedSources.push(rawSource);
        }
      } catch (err: any) {
        // Bubble up terminal failures like quota or invalid keys
        if (
          err.message.includes('DISCOVERY_QUOTA_EXCEEDED') ||
          err.message.includes('DISCOVERY_API_KEY_INVALID')
        ) {
          throw err;
        }
        console.warn(`Query angle "${query}" encountered an error:`, err.message);
      }
    }

    // Sort accepted sources by transparent rankScore descending
    acceptedSources.sort((a, b) => (b.rankScore || b.relevanceScore) - (a.rankScore || a.relevanceScore));

    return {
      sources: acceptedSources,
      totalDiscovered: acceptedSources.length + rejections.length,
      totalAccepted: acceptedSources.length,
      totalRejected: rejections.length,
      rejections,
      providerName: this.name,
      queryAnglesUsed,
    };
  }
}

