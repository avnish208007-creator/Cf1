import { IRepository } from '../../lib/storage/repository.interface';
import { WorkspaceSettings, SourceVideo, MonitoredChannel, ChannelCandidate } from '../../types';
import { IDiscoveryProvider, DiscoveryResult } from './discovery.interface';
import { InvidiousDiscoveryProvider } from './invidious/invidious-discovery.provider';
import { InvidiousInstanceManager } from './invidious/instance-manager';
import { RSSDiscoveryProvider } from './rss/rss-discovery.provider';

export interface DiscoveryServiceLimits {
  maxChannelsPerWorkspace: number;
  maxQueriesPerRun: number;
  maxRssRequestsPerRun: number;
  requestTimeoutMs: number;
  maxRetries: number;
}

export const DEFAULT_DISCOVERY_LIMITS: DiscoveryServiceLimits = {
  maxChannelsPerWorkspace: 20,
  maxQueriesPerRun: 5,
  maxRssRequestsPerRun: 10,
  requestTimeoutMs: 7000,
  maxRetries: 2,
};

export class DiscoveryService {
  private invidiousProvider: InvidiousDiscoveryProvider;
  private rssProvider: RSSDiscoveryProvider;
  private limits: DiscoveryServiceLimits;

  constructor(
    private repo: IRepository,
    invidiousProvider?: InvidiousDiscoveryProvider,
    rssProvider?: RSSDiscoveryProvider,
    limits: Partial<DiscoveryServiceLimits> = {},
  ) {
    this.limits = { ...DEFAULT_DISCOVERY_LIMITS, ...limits };
    this.invidiousProvider =
      invidiousProvider || new InvidiousDiscoveryProvider(new InvidiousInstanceManager());
    this.rssProvider = rssProvider || new RSSDiscoveryProvider();
  }

