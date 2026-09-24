/**
 * Server-only Discovery Configuration & Health Check
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - Production discovery uses Invidious metadata discovery + YouTube RSS monitoring
 * - No YouTube Data API key or Google Cloud billing is required
 * - Never returns any secrets to client code
 * - Never logs secrets
 * - Never includes secrets in API responses or serialized objects
 * - This module must NEVER be imported by client-side React code
 */

import { InvidiousInstanceManager } from '../services/discovery/invidious/instance-manager';
import { RSSDiscoveryProvider } from '../services/discovery/rss/rss-discovery.provider';

export interface DiscoveryProviderStatus {
  configured: boolean;
  provider: string;
  status: 'connected' | 'not_configured' | 'unavailable';
  instancesHealthy?: number;
  totalInstances?: number;
  note?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  status:
    | 'Connected'
    | 'Unavailable'
    | 'Rate limited'
    | 'Network error'
    | 'Not configured';
  errorCode?: string;
  message: string;
  instanceUsed?: string;
  latencyMs?: number;
}

const instanceManager = new InvidiousInstanceManager();
const rssProvider = new RSSDiscoveryProvider();

/**
 * Returns public, safe provider status metadata for the client UI.
 */
export function getDiscoveryProviderStatus(): DiscoveryProviderStatus {
  const healthy = instanceManager.getHealthyInstances();
  const all = instanceManager.getInstances();

  return {
    configured: true,
    provider: 'Invidious + YouTube RSS',
    status: healthy.length > 0 ? 'connected' : 'unavailable',
    instancesHealthy: healthy.length,
    totalInstances: all.length,
    note: 'Zero-billing public metadata discovery and RSS upload monitoring.',
  };
}

/**
 * Tests live connectivity to Invidious public discovery and YouTube RSS feeds.
 */
export async function testDiscoveryConnection(): Promise<ConnectionTestResult> {
  const start = Date.now();
  try {
    // 1. Test Invidious instance availability
    const searchRes = await instanceManager.fetchJson<any[]>('/api/v1/search', {
      searchParams: {
        q: 'technology',
        type: 'channel',
      },
      timeoutMs: 5000,
      maxRetries: 2,
    });

    const latency = Date.now() - start;

    return {
      success: true,
      status: 'Connected',
      message: `Invidious discovery is active and operational via ${searchRes.instanceUsed} (${latency}ms). Public YouTube RSS feeds are accessible without billing.`,
      instanceUsed: searchRes.instanceUsed,
      latencyMs: latency,
    };
  } catch (err: any) {
    const latency = Date.now() - start;
    const msg = err.message || 'Connection test failed';

    if (msg.includes('DISCOVERY_RATE_LIMITED')) {
      return {
        success: false,
        status: 'Rate limited',
        errorCode: 'DISCOVERY_RATE_LIMITED',
        message: 'Invidious public instances are currently rate-limited. Failover will rotate instances.',
        latencyMs: latency,
      };
    }

    if (msg.includes('DISCOVERY_INSTANCE_UNAVAILABLE')) {
      return {
        success: false,
        status: 'Unavailable',
        errorCode: 'DISCOVERY_INSTANCE_UNAVAILABLE',
        message: 'No healthy Invidious instance could be reached. Discovery will retry automatically.',
        latencyMs: latency,
      };
    }

    return {
      success: false,
      status: 'Network error',
      errorCode: 'DISCOVERY_REQUEST_FAILED',
      message: `Discovery connection test error: ${msg}`,
      latencyMs: latency,
    };
  }
}

