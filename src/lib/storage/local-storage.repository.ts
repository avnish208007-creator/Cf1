import {
  Workspace,
  WorkspaceSettings,
  SourceVideo,
  ClipCandidate,
  Clip,
  Job,
  QueueItem,
  MonitoredChannel,
} from '../../types';
import { IRepository, DiagnosticCounts } from './repository.interface';

const STORAGE_KEYS = {
  WORKSPACE: 'clipflow:v1:workspace',
  CHANNELS: 'clipflow:v1:channels',
  SOURCES: 'clipflow:v1:sources',
  CANDIDATES: 'clipflow:v1:candidates',
  CLIPS: 'clipflow:v1:clips',
  JOBS: 'clipflow:v1:jobs',
  QUEUE: 'clipflow:v1:queue',
} as const;

const memoryStore = new Map<string, string>();

export class LocalStorageRepository implements IRepository {
  private read<T>(key: string, defaultValue: T): T {
    try {
      if (typeof localStorage === 'undefined') {
        const raw = memoryStore.get(key);
        if (!raw) return defaultValue;
        return JSON.parse(raw) as T;
      }
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.error(`[LocalStorageRepository] Error reading key "${key}":`, err);
      return defaultValue;
    }
  }

  private write<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      if (typeof localStorage === 'undefined') {
        memoryStore.set(key, serialized);
        return;
      }
      localStorage.setItem(key, serialized);
    } catch (err) {
      console.error(`[LocalStorageRepository] Error writing key "${key}":`, err);
      throw new Error(`Storage operation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- Workspace & Settings ---

  async getWorkspace(): Promise<Workspace | null> {
    return this.read<Workspace | null>(STORAGE_KEYS.WORKSPACE, null);
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    this.write(STORAGE_KEYS.WORKSPACE, workspace);
  }

  async updateSettings(settings: Partial<WorkspaceSettings>): Promise<Workspace> {
    const ws = await this.getWorkspace();
    if (!ws) {
      throw new Error('Cannot update settings: No workspace exists.');
    }
    const updated: Workspace = {
      ...ws,
      settings: {
        ...ws.settings,
        ...settings,
      },
      updatedAt: new Date().toISOString(),
    };
    this.write(STORAGE_KEYS.WORKSPACE, updated);
    return updated;
  }

  async clearWorkspace(): Promise<void> {
    localStorage.removeItem(STORAGE_KEYS.WORKSPACE);
  }

  // --- Monitored Channels ---

  async getChannels(): Promise<MonitoredChannel[]> {
    return this.read<MonitoredChannel[]>(STORAGE_KEYS.CHANNELS, []);
  }

  async getChannelById(channelId: string): Promise<MonitoredChannel | null> {
    const list = await this.getChannels();
    return list.find((c) => c.channelId === channelId || c.id === channelId) || null;
  }

  async saveChannel(channel: MonitoredChannel): Promise<void> {
    const list = await this.getChannels();
    const index = list.findIndex((c) => c.channelId === channel.channelId || c.id === channel.id);
    if (index >= 0) {
      list[index] = channel;
    } else {
      list.unshift(channel);
    }
    this.write(STORAGE_KEYS.CHANNELS, list);
  }

  async saveChannels(channels: MonitoredChannel[]): Promise<void> {
    const list = await this.getChannels();
    const map = new Map<string, MonitoredChannel>(list.map((c) => [c.channelId, c]));
    for (const ch of channels) {
      map.set(ch.channelId, ch);
    }
    this.write(STORAGE_KEYS.CHANNELS, Array.from(map.values()));
  }

  async updateChannel(channelId: string, updates: Partial<MonitoredChannel>): Promise<MonitoredChannel> {
    const list = await this.getChannels();
    const index = list.findIndex((c) => c.channelId === channelId || c.id === channelId);
    if (index < 0) throw new Error(`Channel with ID ${channelId} not found.`);
    const updated: MonitoredChannel = { ...list[index], ...updates };
    list[index] = updated;
    this.write(STORAGE_KEYS.CHANNELS, list);
    return updated;
  }

  async deleteChannel(channelId: string): Promise<void> {
    const list = await this.getChannels();
    const filtered = list.filter((c) => c.channelId !== channelId && c.id !== channelId);
    this.write(STORAGE_KEYS.CHANNELS, filtered);
  }

  // --- Sources ---

  async getSources(): Promise<SourceVideo[]> {
    return this.read<SourceVideo[]>(STORAGE_KEYS.SOURCES, []);
  }

  async getSourceById(id: string): Promise<SourceVideo | null> {
    const list = await this.getSources();
    return list.find((s) => s.id === id) || null;
  }

  async saveSource(source: SourceVideo): Promise<void> {
    const list = await this.getSources();
    const index = list.findIndex((s) => s.id === source.id);
    if (index >= 0) {
      list[index] = source;
    } else {
      list.unshift(source);
    }
    this.write(STORAGE_KEYS.SOURCES, list);
  }

  async saveSources(sources: SourceVideo[]): Promise<void> {
    const list = await this.getSources();
    const map = new Map<string, SourceVideo>(list.map((s) => [s.id, s]));
    for (const s of sources) {
      map.set(s.id, s);
    }
    this.write(STORAGE_KEYS.SOURCES, Array.from(map.values()));
  }

  async updateSource(id: string, updates: Partial<SourceVideo>): Promise<SourceVideo> {
    const list = await this.getSources();
    const index = list.findIndex((s) => s.id === id);
    if (index < 0) throw new Error(`Source with ID ${id} not found.`);
    const updated: SourceVideo = { ...list[index], ...updates };
    list[index] = updated;
    this.write(STORAGE_KEYS.SOURCES, list);
    return updated;
  }

  async deleteSource(id: string): Promise<void> {
    const list = await this.getSources();
    this.write(
      STORAGE_KEYS.SOURCES,
      list.filter((s) => s.id !== id),
    );
  }

  // --- Candidates ---

  async getCandidates(): Promise<ClipCandidate[]> {
    return this.read<ClipCandidate[]>(STORAGE_KEYS.CANDIDATES, []);
  }

  async getCandidatesBySourceId(sourceId: string): Promise<ClipCandidate[]> {
    const list = await this.getCandidates();
    return list.filter((c) => c.sourceVideoId === sourceId);
  }

  async getCandidateById(id: string): Promise<ClipCandidate | null> {
    const list = await this.getCandidates();
    return list.find((c) => c.id === id) || null;
  }

  async saveCandidate(candidate: ClipCandidate): Promise<void> {
    const list = await this.getCandidates();
    const index = list.findIndex((c) => c.id === candidate.id);
    if (index >= 0) {
      list[index] = candidate;
    } else {
      list.unshift(candidate);
    }
    this.write(STORAGE_KEYS.CANDIDATES, list);
  }

  async saveCandidates(candidates: ClipCandidate[]): Promise<void> {
    const list = await this.getCandidates();
    const map = new Map<string, ClipCandidate>(list.map((c) => [c.id, c]));
    for (const c of candidates) {
      map.set(c.id, c);
    }
    this.write(STORAGE_KEYS.CANDIDATES, Array.from(map.values()));
  }

  async updateCandidate(
    id: string,
    updates: Partial<ClipCandidate>,
  ): Promise<ClipCandidate> {
    const list = await this.getCandidates();
    const index = list.findIndex((c) => c.id === id);
    if (index < 0) throw new Error(`Candidate with ID ${id} not found.`);
    const updated: ClipCandidate = { ...list[index], ...updates };
    list[index] = updated;
    this.write(STORAGE_KEYS.CANDIDATES, list);
    return updated;
  }

  async deleteCandidate(id: string): Promise<void> {
    const list = await this.getCandidates();
    this.write(
      STORAGE_KEYS.CANDIDATES,
      list.filter((c) => c.id !== id),
    );
  }

  // --- Clips ---

  async getClips(): Promise<Clip[]> {
    return this.read<Clip[]>(STORAGE_KEYS.CLIPS, []);
  }

  async getClipById(id: string): Promise<Clip | null> {
    const list = await this.getClips();
    return list.find((c) => c.id === id) || null;
  }

  async saveClip(clip: Clip): Promise<void> {
    const list = await this.getClips();
    const index = list.findIndex((c) => c.id === clip.id);
    if (index >= 0) {
      list[index] = clip;
    } else {
      list.unshift(clip);
    }
    this.write(STORAGE_KEYS.CLIPS, list);
  }

  async updateClip(id: string, updates: Partial<Clip>): Promise<Clip> {
    const list = await this.getClips();
    const index = list.findIndex((c) => c.id === id);
    if (index < 0) throw new Error(`Clip with ID ${id} not found.`);
    const updated: Clip = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    list[index] = updated;
    this.write(STORAGE_KEYS.CLIPS, list);
    return updated;
  }

  async deleteClip(id: string): Promise<void> {
    const list = await this.getClips();
    this.write(
      STORAGE_KEYS.CLIPS,
      list.filter((c) => c.id !== id),
    );
  }

  // --- Jobs ---

  async getJobs(): Promise<Job[]> {
    return this.read<Job[]>(STORAGE_KEYS.JOBS, []);
  }

  async getJobById(id: string): Promise<Job | null> {
    const list = await this.getJobs();
    return list.find((j) => j.id === id) || null;
  }

  async saveJob(job: Job): Promise<void> {
    const list = await this.getJobs();
    const index = list.findIndex((j) => j.id === job.id);
    if (index >= 0) {
      list[index] = job;
    } else {
      list.unshift(job);
    }
    this.write(STORAGE_KEYS.JOBS, list);
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const list = await this.getJobs();
    const index = list.findIndex((j) => j.id === id);
    if (index < 0) throw new Error(`Job with ID ${id} not found.`);
    const updated: Job = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    list[index] = updated;
    this.write(STORAGE_KEYS.JOBS, list);
    return updated;
  }

  async deleteJob(id: string): Promise<void> {
    const list = await this.getJobs();
    this.write(
      STORAGE_KEYS.JOBS,
      list.filter((j) => j.id !== id),
    );
  }

  // --- Queue ---

  async getQueueItems(): Promise<QueueItem[]> {
    return this.read<QueueItem[]>(STORAGE_KEYS.QUEUE, []);
  }

  async getQueueItemById(id: string): Promise<QueueItem | null> {
    const list = await this.getQueueItems();
    return list.find((q) => q.id === id) || null;
  }

  async saveQueueItem(item: QueueItem): Promise<void> {
    const list = await this.getQueueItems();
    const index = list.findIndex((q) => q.id === item.id);
    if (index >= 0) {
      list[index] = item;
    } else {
      list.push(item);
    }
    this.write(STORAGE_KEYS.QUEUE, list);
  }

  async updateQueueItem(
    id: string,
    updates: Partial<QueueItem>,
  ): Promise<QueueItem> {
    const list = await this.getQueueItems();
    const index = list.findIndex((q) => q.id === id);
    if (index < 0) throw new Error(`Queue item with ID ${id} not found.`);
    const updated: QueueItem = { ...list[index], ...updates };
    list[index] = updated;
    this.write(STORAGE_KEYS.QUEUE, list);
    return updated;
  }

  async deleteQueueItem(id: string): Promise<void> {
    const list = await this.getQueueItems();
    this.write(
      STORAGE_KEYS.QUEUE,
      list.filter((q) => q.id !== id),
    );
  }

  async resetDiscoveryData(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.CHANNELS);
      localStorage.removeItem(STORAGE_KEYS.SOURCES);
      localStorage.removeItem(STORAGE_KEYS.CANDIDATES);
      const jobs = this.read<Job[]>(STORAGE_KEYS.JOBS, []);
      this.write(
        STORAGE_KEYS.JOBS,
        jobs.filter((j) => j.type !== 'discovery'),
      );
    } else {
      memoryStore.delete(STORAGE_KEYS.CHANNELS);
      memoryStore.delete(STORAGE_KEYS.SOURCES);
      memoryStore.delete(STORAGE_KEYS.CANDIDATES);
      const jobs = this.read<Job[]>(STORAGE_KEYS.JOBS, []);
      this.write(
        STORAGE_KEYS.JOBS,
        jobs.filter((j) => j.type !== 'discovery'),
      );
    }
  }

  async getDiagnosticCounts(): Promise<DiagnosticCounts> {
    const ws = await this.getWorkspace();
    const channels = await this.getChannels();
    const sources = await this.getSources();
    const candidates = await this.getCandidates();
    const jobs = await this.getJobs();
    const discoveryJobs = jobs.filter((j) => j.type === 'discovery');

    return {
      workspaceId: ws?.id || 'unknown_workspace',
      firestore: {
        channels: 0,
        sources: 0,
        candidates: 0,
        jobs: 0,
      },
      localStorage: {
        channels: channels.length,
        sources: sources.length,
        candidates: candidates.length,
        jobs: discoveryJobs.length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async resetAll(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.WORKSPACE);
      localStorage.removeItem(STORAGE_KEYS.CHANNELS);
      localStorage.removeItem(STORAGE_KEYS.SOURCES);
      localStorage.removeItem(STORAGE_KEYS.CANDIDATES);
      localStorage.removeItem(STORAGE_KEYS.CLIPS);
      localStorage.removeItem(STORAGE_KEYS.JOBS);
      localStorage.removeItem(STORAGE_KEYS.QUEUE);
    } else {
      memoryStore.clear();
    }
  }
}

// Singleton repository instance to guarantee ONE source of truth
export const repository: IRepository = new LocalStorageRepository();
