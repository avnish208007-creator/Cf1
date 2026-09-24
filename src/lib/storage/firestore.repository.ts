import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, ensureAuthUser } from '../firebase';
import { IRepository } from './repository.interface';
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

export class FirestoreRepository implements IRepository {
  private localFallback = new LocalStorageRepository();
  private cachedWorkspaceId: string | null = null;

  private async getUserId(): Promise<string> {
    const user = await ensureAuthUser();
    return user.uid;
  }

  // --- Workspace & Settings ---
  async getWorkspace(): Promise<Workspace | null> {
    try {
      const userId = await this.getUserId();
      // First check local cache for active workspace ID
      const localWs = await this.localFallback.getWorkspace();
      const wsId = localWs?.id || this.cachedWorkspaceId || `ws_${userId.substring(0, 16)}`;

      const wsSnap = await getDoc(doc(db, 'workspaces', wsId));
      if (wsSnap.exists()) {
        const data = wsSnap.data() as Workspace;
        this.cachedWorkspaceId = data.id;
        await this.localFallback.saveWorkspace(data);
        return data;
      }

      if (localWs) {
        // Upload local workspace to Firestore to sync
        const syncedWs: Workspace = { ...localWs, userId };
        await setDoc(doc(db, 'workspaces', syncedWs.id), syncedWs);
        this.cachedWorkspaceId = syncedWs.id;
        return syncedWs;
      }

      return null;
    } catch (err) {
      console.warn('[FirestoreRepository] getWorkspace falling back to local storage:', err);
      return await this.localFallback.getWorkspace();
    }
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    const userId = await this.getUserId();
    const wsWithUser = { ...workspace, userId };
    this.cachedWorkspaceId = workspace.id;

    await this.localFallback.saveWorkspace(wsWithUser);
    try {
      await setDoc(doc(db, 'workspaces', workspace.id), wsWithUser);
    } catch (err) {
      console.warn('[FirestoreRepository] saveWorkspace cloud write warning:', err);
    }
  }

  async updateSettings(settings: Partial<WorkspaceSettings>): Promise<Workspace> {
    const current = await this.getWorkspace();
    if (!current) throw new Error('No workspace active to update settings.');

    const updated: Workspace = {
      ...current,
      settings: { ...current.settings, ...settings },
      updatedAt: new Date().toISOString(),
    };

    await this.saveWorkspace(updated);
    return updated;
  }

  async clearWorkspace(): Promise<void> {
    const current = await this.getWorkspace();
    if (current) {
      try {
        await deleteDoc(doc(db, 'workspaces', current.id));
      } catch (err) {
        console.warn('[FirestoreRepository] clearWorkspace error:', err);
      }
    }
    await this.localFallback.clearWorkspace();
    this.cachedWorkspaceId = null;
  }

  // --- Monitored Channels ---
  async getChannels(): Promise<MonitoredChannel[]> {
    try {
      const ws = await this.getWorkspace();
      if (!ws) return await this.localFallback.getChannels();

      const snap = await getDocs(collection(db, 'workspaces', ws.id, 'channels'));
      const channels: MonitoredChannel[] = [];
      snap.forEach((d) => channels.push(d.data() as MonitoredChannel));

      if (channels.length > 0) {
        await this.localFallback.saveChannels(channels);
        return channels;
      }
      return await this.localFallback.getChannels();
    } catch (err) {
      return await this.localFallback.getChannels();
    }
  }

  async getChannelById(channelId: string): Promise<MonitoredChannel | null> {
    const channels = await this.getChannels();
    return channels.find((c) => c.channelId === channelId || c.id === channelId) || null;
  }

