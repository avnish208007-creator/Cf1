import {
  Workspace,
  WorkspaceSettings,
  SourceVideo,
  ClipCandidate,
  Clip,
  Job,
  QueueItem,
} from '../../types';

export interface IRepository {
  // Workspace & Settings
  getWorkspace(): Promise<Workspace | null>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  updateSettings(settings: Partial<WorkspaceSettings>): Promise<Workspace>;
  clearWorkspace(): Promise<void>;

  // Source Videos
  getSources(): Promise<SourceVideo[]>;
  getSourceById(id: string): Promise<SourceVideo | null>;
  saveSource(source: SourceVideo): Promise<void>;
  saveSources(sources: SourceVideo[]): Promise<void>;
  updateSource(id: string, updates: Partial<SourceVideo>): Promise<SourceVideo>;
  deleteSource(id: string): Promise<void>;

  // Clip Candidates
  getCandidates(): Promise<ClipCandidate[]>;
  getCandidatesBySourceId(sourceId: string): Promise<ClipCandidate[]>;
  getCandidateById(id: string): Promise<ClipCandidate | null>;
  saveCandidate(candidate: ClipCandidate): Promise<void>;
  saveCandidates(candidates: ClipCandidate[]): Promise<void>;
  updateCandidate(id: string, updates: Partial<ClipCandidate>): Promise<ClipCandidate>;
  deleteCandidate(id: string): Promise<void>;

  // Rendered Clips
  getClips(): Promise<Clip[]>;
  getClipById(id: string): Promise<Clip | null>;
  saveClip(clip: Clip): Promise<void>;
  updateClip(id: string, updates: Partial<Clip>): Promise<Clip>;
  deleteClip(id: string): Promise<void>;

  // Jobs
  getJobs(): Promise<Job[]>;
  getJobById(id: string): Promise<Job | null>;
  saveJob(job: Job): Promise<void>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job>;
  deleteJob(id: string): Promise<void>;

  // Internal Queue
  getQueueItems(): Promise<QueueItem[]>;
  getQueueItemById(id: string): Promise<QueueItem | null>;
  saveQueueItem(item: QueueItem): Promise<void>;
  updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<QueueItem>;
  deleteQueueItem(id: string): Promise<void>;

  // Utility
  resetAll(): Promise<void>;
}
