export interface InvidiousInstance {
  baseUrl: string;
  healthy: boolean;
  latencyMs?: number;
  lastCheckedAt?: string;
  consecutiveFailures?: number;
  rateLimitedUntil?: number;
}

export interface InvidiousFetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  searchParams?: Record<string, string | number | undefined>;
}

export class InvidiousInstanceManager {
  // Built-in list of well-maintained public Invidious instances (HTTPS only)
  private static readonly DEFAULT_INSTANCES: string[] = [
    'https://invidious.f5.si',
    'https://yt.chocolatemoo53.com',
    'https://invidious.tiekoetter.com',
    'https://inv.nadeko.net',
  ];

  private instances: InvidiousInstance[] = [];
  private lastSelectedIdx = 0;
  private defaultTimeoutMs = 6000;

  constructor(customInstances?: string[]) {
    this.initInstances(customInstances);
  }

  private initInstances(customInstances?: string[]): void {
    const envInstances = process.env.INVIDIOUS_INSTANCES
      ? process.env.INVIDIOUS_INSTANCES.split(',').map((s) => s.trim())
      : [];

    const rawList = customInstances && customInstances.length > 0
      ? customInstances
      : envInstances.length > 0
      ? envInstances
      : InvidiousInstanceManager.DEFAULT_INSTANCES;

    // Security: Only accept valid, sanitized HTTPS URLs
    const sanitized = rawList
      .map((url) => this.sanitizeInstanceUrl(url))
      .filter((url): url is string => !!url);

    this.instances = sanitized.map((baseUrl) => ({
      baseUrl,
      healthy: true, // Assume optimistic initial state, verified on check/request
      consecutiveFailures: 0,
    }));
  }

  private sanitizeInstanceUrl(raw: string): string | null {
    try {
      const parsed = new URL(raw.trim());
      if (parsed.protocol !== 'https:') {
        return null; // Reject unencrypted HTTP
      }
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return null;
    }
  }

  public getInstances(): InvidiousInstance[] {
    return [...this.instances];
  }

  public getHealthyInstances(): InvidiousInstance[] {
    const now = Date.now();
    return this.instances.filter(
      (inst) => inst.healthy && (!inst.rateLimitedUntil || inst.rateLimitedUntil < now),
    );
  }

  public isHealthy(baseUrl: string): boolean {
    const inst = this.instances.find((i) => i.baseUrl === baseUrl);
    if (!inst) return false;
    const now = Date.now();
    return inst.healthy && (!inst.rateLimitedUntil || inst.rateLimitedUntil < now);
  }

  public markFailure(baseUrl: string, isRateLimit = false): void {
    const inst = this.instances.find((i) => i.baseUrl === baseUrl);
    if (!inst) return;

    inst.consecutiveFailures = (inst.consecutiveFailures || 0) + 1;
    inst.lastCheckedAt = new Date().toISOString();

    if (isRateLimit) {
      // Cooldown for 60 seconds on rate limit (HTTP 429)
      inst.rateLimitedUntil = Date.now() + 60000;
    }

    inst.healthy = false;
  }

  public markSuccess(baseUrl: string, latencyMs?: number): void {
    const inst = this.instances.find((i) => i.baseUrl === baseUrl);
    if (!inst) return;

    inst.healthy = true;
    inst.consecutiveFailures = 0;
    inst.rateLimitedUntil = undefined;
    inst.lastCheckedAt = new Date().toISOString();
    if (latencyMs !== undefined) {
      inst.latencyMs = latencyMs;
    }
  }

  public selectInstance(): InvidiousInstance {
    const available = this.getHealthyInstances();
    if (available.length === 0) {
      // Attempt to reset older failed instances if all are marked down
      for (const inst of this.instances) {
        if (!inst.rateLimitedUntil || inst.rateLimitedUntil < Date.now()) {
          inst.healthy = true;
          inst.consecutiveFailures = 0;
        }
      }
      const recovered = this.getHealthyInstances();
      if (recovered.length === 0) {
        throw new Error(
          'DISCOVERY_INSTANCE_UNAVAILABLE: No healthy Invidious discovery instance is currently available. All instances failed or are rate-limited.',
        );
      }
      return recovered[0];
    }

    // Round-robin selection to distribute load and prevent hammering one instance
    const chosen = available[this.lastSelectedIdx % available.length];
    this.lastSelectedIdx = (this.lastSelectedIdx + 1) % available.length;
    return chosen;
  }

  public async checkHealth(instance: InvidiousInstance, timeoutMs = 4000): Promise<boolean> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const endpoint = `${instance.baseUrl}/api/v1/stats`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const latency = Date.now() - start;
        this.markSuccess(instance.baseUrl, latency);
        return true;
      }

      this.markFailure(instance.baseUrl, res.status === 429);
      return false;
    } catch {
      this.markFailure(instance.baseUrl, false);
      return false;
    }
  }

  public async fetchJson<T>(
    endpointPath: string,
    options: InvidiousFetchOptions = {},
  ): Promise<{ data: T; instanceUsed: string; latencyMs: number }> {
    const maxRetries = options.maxRetries ?? 2;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    let lastError: Error | null = null;
    const attemptedInstances = new Set<string>();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let instance: InvidiousInstance;
      try {
        instance = this.selectInstance();
      } catch (err: any) {
        throw new Error(
          `DISCOVERY_INSTANCE_UNAVAILABLE: ${err.message || 'No discovery instances available.'}`,
        );
      }

      attemptedInstances.add(instance.baseUrl);

      const url = new URL(`${instance.baseUrl}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`);
      if (options.searchParams) {
        for (const [k, v] of Object.entries(options.searchParams)) {
          if (v !== undefined) {
            url.searchParams.set(k, String(v));
          }
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();

      try {
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        const latency = Date.now() - start;

        if (res.status === 429) {
          this.markFailure(instance.baseUrl, true);
          lastError = new Error(
            `DISCOVERY_RATE_LIMITED: Instance ${instance.baseUrl} returned HTTP 429 Too Many Requests.`,
          );
          // Exponential backoff wait before failover
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
          continue;
        }

        if (!res.ok) {
          this.markFailure(instance.baseUrl, false);
          lastError = new Error(
            `DISCOVERY_REQUEST_FAILED: Instance ${instance.baseUrl} returned HTTP ${res.status}: ${res.statusText}`,
          );
          continue;
        }

        const data = (await res.json()) as T;
        this.markSuccess(instance.baseUrl, latency);
        return { data, instanceUsed: instance.baseUrl, latencyMs: latency };
      } catch (fetchErr: any) {
        clearTimeout(timer);
        this.markFailure(instance.baseUrl, false);

        if (fetchErr.name === 'AbortError') {
          lastError = new Error(
            `DISCOVERY_REQUEST_TIMEOUT: Request to ${instance.baseUrl} timed out after ${timeoutMs}ms.`,
          );
        } else {
          lastError = new Error(
            `DISCOVERY_REQUEST_FAILED: Failed to fetch from ${instance.baseUrl}: ${fetchErr.message}`,
          );
        }

        // Exponential backoff before next attempt
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 150 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError || new Error('DISCOVERY_REQUEST_FAILED: All discovery attempts failed.');
  }
}
