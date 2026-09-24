import { YouTubeDataApiProvider } from '../../src/services/discovery/youtube-data.provider';
import { getYouTubeApiKey } from '../../src/server/discovery-config';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { settings, existingExternalIds = [] } = payload;

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

    // Server-only key acquisition: read strictly from server secrets (process.env.YOUTUBE_API_KEY)
    // Never accept key from client settings or check unrelated variables.
    const apiKey = getYouTubeApiKey();

    if (!apiKey) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode: 'DISCOVERY_PROVIDER_UNAVAILABLE',
          errorMessage:
            'YouTube Data API v3 is not configured in the server environment. Add YOUTUBE_API_KEY to the Google AI Studio Secrets.',
        }),
      };
    }

    const provider = new YouTubeDataApiProvider(apiKey);
    const result = await provider.discover(settings, new Set(existingExternalIds));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    const message = err.message || 'Discovery execution failed.';
    let errorCode = 'DISCOVERY_REQUEST_FAILED';
    let statusCode = 500;

    if (message.includes('DISCOVERY_QUOTA_EXCEEDED')) {
      errorCode = 'DISCOVERY_QUOTA_EXCEEDED';
      statusCode = 429;
    } else if (message.includes('DISCOVERY_API_KEY_INVALID')) {
      errorCode = 'DISCOVERY_API_KEY_INVALID';
      statusCode = 400;
    } else if (message.includes('DISCOVERY_INVALID_NICHE')) {
      errorCode = 'DISCOVERY_INVALID_NICHE';
      statusCode = 400;
    } else if (message.includes('DISCOVERY_PROVIDER_UNAVAILABLE')) {
      errorCode = 'DISCOVERY_PROVIDER_UNAVAILABLE';
      statusCode = 400;
    }

    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorCode,
        errorMessage: message,
      }),
    };
  }
}
