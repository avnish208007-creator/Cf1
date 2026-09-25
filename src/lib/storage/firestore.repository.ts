import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db, getCachedUserId, sanitizeFirestoreData } from '../firebase';
import { IRepository, DiagnosticCounts } from './repository.interface';
import { LocalStorageRepository } from './local-storage.repository';
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

// Helper for fast cloud fetches with timeout safeguard
async function fetchWithTimeout<T>(promise: Promise<T>, timeoutMs = 500): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Firestore timeout')), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export class FirestoreRepository implements IRepository {
  public localFallback = new LocalStorageRepository();
  private cachedWorkspaceId: string | null = null;

  private getUserId(): string {
    return getCachedUserId();
  }

  // --- Workspace & Settings ---
  async getWorkspace(): Promise<Workspace | null> {
    // 1. Fast local read
    const localWs = await this.localFallback.getWorkspace();
    if (localWs) {
      this.cachedWorkspaceId = localWs.id;
    }

    // 2. Cloud sync attempt without blocking
    try {
      const userId = this.getUserId();
      const wsId = localWs?.id || this.cachedWorkspaceId || `ws_${userId.substring(0, 16)}`;

      const wsSnap = await fetchWithTimeout(getDoc(doc(db, 'workspaces', wsId)), 400);
      if (wsSnap.exists()) {
        const data = wsSnap.data() as Workspace;
        this.cachedWorkspaceId = data.id;
        await this.localFallback.saveWorkspace(data);
        return data;
      }
    } catch {
      // Offline or slow network - gracefully return local copy
    }

    return localWs;
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    const userId = this.getUserId();
    const wsWithUser = { ...workspace, userId: workspace.userId || userId };
    this.cachedWorkspaceId = workspace.id;

    await this.localFallback.saveWorkspace(wsWithUser);
    try {
      setDoc(doc(db, 'workspaces', workspace.id), sanitizeFirestoreData(wsWithUser)).catch(() => {});
    } catch {
      // Cloud write warning ignored for offline resilience
    }
  }

  async updateSettings(settings: Partial<WorkspaceSettings>): Promise<Workspace> {
    let current = await this.localFallback.getWorkspace();
    if (!current) {
      current = await this.getWorkspace();
    }
    if (!current) {
      throw new Error('No workspace active to update settings.');
    }

    const updated: Workspace = {
      ...current,
      settings: { ...current.settings, ...settings },
      updatedAt: new Date().toISOString(),
    };

    await this.saveWorkspace(updated);
    return updated;
  }

  async clearWorkspace(): Promise<void> {
    const current = await this.localFallback.getWorkspace();
    if (current) {
      try {
        deleteDoc(doc(db, 'workspaces', current.id)).catch(() => {});
      } catch {
        // safe fallback
      }
    }
    await this.localFallback.clearWorkspace();
    this.cachedWorkspaceId = null;
  }

  // --- Monitored Channels ---
  async getChannels(): Promise<MonitoredChannel[]> {
    const localChannels = await this.localFallback.getChannels();
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (!wsId) return localChannels;

    try {
      const snap = await fetchWithTimeout(
        getDocs(collection(db, 'workspaces', wsId, 'channels')),
        400,
      );
      const channels: MonitoredChannel[] = [];
      snap.forEach((d) => channels.push(d.data() as MonitoredChannel));

      if (channels.length > 0) {
        await this.localFallback.saveChannels(channels);
        return channels;
      }
    } catch {
      // Offline fallback
    }

    return localChannels;
  }

  async getChannelById(channelId: string): Promise<MonitoredChannel | null> {
    const channels = await this.getChannels();
    return channels.find((c) => c.channelId === channelId || c.id === channelId) || null;
  }

  async saveChannel(channel: MonitoredChannel): Promise<void> {
    await this.localFallback.saveChannel(channel);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'channels', channel.channelId),
        sanitizeFirestoreData({
          ...channel,
          id: channel.channelId,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
  }

  async saveChannels(channels: MonitoredChannel[]): Promise<void> {
    await Promise.all(channels.map((c) => this.saveChannel(c)));
  }

  async updateChannel(channelId: string, updates: Partial<MonitoredChannel>): Promise<MonitoredChannel> {
    const updated = await this.localFallback.updateChannel(channelId, updates);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'channels', channelId),
        sanitizeFirestoreData({
          ...updated,
          id: channelId,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
    return updated;
  }

  async deleteChannel(channelId: string): Promise<void> {
    await this.localFallback.deleteChannel(channelId);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      deleteDoc(doc(db, 'workspaces', wsId, 'channels', channelId)).catch(() => {});
    }
  }

  // --- Source Videos ---
  async getSources(): Promise<SourceVideo[]> {
    const localSources = await this.localFallback.getSources();
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (!wsId) return localSources;

    try {
      const snap = await fetchWithTimeout(
        getDocs(collection(db, 'workspaces', wsId, 'sources')),
        400,
      );
      const sources: SourceVideo[] = [];
      snap.forEach((d) => sources.push(d.data() as SourceVideo));

      if (sources.length > 0) {
        await this.localFallback.saveSources(sources);
        return sources;
      }
    } catch {
      // Offline fallback
    }

    return localSources;
  }

  async getSourceById(id: string): Promise<SourceVideo | null> {
    const sources = await this.getSources();
    return sources.find((s) => s.id === id) || null;
  }

  async saveSource(source: SourceVideo): Promise<void> {
    await this.localFallback.saveSource(source);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'sources', source.id),
        sanitizeFirestoreData({
          ...source,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
  }

  async saveSources(sources: SourceVideo[]): Promise<void> {
    await Promise.all(sources.map((s) => this.saveSource(s)));
  }

  async updateSource(id: string, updates: Partial<SourceVideo>): Promise<SourceVideo> {
    const updated = await this.localFallback.updateSource(id, updates);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'sources', id),
        sanitizeFirestoreData({
          ...updated,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
    return updated;
  }

  async deleteSource(id: string): Promise<void> {
    await this.localFallback.deleteSource(id);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      deleteDoc(doc(db, 'workspaces', wsId, 'sources', id)).catch(() => {});
    }
  }

  // --- Candidate Moments ---
  async getCandidates(): Promise<ClipCandidate[]> {
    const localCandidates = await this.localFallback.getCandidates();
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (!wsId) return localCandidates;

    try {
      const snap = await fetchWithTimeout(
        getDocs(collection(db, 'workspaces', wsId, 'candidates')),
        400,
      );
      const candidates: ClipCandidate[] = [];
      snap.forEach((d) => candidates.push(d.data() as ClipCandidate));

      if (candidates.length > 0) {
        await this.localFallback.saveCandidates(candidates);
        return candidates;
      }
    } catch {
      // Offline fallback
    }

    return localCandidates;
  }

  async getCandidatesBySourceId(sourceId: string): Promise<ClipCandidate[]> {
    const list = await this.getCandidates();
    return list.filter((c) => c.sourceId === sourceId);
  }

  async getCandidateById(id: string): Promise<ClipCandidate | null> {
    const list = await this.getCandidates();
    return list.find((c) => c.id === id) || null;
  }

  async saveCandidate(candidate: ClipCandidate): Promise<void> {
    await this.localFallback.saveCandidate(candidate);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'candidates', candidate.id),
        sanitizeFirestoreData({
          ...candidate,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
  }

  async saveCandidates(candidates: ClipCandidate[]): Promise<void> {
    await Promise.all(candidates.map((c) => this.saveCandidate(c)));
  }

  async updateCandidate(id: string, updates: Partial<ClipCandidate>): Promise<ClipCandidate> {
    const updated = await this.localFallback.updateCandidate(id, updates);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'candidates', id),
        sanitizeFirestoreData({
          ...updated,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
    return updated;
  }

  async deleteCandidate(id: string): Promise<void> {
    await this.localFallback.deleteCandidate(id);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      deleteDoc(doc(db, 'workspaces', wsId, 'candidates', id)).catch(() => {});
    }
  }

  // --- Rendered Clips ---
  async getClips(): Promise<Clip[]> {
    const localClips = await this.localFallback.getClips();
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (!wsId) return localClips;

    try {
      const snap = await fetchWithTimeout(
        getDocs(collection(db, 'workspaces', wsId, 'clips')),
        400,
      );
      const clips: Clip[] = [];
      snap.forEach((d) => clips.push(d.data() as Clip));

      if (clips.length > 0) {
        await Promise.all(clips.map((c) => this.localFallback.saveClip(c)));
        return clips;
      }
    } catch {
      // Offline fallback
    }

    return localClips;
  }

  async getClipById(id: string): Promise<Clip | null> {
    const clips = await this.getClips();
    return clips.find((c) => c.id === id) || null;
  }

  async saveClip(clip: Clip): Promise<void> {
    await this.localFallback.saveClip(clip);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'clips', clip.id),
        sanitizeFirestoreData({
          ...clip,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
  }

  async saveClips(clips: Clip[]): Promise<void> {
    await Promise.all(clips.map((c) => this.saveClip(c)));
  }

  async updateClip(id: string, updates: Partial<Clip>): Promise<Clip> {
    const updated = await this.localFallback.updateClip(id, updates);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'clips', id),
        sanitizeFirestoreData({
          ...updated,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
    return updated;
  }

  async deleteClip(id: string): Promise<void> {
    await this.localFallback.deleteClip(id);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      deleteDoc(doc(db, 'workspaces', wsId, 'clips', id)).catch(() => {});
    }
  }

  // --- Background Jobs ---
  async getJobs(): Promise<Job[]> {
    const localJobs = await this.localFallback.getJobs();
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (!wsId) return localJobs;

    try {
      const snap = await fetchWithTimeout(
        getDocs(collection(db, 'workspaces', wsId, 'jobs')),
        400,
      );
      const jobs: Job[] = [];
      snap.forEach((d) => jobs.push(d.data() as Job));

      if (jobs.length > 0) {
        return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } catch {
      // Offline fallback
    }

    return localJobs;
  }

  async getJobById(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find((j) => j.id === id) || null;
  }

  async saveJob(job: Job): Promise<void> {
    await this.localFallback.saveJob(job);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'jobs', job.id),
        sanitizeFirestoreData({
          ...job,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const updated = await this.localFallback.updateJob(id, updates);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'jobs', id),
        sanitizeFirestoreData({
          ...updated,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
    return updated;
  }

  async deleteJob(id: string): Promise<void> {
    await this.localFallback.deleteJob(id);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      deleteDoc(doc(db, 'workspaces', wsId, 'jobs', id)).catch(() => {});
    }
  }

  // --- Internal Queue ---
  async getQueueItems(): Promise<QueueItem[]> {
    const localQueue = await this.localFallback.getQueueItems();
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (!wsId) return localQueue;

    try {
      const snap = await fetchWithTimeout(
        getDocs(collection(db, 'workspaces', wsId, 'queue')),
        400,
      );
      const items: QueueItem[] = [];
      snap.forEach((d) => items.push(d.data() as QueueItem));

      if (items.length > 0) {
        return items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      }
    } catch {
      // Offline fallback
    }

    return localQueue;
  }

  async getQueueItemById(id: string): Promise<QueueItem | null> {
    const items = await this.getQueueItems();
    return items.find((q) => q.id === id) || null;
  }

  async saveQueueItem(item: QueueItem): Promise<void> {
    await this.localFallback.saveQueueItem(item);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'queue', item.id),
        sanitizeFirestoreData({
          ...item,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
  }

  async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<QueueItem> {
    const updated = await this.localFallback.updateQueueItem(id, updates);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      setDoc(
        doc(db, 'workspaces', wsId, 'queue', id),
        sanitizeFirestoreData({
          ...updated,
          workspaceId: wsId,
        }),
      ).catch(() => {});
    }
    return updated;
  }

  async deleteQueueItem(id: string): Promise<void> {
    await this.localFallback.deleteQueueItem(id);
    const wsId = this.cachedWorkspaceId || (await this.localFallback.getWorkspace())?.id;
    if (wsId) {
      deleteDoc(doc(db, 'workspaces', wsId, 'queue', id)).catch(() => {});
    }
  }

  // --- Utility ---
  async getDiagnosticCounts(): Promise<DiagnosticCounts> {
    const ws = await this.getWorkspace();
    const wsId = ws?.id || this.cachedWorkspaceId || 'unknown_workspace';

    let fsChannels = 0;
    let fsSources = 0;
    let fsCandidates = 0;
    let fsJobs = 0;

    try {
      const chSnap = await fetchWithTimeout(getDocs(collection(db, 'workspaces', wsId, 'channels')), 2000);
      fsChannels = chSnap.size;
    } catch {
      // Offline or fallback
    }

    try {
      const srcSnap = await fetchWithTimeout(getDocs(collection(db, 'workspaces', wsId, 'sources')), 2000);
      fsSources = srcSnap.size;
    } catch {
      // Offline or fallback
    }

    try {
      const candSnap = await fetchWithTimeout(getDocs(collection(db, 'workspaces', wsId, 'candidates')), 2000);
      fsCandidates = candSnap.size;
    } catch {
      // Offline or fallback
    }

    try {
      const jobSnap = await fetchWithTimeout(getDocs(collection(db, 'workspaces', wsId, 'jobs')), 2000);
      fsJobs = jobSnap.docs.filter((d) => (d.data() as Job).type === 'discovery').length;
    } catch {
      // Offline or fallback
    }

    const localCounts = await this.localFallback.getDiagnosticCounts();

    return {
      workspaceId: wsId,
      firestore: {
        channels: fsChannels,
        sources: fsSources,
        candidates: fsCandidates,
        jobs: fsJobs,
      },
      localStorage: localCounts.localStorage,
      timestamp: new Date().toISOString(),
    };
  }

  async resetDiscoveryData(): Promise<void> {
    const ws = await this.getWorkspace();
    const wsId = ws?.id || this.cachedWorkspaceId || 'default_workspace';
    const targetWorkspaces = Array.from(new Set([wsId, 'default_workspace']));

    for (const id of targetWorkspaces) {
      const colNames = ['channels', 'sources', 'candidates', 'jobs'];
      for (const colName of colNames) {
        try {
          const snap = await fetchWithTimeout(getDocs(collection(db, 'workspaces', id, colName)), 2000);
          const docsToDelete = snap.docs.filter((d) => {
            if (colName === 'jobs') {
              return (d.data() as Job).type === 'discovery';
            }
            return true;
          });
          await Promise.all(docsToDelete.map((d) => deleteDoc(d.ref)));
        } catch (err) {
          console.warn(`[FirestoreRepository] Reset error deleting ${colName} for workspace ${id}:`, err);
        }
      }
    }

    await this.localFallback.resetDiscoveryData();
  }

  async resetAll(): Promise<void> {
    await this.clearWorkspace();
    await this.localFallback.resetAll();
  }
}
