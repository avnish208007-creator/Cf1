import { YouTubeDataApiProvider } from '../../src/services/discovery/youtube-data.provider';
import { DevAuthorizedDiscoveryProvider } from '../../src/services/discovery/dev-discovery.provider';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { settings, existingExternalIds = [] } = payload;

    if (!settings || !settings.niche) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          errorCode: 'INVALID_CONFIG',
          errorMessage: 'Settings with a valid niche are required for discovery.',
        }),
      };
    }

    let provider = null;
    const apiKey = settings.youtubeApiKey?.trim() || process.env.YOUTUBE_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    if (apiKey && apiKey.length > 10) {
      provider = new YouTubeDataApiProvider(apiKey);
    }

    if (!provider || !provider.isConnected) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: 'DISCOVERY_PROVIDER_UNAVAILABLE',
          errorMessage:
            'YouTube Data API v3 key is required for video discovery. YouTube Data API serves strictly as a metadata and discovery service. Production discovery never injects development test media.',
        }),
      };
    }

    const result = await provider.discover(settings, new Set(existingExternalIds));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode: 'DISCOVERY_FAILED',
        errorMessage: err.message || 'Discovery execution failed.',
      }),
    };
  }
}