  async saveChannel(channel: MonitoredChannel): Promise<void> {
    await this.localFallback.saveChannel(channel);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'channels', channel.channelId), {
          ...channel,
          id: channel.channelId,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] saveChannel cloud write warning:', err);
    }
  }

  async saveChannels(channels: MonitoredChannel[]): Promise<void> {
    await Promise.all(channels.map((c) => this.saveChannel(c)));
  }

  async updateChannel(channelId: string, updates: Partial<MonitoredChannel>): Promise<MonitoredChannel> {
    const updated = await this.localFallback.updateChannel(channelId, updates);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'channels', channelId), {
          ...updated,
          id: channelId,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] updateChannel warning:', err);
    }
    return updated;
  }

  async deleteChannel(channelId: string): Promise<void> {
    await this.localFallback.deleteChannel(channelId);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await deleteDoc(doc(db, 'workspaces', ws.id, 'channels', channelId));
      }
    } catch (err) {
      console.warn('[FirestoreRepository] deleteChannel warning:', err);
    }
  }

  // --- Source Videos ---
  async getSources(): Promise<SourceVideo[]> {
    try {
      const ws = await this.getWorkspace();
      if (!ws) return await this.localFallback.getSources();

      const snap = await getDocs(collection(db, 'workspaces', ws.id, 'sources'));
      const sources: SourceVideo[] = [];
      snap.forEach((d) => sources.push(d.data() as SourceVideo));

      if (sources.length > 0) {
        await this.localFallback.saveSources(sources);
        return sources;
      }
      return await this.localFallback.getSources();
    } catch (err) {
      return await this.localFallback.getSources();
    }
  }

  async getSourceById(id: string): Promise<SourceVideo | null> {
    const sources = await this.getSources();
    return sources.find((s) => s.id === id) || null;
  }

  async saveSource(source: SourceVideo): Promise<void> {
    await this.localFallback.saveSource(source);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'sources', source.id), {
          ...source,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] saveSource cloud write warning:', err);
    }
  }

  async saveSources(sources: SourceVideo[]): Promise<void> {
    await Promise.all(sources.map((s) => this.saveSource(s)));
  }

  async updateSource(id: string, updates: Partial<SourceVideo>): Promise<SourceVideo> {
    const updated = await this.localFallback.updateSource(id, updates);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'sources', id), {
          ...updated,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] updateSource warning:', err);
    }
    return updated;
  }

  async deleteSource(id: string): Promise<void> {
    await this.localFallback.deleteSource(id);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await deleteDoc(doc(db, 'workspaces', ws.id, 'sources', id));
      }
    } catch (err) {
      console.warn('[FirestoreRepository] deleteSource error:', err);
    }
  }

  // --- Clip Candidates ---
  async getCandidates(): Promise<ClipCandidate[]> {
    try {
      const ws = await this.getWorkspace();
      if (!ws) return await this.localFallback.getCandidates();

      const snap = await getDocs(collection(db, 'workspaces', ws.id, 'candidates'));
      const candidates: ClipCandidate[] = [];
      snap.forEach((d) => candidates.push(d.data() as ClipCandidate));

      if (candidates.length > 0) {
        await this.localFallback.saveCandidates(candidates);
        return candidates;
      }
      return await this.localFallback.getCandidates();
    } catch (err) {
      return await this.localFallback.getCandidates();
    }
  }

  async getCandidatesBySourceId(sourceId: string): Promise<ClipCandidate[]> {
    const all = await this.getCandidates();
    return all.filter((c) => c.sourceVideoId === sourceId);
  }

  async getCandidateById(id: string): Promise<ClipCandidate | null> {
    const all = await this.getCandidates();
    return all.find((c) => c.id === id) || null;
  }

  async saveCandidate(candidate: ClipCandidate): Promise<void> {
    await this.localFallback.saveCandidate(candidate);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'candidates', candidate.id), {
          ...candidate,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] saveCandidate warning:', err);
    }
  }

  async saveCandidates(candidates: ClipCandidate[]): Promise<void> {
    await Promise.all(candidates.map((c) => this.saveCandidate(c)));
  }

  async updateCandidate(id: string, updates: Partial<ClipCandidate>): Promise<ClipCandidate> {
    const updated = await this.localFallback.updateCandidate(id, updates);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'candidates', id), {
          ...updated,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] updateCandidate warning:', err);
    }
    return updated;
  }

  async deleteCandidate(id: string): Promise<void> {
    await this.localFallback.deleteCandidate(id);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await deleteDoc(doc(db, 'workspaces', ws.id, 'candidates', id));
      }
    } catch (err) {
      console.warn('[FirestoreRepository] deleteCandidate error:', err);
    }
  }

  // --- Rendered Clips ---
  async getClips(): Promise<Clip[]> {
    try {
      const ws = await this.getWorkspace();
      if (!ws) return await this.localFallback.getClips();

      const snap = await getDocs(collection(db, 'workspaces', ws.id, 'clips'));
      const clips: Clip[] = [];
      snap.forEach((d) => clips.push(d.data() as Clip));

      if (clips.length > 0) {
        return clips;
      }
      return await this.localFallback.getClips();
    } catch (err) {
      return await this.localFallback.getClips();
    }
  }

  async getClipById(id: string): Promise<Clip | null> {
    const clips = await this.getClips();
    return clips.find((c) => c.id === id) || null;
  }

  async saveClip(clip: Clip): Promise<void> {
    await this.localFallback.saveClip(clip);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'clips', clip.id), {
          ...clip,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] saveClip warning:', err);
    }
  }

  async updateClip(id: string, updates: Partial<Clip>): Promise<Clip> {
    const updated = await this.localFallback.updateClip(id, updates);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'clips', id), {
          ...updated,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] updateClip warning:', err);
    }
    return updated;
  }

  async deleteClip(id: string): Promise<void> {
    await this.localFallback.deleteClip(id);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await deleteDoc(doc(db, 'workspaces', ws.id, 'clips', id));
      }
    } catch (err) {
      console.warn('[FirestoreRepository] deleteClip error:', err);
    }
  }

  // --- Jobs ---
  async getJobs(): Promise<Job[]> {
    try {
      const ws = await this.getWorkspace();
      if (!ws) return await this.localFallback.getJobs();

      const snap = await getDocs(collection(db, 'workspaces', ws.id, 'jobs'));
      const jobs: Job[] = [];
      snap.forEach((d) => jobs.push(d.data() as Job));

      if (jobs.length > 0) {
        return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      return await this.localFallback.getJobs();
    } catch (err) {
      return await this.localFallback.getJobs();
    }
  }

  async getJobById(id: string): Promise<Job | null> {
    const jobs = await this.getJobs();
    return jobs.find((j) => j.id === id) || null;
  }

  async saveJob(job: Job): Promise<void> {
    await this.localFallback.saveJob(job);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'jobs', job.id), {
          ...job,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] saveJob warning:', err);
    }
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const updated = await this.localFallback.updateJob(id, updates);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'jobs', id), {
          ...updated,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] updateJob warning:', err);
    }
    return updated;
  }

  async deleteJob(id: string): Promise<void> {
    await this.localFallback.deleteJob(id);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await deleteDoc(doc(db, 'workspaces', ws.id, 'jobs', id));
      }
    } catch (err) {
      console.warn('[FirestoreRepository] deleteJob error:', err);
    }
  }

  // --- Internal Queue ---
  async getQueueItems(): Promise<QueueItem[]> {
    try {
      const ws = await this.getWorkspace();
      if (!ws) return await this.localFallback.getQueueItems();

      const snap = await getDocs(collection(db, 'workspaces', ws.id, 'queue'));
      const items: QueueItem[] = [];
      snap.forEach((d) => items.push(d.data() as QueueItem));

      if (items.length > 0) {
        return items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      }
      return await this.localFallback.getQueueItems();
    } catch (err) {
      return await this.localFallback.getQueueItems();
    }
  }

  async getQueueItemById(id: string): Promise<QueueItem | null> {
    const items = await this.getQueueItems();
    return items.find((q) => q.id === id) || null;
  }

  async saveQueueItem(item: QueueItem): Promise<void> {
    await this.localFallback.saveQueueItem(item);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'queue', item.id), {
          ...item,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] saveQueueItem warning:', err);
    }
  }

  async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<QueueItem> {
    const updated = await this.localFallback.updateQueueItem(id, updates);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await setDoc(doc(db, 'workspaces', ws.id, 'queue', id), {
          ...updated,
          workspaceId: ws.id,
        });
      }
    } catch (err) {
      console.warn('[FirestoreRepository] updateQueueItem warning:', err);
    }
    return updated;
  }

  async deleteQueueItem(id: string): Promise<void> {
    await this.localFallback.deleteQueueItem(id);
    try {
      const ws = await this.getWorkspace();
      if (ws) {
        await deleteDoc(doc(db, 'workspaces', ws.id, 'queue', id));
      }
    } catch (err) {
      console.warn('[FirestoreRepository] deleteQueueItem error:', err);
    }
  }

  // --- Utility ---
  async resetAll(): Promise<void> {
    await this.clearWorkspace();
    await this.localFallback.resetAll();
  }
}
