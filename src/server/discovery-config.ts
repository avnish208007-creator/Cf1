/**
 * Server-only YouTube Data API Discovery Configuration
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * - Reads YOUTUBE_API_KEY only from server-side environment (process.env.YOUTUBE_API_KEY)
 * - Never returns the secret key to client code
 * - Never logs the secret key
 * - Never includes the secret key in API responses or serialized objects
 * - This module must NEVER be imported by client-side React code
 */

export interface DiscoveryProviderStatus {
  configured: boolean;
  provider: 'YouTube Data API v3';
  status: 'connected' | 'not_configured';
}

export interface ConnectionTestResult {
  success: boolean;
  status:
    | 'Connected'
    | 'Invalid API key'
    | 'Quota exceeded'
    | 'API not enabled'
    | 'Network error'
    | 'Not configured';
  errorCode?: string;
  message: string;
}

/**
 * Retrieves the YouTube Data API key strictly from server environment secrets.
 * Missing, empty, or whitespace-only keys return null.
 */
export function getYouTubeApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return null;
  }
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

/**
 * Checks if the YouTube Data API server secret is configured without exposing it.
 */
export function isYouTubeConfigured(): boolean {
  return getYouTubeApiKey() !== null;
}

/**
 * Returns public, safe provider status metadata for the client UI.
 */
export function getDiscoveryProviderStatus(): DiscoveryProviderStatus {
  const configured = isYouTubeConfigured();
  return {
    configured,
    provider: 'YouTube Data API v3',
    status: configured ? 'connected' : 'not_configured',
  };
}

/**
 * Performs a minimal, low-quota YouTube Data API request to verify connectivity.
 * Uses videoCategories.list which costs only 1 quota point (vs 100 points for search.list).
 * Never exposes the API key in the response or logs.
 */
export async function testYouTubeConnection(): Promise<ConnectionTestResult> {
  const key = getYouTubeApiKey();
  if (!key) {
    return {
      success: false,
      status: 'Not configured',
      errorCode: 'DISCOVERY_PROVIDER_UNAVAILABLE',
      message:
        'YouTube Data API is not configured in this AI Studio project\'s server secrets. Add YOUTUBE_API_KEY to Settings -> Secrets.',
    };
  }

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videoCategories');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('regionCode', 'US');
    url.searchParams.set('key', key);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      return {
        success: true,
        status: 'Connected',
        message: 'Production discovery is connected and ready.',
      };
    }

    const errData = await res.json().catch(() => ({}));
    const rawError = errData.error || {};
    const errMsg = (rawError.message || res.statusText || '').toLowerCase();
    const reason = rawError.errors?.[0]?.reason || '';

    if (
      res.status === 400 ||
      res.status === 403 &&
        (errMsg.includes('api key') ||
          errMsg.includes('invalid') ||
          reason === 'badRequest' ||
          reason === 'keyInvalid')
    ) {
      return {
        success: false,
        status: 'Invalid API key',
        errorCode: 'DISCOVERY_API_KEY_INVALID',
        message: 'The configured YouTube API key was rejected by YouTube (Invalid API key or unauthorized).',
      };
    }

    if (
      res.status === 403 &&
      (errMsg.includes('quota') || reason.includes('quota') || reason === 'dailyLimitExceeded')
    ) {
      return {
        success: false,
        status: 'Quota exceeded',
        errorCode: 'DISCOVERY_QUOTA_EXCEEDED',
        message: 'The YouTube Data API daily quota has been reached.',
      };
    }

    if (
      res.status === 403 &&
      (errMsg.includes('not enabled') ||
        errMsg.includes('accessnotconfigured') ||
        reason === 'accessNotConfigured')
    ) {
      return {
        success: false,
        status: 'API not enabled',
        errorCode: 'DISCOVERY_API_KEY_INVALID',
        message: 'YouTube Data API v3 is not enabled in the associated Google Cloud project.',
      };
    }

    return {
      success: false,
      status: 'Network error',
      errorCode: 'DISCOVERY_REQUEST_FAILED',
      message: `YouTube Data API returned HTTP ${res.status}: ${rawError.message || res.statusText}`,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'Network error',
      errorCode: 'DISCOVERY_REQUEST_FAILED',
      message: `Failed to connect to YouTube Data API endpoint: ${err.message || 'Network error'}`,
    };
  }
}
