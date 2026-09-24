import { RSSDiscoveryProvider } from '../../src/services/discovery/rss/rss-discovery.provider';
import { MonitoredChannel, SourceVideo } from '../../src/types';

const rssProvider = new RSSDiscoveryProvider();

export async function handler(event: any) {
  // Can be called via GET, POST or Netlify scheduled event trigger
  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    const channels: MonitoredChannel[] = payload.channels || [];
    const existingExternalIds: string[] = payload.existingExternalIds || [];
    const maxChannelsToCheck: number = payload.maxChannelsToCheck || 10;

    if (channels.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'No monitored channels provided for scheduled RSS check.',
          newSources: [],
          totalChecked: 0,
          duplicatesSkipped: 0,
        }),
      };
    }

    const existingSet = new Set<string>(existingExternalIds);
    const monitorResult = await rssProvider.monitorChannels(
      channels,
      existingSet,
      maxChannelsToCheck,
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newSources: monitorResult.newSources,
        totalChecked: monitorResult.totalChecked,
        duplicatesSkipped: monitorResult.duplicatesSkipped,
        channelUpdates: monitorResult.channelUpdates,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode: 'RSS_REQUEST_FAILED',
        errorMessage: err.message || 'Scheduled RSS monitoring failed.',
      }),
    };
  }
}