  /**
   * Main discovery entry point:
   * Niche -> Queries -> Invidious Channel Search -> Channel Scoring -> Channel Registration -> RSS Feed Fetch -> Source Deduplication -> Persist Sources
   */
  async runDiscovery(settings: WorkspaceSettings): Promise<DiscoveryResult> {
    const niche = settings.niche?.trim();
    if (!niche) {
      throw new Error('DISCOVERY_INVALID_NICHE: Active workspace niche is required to generate discovery angles.');
    }

    const ws = await this.repo.getWorkspace();
    const workspaceId = ws?.id || 'ws_default';

    // 1. Invidious channel search & scoring
    let discoveredCandidates: ChannelCandidate[] = [];
    try {
      discoveredCandidates = await this.invidiousProvider.discoverChannels(
        settings,
        this.limits.maxChannelsPerWorkspace,
      );
    } catch (err: any) {
      if (err.message?.startsWith('DISCOVERY_')) {
        throw err;
      }
      throw new Error(`DISCOVERY_REQUEST_FAILED: Channel discovery failed: ${err.message}`);
    }

    if (discoveredCandidates.length === 0) {
      throw new Error(
        `DISCOVERY_NO_CHANNELS_FOUND: No relevant YouTube channels could be discovered for niche "${niche}". Try adjusting your subtopics or keywords.`,
      );
    }

    // 2. Load existing monitored channels from repository
    const existingChannels = await this.repo.getChannels();
    const existingChannelMap = new Map<string, MonitoredChannel>(
      existingChannels.map((c) => [c.channelId, c]),
    );

    let channelsAdded = 0;
    const channelsToSave: MonitoredChannel[] = [];

    for (const cand of discoveredCandidates) {
      const existing = existingChannelMap.get(cand.channelId);
      if (existing) {
        // Update relevance and matched queries if higher
        if (cand.relevanceScore > existing.relevanceScore) {
          existing.relevanceScore = cand.relevanceScore;
          existing.matchedQueries = Array.from(
            new Set([...(existing.matchedQueries || []), ...cand.matchedQueries]),
          );
          channelsToSave.push(existing);
        }
      } else {
        // Register new channel for monitoring
        const newMonitored: MonitoredChannel = {
          id: cand.channelId,
          workspaceId,
          channelId: cand.channelId,
          channelName: cand.channelName,
          channelUrl: cand.channelUrl,
          rssUrl: this.rssProvider.getFeedUrl(cand.channelId),
          niche: settings.niche,
          relevanceScore: cand.relevanceScore,
          status: 'active',
          discoveredAt: cand.discoveredAt,
          matchedQueries: cand.matchedQueries,
          thumbnailUrl: cand.thumbnail,
        };
        channelsToSave.push(newMonitored);
        existingChannelMap.set(cand.channelId, newMonitored);
        channelsAdded++;
      }
    }

    if (channelsToSave.length > 0) {
      await this.repo.saveChannels(channelsToSave);
    }

    // 3. Monitor RSS feeds of active channels for new uploads
    const allActiveChannels = Array.from(existingChannelMap.values());
    const existingSources = await this.repo.getSources();
    const existingExternalIds = new Set(existingSources.map((s) => s.externalId));

    const monitorResult = await this.rssProvider.monitorChannels(
      allActiveChannels,
      existingExternalIds,
      this.limits.maxRssRequestsPerRun,
      settings,
    );

    // Update channels with last check info and latest video metadata
    for (const update of monitorResult.channelUpdates) {
      const target = existingChannelMap.get(update.channelId);
      if (target) {
        target.lastCheckedAt = new Date().toISOString();
        target.lastSuccessfulCheckAt = update.lastSuccessfulCheckAt;
        if (update.latestVideoId) target.latestVideoId = update.latestVideoId;
        if (update.latestVideoTitle) target.latestVideoTitle = update.latestVideoTitle;
        await this.repo.updateChannel(update.channelId, {
          lastCheckedAt: target.lastCheckedAt,
          lastSuccessfulCheckAt: target.lastSuccessfulCheckAt,
          latestVideoId: target.latestVideoId,
          latestVideoTitle: target.latestVideoTitle,
        });
      }
    }

    // 4. Save new discovered source records
    if (monitorResult.newSources.length > 0) {
      await this.repo.saveSources(monitorResult.newSources);
    }

    const allMonitored = await this.repo.getChannels();

    return {
      sources: monitorResult.newSources,
      totalDiscovered: monitorResult.videosChecked,
      totalAccepted: monitorResult.videosAccepted,
      totalRejected: monitorResult.videosRejected,
      videosChecked: monitorResult.videosChecked,
      videosAccepted: monitorResult.videosAccepted,
      videosRejected: monitorResult.videosRejected,
      rejections: monitorResult.rejections.map((r) => ({ id: r.videoId, title: r.title, reason: r.reason })),
      channelsDiscovered: discoveredCandidates.length,
      channelsAdded,
      newVideos: monitorResult.newSources.length,
      duplicatesSkipped: monitorResult.duplicatesSkipped,
      providerName: 'Invidious + YouTube RSS',
      queryAnglesUsed: this.invidiousProvider.generateQueries(settings),
      channels: allMonitored,
    };
  }

  /**
   * Periodic / Scheduled RSS monitoring: checks monitored channels for new uploads.
   */
  async runScheduledRssCheck(): Promise<{
    newSources: SourceVideo[];
    channelsChecked: number;
    duplicatesSkipped: number;
  }> {
    const channels = await this.repo.getChannels();
    const active = channels.filter((c) => c.status !== 'paused');

    if (active.length === 0) {
      return { newSources: [], channelsChecked: 0, duplicatesSkipped: 0 };
    }

    const existingSources = await this.repo.getSources();
    const existingIds = new Set(existingSources.map((s) => s.externalId));

    const ws = await this.repo.getWorkspace();
    const result = await this.rssProvider.monitorChannels(
      active,
      existingIds,
      this.limits.maxRssRequestsPerRun,
      ws?.settings,
    );

    if (result.newSources.length > 0) {
      await this.repo.saveSources(result.newSources);
    }

    for (const update of result.channelUpdates) {
      await this.repo.updateChannel(update.channelId, {
        lastCheckedAt: new Date().toISOString(),
        lastSuccessfulCheckAt: update.lastSuccessfulCheckAt,
        latestVideoId: update.latestVideoId,
        latestVideoTitle: update.latestVideoTitle,
      });
    }

    return {
      newSources: result.newSources,
      channelsChecked: result.totalChecked,
      duplicatesSkipped: result.duplicatesSkipped,
    };
  }
}
