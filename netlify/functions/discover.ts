import { InvidiousDiscoveryProvider } from '../../src/services/discovery/invidious/invidious-discovery.provider';
import { InvidiousInstanceManager } from '../../src/services/discovery/invidious/instance-manager';
import { RSSDiscoveryProvider } from '../../src/services/discovery/rss/rss-discovery.provider';
import { MonitoredChannel } from '../../src/types';

// Shared instance manager across invocations
const instanceManager = new InvidiousInstanceManager();
const invidiousProvider = new InvidiousDiscoveryProvider(instanceManager);
const rssProvider = new RSSDiscoveryProvider();

export async function handler(event: any) {
  const startTime = Date.now();

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { settings, existingExternalIds = [], monitoredChannels = [] } = payload;

    if (!settings || !settings.niche || typeof settings.niche !== 'string' || settings.niche.trim().length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: 'DISCOVERY_INVALID_NICHE',
          errorMessage: 'Active workspace niche is required to generate discovery angles.',
        }),
      };
    }

    const niche = settings.niche.trim();
    console.log(`[DISCOVERY] started`);
    console.log(`[DISCOVERY] niche=${niche}`);

    const existingExternalSet = new Set<string>(existingExternalIds);

    // 1. Discover relevant channels via Invidious channel search (type=channel only)
    const discoveredCandidates = await invidiousProvider.discoverChannels(settings, 15);
    console.log(`[DISCOVERY] channels found=${discoveredCandidates.length}`);

    // 2. Prepare MonitoredChannel objects from candidates and existing monitored channels
    const channelMap = new Map<string, MonitoredChannel>();

    for (const ch of monitoredChannels as MonitoredChannel[]) {
      if (ch.channelId) channelMap.set(ch.channelId, ch);
    }

    let channelsAdded = 0;
    const nowIso = new Date().toISOString();

    for (const cand of discoveredCandidates) {
      if (!channelMap.has(cand.channelId)) {
        channelMap.set(cand.channelId, {
          id: cand.channelId,
          workspaceId: settings.id || 'default_workspace',
          channelId: cand.channelId,
          channelName: cand.channelName,
          channelUrl: cand.channelUrl,
          rssUrl: rssProvider.getFeedUrl(cand.channelId),
          niche: settings.niche,
          relevanceScore: cand.relevanceScore,
          status: 'active',
          discoveredAt: cand.discoveredAt || nowIso,
          matchedQueries: cand.matchedQueries,
          thumbnailUrl: cand.thumbnail,
        });
        channelsAdded++;
      } else {
        const existing = channelMap.get(cand.channelId)!;
        if (cand.relevanceScore > existing.relevanceScore) {
          existing.relevanceScore = cand.relevanceScore;
        }
      }
    }

    const allChannels = Array.from(channelMap.values());
    console.log(`[DISCOVERY] channels accepted=${allChannels.length}`);

    if (allChannels.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: 'DISCOVERY_NO_CHANNELS_FOUND',
          errorMessage: `No YouTube channels could be discovered for niche "${settings.niche}". Please try refining your subtopics.`,
        }),
      };
    }

    console.log(`[DISCOVERY] RSS channels checked=${allChannels.slice(0, 10).length}`);

    // 3. Monitor YouTube RSS feeds for new uploads with independent Video Relevance Scoring
    const monitorResult = await rssProvider.monitorChannels(
      allChannels,
      existingExternalSet,
      10,
      settings,
    );

    console.log(`[DISCOVERY] videos checked=${monitorResult.videosChecked}`);
    console.log(`[DISCOVERY] videos accepted=${monitorResult.videosAccepted}`);
    console.log(`[DISCOVERY] videos rejected=${monitorResult.videosRejected}`);
    console.log(`[DISCOVERY] duplicates skipped=${monitorResult.duplicatesSkipped}`);

    // Update channels with last check info
    for (const update of monitorResult.channelUpdates) {
      const ch = channelMap.get(update.channelId);
      if (ch) {
        ch.lastCheckedAt = nowIso;
        ch.lastSuccessfulCheckAt = update.lastSuccessfulCheckAt;
        if (update.latestVideoId) ch.latestVideoId = update.latestVideoId;
        if (update.latestVideoTitle) ch.latestVideoTitle = update.latestVideoTitle;
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[DISCOVERY] completed in ${durationMs}ms`);

    const result = {
      sources: monitorResult.newSources,
      totalDiscovered: monitorResult.videosChecked,
      totalAccepted: monitorResult.videosAccepted,
      totalRejected: monitorResult.videosRejected,
      videosChecked: monitorResult.videosChecked,
      videosAccepted: monitorResult.videosAccepted,
      videosRejected: monitorResult.videosRejected,
      rejections: monitorResult.rejections,
      channelsDiscovered: discoveredCandidates.length,
      channelsAdded,
      newVideos: monitorResult.newSources.length,
      duplicatesSkipped: monitorResult.duplicatesSkipped,
      providerName: 'Invidious + YouTube RSS',
      queryAnglesUsed: invidiousProvider.generateQueries(settings),
      channels: Array.from(channelMap.values()),
      durationMs,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    const message = err.message || 'Discovery execution failed.';
    let errorCode = 'DISCOVERY_REQUEST_FAILED';
    let statusCode = 500;

    if (
      message.includes('DISCOVERY_INSTANCE_UNAVAILABLE') ||
      message.includes('DISCOVERY_PROVIDER_UNAVAILABLE')
    ) {
      errorCode = 'DISCOVERY_PROVIDER_UNAVAILABLE';
      statusCode = 503;
    } else if (message.includes('DISCOVERY_RATE_LIMITED')) {
      errorCode = 'DISCOVERY_RATE_LIMITED';
      statusCode = 429;
    } else if (message.includes('DISCOVERY_REQUEST_TIMEOUT')) {
      errorCode = 'DISCOVERY_REQUEST_TIMEOUT';
      statusCode = 504;
    } else if (message.includes('DISCOVERY_INVALID_NICHE')) {
      errorCode = 'DISCOVERY_INVALID_NICHE';
      statusCode = 400;
    } else if (message.includes('DISCOVERY_NO_CHANNELS_FOUND')) {
      errorCode = 'DISCOVERY_NO_CHANNELS_FOUND';
      statusCode = 404;
    } else if (message.includes('RSS_REQUEST_FAILED')) {
      errorCode = 'RSS_REQUEST_FAILED';
      statusCode = 502;
    } else if (message.includes('RSS_INVALID_RESPONSE')) {
      errorCode = 'RSS_INVALID_RESPONSE';
      statusCode = 502;
    }

    console.error(`[DISCOVERY] failed errorCode=${errorCode} message=${message}`);

    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode,
        errorMessage:
          errorCode === 'DISCOVERY_PROVIDER_UNAVAILABLE'
            ? 'All configured Invidious discovery instances are unavailable or rate-limited. Please retry in a few moments.'
            : message,
      }),
    };
  }
}
