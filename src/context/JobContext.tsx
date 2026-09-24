import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Job,
  SourceVideo,
  ClipCandidate,
  Clip,
  QueueItem,
  AuthorizedMediaSource,
  AppErrorCode,
  CandidateMediaState,
  MonitoredChannel,
  MonitoredChannelStatus,
} from '../types';
import { DiscoveryResult } from '../services/discovery/discovery.interface';
import { repository } from '../lib/storage';
import { apiClient } from '../services/api/client';
import { mediaService } from '../services/media/media.service';
import { SocialMetadataService } from '../services/social/social-metadata.service';
import { useWorkspace } from './WorkspaceContext';

interface JobContextType {
  jobs: Job[];
  activeJob: Job | null;
  sources: SourceVideo[];
  channels: MonitoredChannel[];
  candidates: ClipCandidate[];
  clips: Clip[];
  queueItems: QueueItem[];
  isLoadingData: boolean;
  refreshData: () => Promise<void>;
  // Actions
  runDiscovery: () => Promise<DiscoveryResult | undefined>;
  updateMonitoredChannelStatus: (channelId: string, status: MonitoredChannelStatus) => Promise<void>;
  removeMonitoredChannel: (channelId: string) => Promise<void>;
  analyzeSource: (source: SourceVideo) => Promise<void>;
  retryAnalysis: (sourceId: string) => Promise<void>;
  approveCandidate: (candidateId: string) => Promise<void>;
  rejectCandidate: (candidateId: string, reason?: string) => Promise<void>;
  attachAuthorizedMedia: (candidateId: string, mediaSource: AuthorizedMediaSource) => Promise<void>;
  testAuthorizedMediaPipeline: () => Promise<{
    success: boolean;
    stepResults: Array<{ step: string; status: 'passed' | 'failed'; details: string }>;
    validatedMedia: any;
    handoff: any;
  }>;
  renderCandidate: (candidate: ClipCandidate) => Promise<Clip>;
  updateClipMetadata: (clipId: string, caption: string, hashtags: string[]) => Promise<void>;
  moveClipToQueue: (clipId: string) => Promise<void>;
  updateQueueItemStatus: (queueItemId: string, status: QueueItem['status']) => Promise<void>;
  deleteClip: (clipId: string) => Promise<void>;
  dismissJob: (jobId: string) => Promise<void>;
  resetDiscoveryData: () => Promise<void>;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export const JobProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { workspace } = useWorkspace();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [sources, setSources] = useState<SourceVideo[]>([]);
  const [channels, setChannels] = useState<MonitoredChannel[]>([]);
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const analyzingSourcesRef = useRef<Set<string>>(new Set());

  const refreshData = useCallback(async () => {
    try {
      const [storedJobs, storedSources, storedChannels, storedCandidates, storedClips, storedQueue] =
        await Promise.all([
          repository.getJobs(),
          repository.getSources(),
          repository.getChannels(),
          repository.getCandidates(),
          repository.getClips(),
          repository.getQueueItems(),
        ]);

      // Clean up zombie jobs older than 2 minutes that never terminated
      const now = Date.now();
      const validJobs = storedJobs.map((j) => {
        if (j.status !== 'completed' && j.status !== 'failed') {
          const ageMs = now - new Date(j.createdAt).getTime();
          if (ageMs > 2 * 60 * 1000) {
            return {
              ...j,
              status: 'failed' as const,
              currentStep: 'Job timed out or interrupted.',
              errorMessage: 'Operation timed out.',
              completedAt: new Date().toISOString(),
            };
          }
        }
        return j;
      });

      setJobs(validJobs);
      const running = validJobs.find(
        (j) => j.status !== 'completed' && j.status !== 'failed',
      );
      setActiveJob(running || null);
      setSources(storedSources);
      setChannels(storedChannels);
      setCandidates(storedCandidates);
      setClips(storedClips);
      setQueueItems(storedQueue);
    } catch (err) {
      console.error('[JobContext] Error refreshing data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Helper to create and track a job
  const createJob = async (type: Job['type'], initialStep: string, targetTitle?: string): Promise<Job> => {
    const job: Job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      status: 'queued',
      currentStep: initialStep,
      targetTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: [initialStep],
    };
    await repository.saveJob(job);
    setActiveJob(job);
    setJobs((prev) => [job, ...prev]);
    return job;
  };

  const updateJobState = async (
    jobId: string,
    status: Job['status'],
    step: string,
    progress?: number,
    errorCode?: string,
    errorMessage?: string,
  ) => {
    const job = await repository.getJobById(jobId);
    if (!job) return;

    const logs = job.logs || [];
    logs.push(step);

    const updated = await repository.updateJob(jobId, {
      status,
      currentStep: step,
      progress,
      errorCode,
      errorMessage,
      logs,
      completedAt: status === 'completed' || status === 'failed' ? new Date().toISOString() : undefined,
    });

    setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
    if (status === 'completed' || status === 'failed') {
      setActiveJob(null);
    } else {
      setActiveJob(updated);
    }
  };

  // --- 1. Run Discovery ---
  const runDiscovery = async () => {
    if (!workspace) throw new Error('No workspace active.');
    const job = await createJob(
      'discovery',
      `Querying discovery angles for niche "${workspace.settings.niche}"...`,
    );

    try {
      await updateJobState(
        job.id,
        'discovering',
        `Running search probes across subtopics: ${workspace.settings.subtopics.join(', ') || 'general niche'}`,
      );

      const [existingSources, existingChannels] = await Promise.all([
        repository.getSources(),
        repository.getChannels(),
      ]);
      const existingIds = existingSources.map((s) => s.externalId);

      const res = await apiClient.discover(workspace.settings, existingIds, existingChannels);

      if (res.channels && res.channels.length > 0) {
        await repository.saveChannels(res.channels);
      }
      if (res.sources && res.sources.length > 0) {
        await repository.saveSources(res.sources);
      }

      const summaryText = `Discovery complete. Discovered ${res.channelsDiscovered || 0} channels (${res.channelsAdded || 0} added), imported ${res.newVideos || res.sources.length} new videos (${res.duplicatesSkipped || 0} duplicates skipped) via ${res.providerName}.`;

      await updateJobState(
        job.id,
        'completed',
        summaryText,
      );
      await refreshData();
      return res;
    } catch (err: any) {
      await updateJobState(
        job.id,
        'failed',
        `Discovery failed: ${err.message}`,
        undefined,
        err.message?.includes('DISCOVERY_INSTANCE_UNAVAILABLE')
          ? 'DISCOVERY_INSTANCE_UNAVAILABLE'
          : err.message?.includes('DISCOVERY_PROVIDER_UNAVAILABLE')
          ? 'DISCOVERY_PROVIDER_UNAVAILABLE'
          : err.message?.includes('DISCOVERY_NO_CHANNELS_FOUND')
          ? 'DISCOVERY_NO_CHANNELS_FOUND'
          : 'DISCOVERY_FAILED',
        err.message,
      );
      await refreshData();
      throw err;
    }
  };

  const updateMonitoredChannelStatus = async (
    channelId: string,
    status: MonitoredChannelStatus,
  ) => {
    await repository.updateChannel(channelId, { status });
    await refreshData();
  };

  const removeMonitoredChannel = async (channelId: string) => {
    await repository.deleteChannel(channelId);
    await refreshData();
  };

  // --- 2. Analyze Source & Detect Moments ---
  const analyzeSource = async (source: SourceVideo) => {
    if (!workspace) throw new Error('No workspace active.');

    // Concurrency lock: prevent duplicate concurrent analysis jobs for the same source
    if (analyzingSourcesRef.current.has(source.id)) {
      throw new Error(
        `ANALYSIS_IN_PROGRESS: Moment analysis is already actively running for "${source.title}". Please wait for it to complete.`,
      );
    }

    analyzingSourcesRef.current.add(source.id);

    const job = await createJob(
      'analysis',
      `Initiating source content analysis for "${source.title}"...`,
      source.title,
    );

    try {
      await updateJobState(
        job.id,
        'analyzing',
        'Evaluating relevance, topic clarity, and content richness...',
      );

      // Mark source status as analyzing
      await repository.updateSource(source.id, {
        status: 'analyzing',
        errorCode: undefined,
        errorMessage: undefined,
      });

      const { analysis, moments } = await apiClient.analyzeSource(source, workspace.settings);

      await updateJobState(
        job.id,
        'detecting_moments',
        `Detected ${moments.length} high-potential moment candidates. Scoring hooks & payoffs...`,
      );

      // Save updated source status with analysis
      await repository.updateSource(source.id, {
        status: 'analyzed',
        analysis,
        relevanceScore: analysis.relevance,
        relevanceReason: analysis.reasoning,
        errorCode: undefined,
        errorMessage: undefined,
      });

      // Deduplicate candidates: Replace previous candidates for this source if re-analyzing,
      // avoiding orphan/duplicate timestamps
      const existingCandidates = await repository.getCandidates();
      const otherCandidates = existingCandidates.filter((c) => c.sourceVideoId !== source.id && c.sourceId !== source.id);
      
      // Save detected candidates
      await repository.saveCandidates([...otherCandidates, ...moments]);

      await updateJobState(
        job.id,
        'completed',
        `Analysis complete. ${moments.length} ranked candidate moments ready for review.`,
      );
      await refreshData();
    } catch (err: any) {
      await updateJobState(
        job.id,
        'failed',
        `Source analysis failed: ${err.message}`,
        undefined,
        'SOURCE_ANALYSIS_UNAVAILABLE',
        err.message,
      );
      await repository.updateSource(source.id, {
        status: 'failed',
        errorCode: 'SOURCE_ANALYSIS_UNAVAILABLE',
        errorMessage: err.message,
      });
      await refreshData();
      throw err;
    } finally {
      analyzingSourcesRef.current.delete(source.id);
    }
  };

  const retryAnalysis = async (sourceId: string) => {
    let source = await repository.getSourceById(sourceId);
    if (!source) {
      source = sources.find((s) => s.id === sourceId) || null;
    }
    if (!source) {
      throw new Error(`Source with ID "${sourceId}" not found for retry.`);
    }

    // Reset error state
    await repository.updateSource(sourceId, {
      status: 'discovered',
      errorCode: undefined,
      errorMessage: undefined,
    });
    await refreshData();

    await analyzeSource({ ...source, status: 'discovered', errorCode: undefined, errorMessage: undefined });
  };

  const approveCandidate = async (candidateId: string) => {
    await repository.updateCandidate(candidateId, {
      status: 'approved',
      rejectionReason: undefined,
    });
    await refreshData();
  };

  const rejectCandidate = async (candidateId: string, reason?: string) => {
    await repository.updateCandidate(candidateId, {
      status: 'rejected',
      rejectionReason: reason || 'Manually rejected by user.',
    });
    await refreshData();
  };

  const attachAuthorizedMedia = async (
    candidateId: string,
    mediaSource: AuthorizedMediaSource,
  ) => {
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) throw new Error(`Candidate "${candidateId}" not found.`);
    const source = sources.find((s) => s.id === candidate.sourceVideoId);
    if (!source) throw new Error(`Source video "${candidate.sourceVideoId}" not found.`);

    // Set validating state
    await repository.updateCandidate(candidateId, {
      mediaState: 'MEDIA_VALIDATING',
      mediaSource,
      mediaError: undefined,
    });
    await refreshData();

    try {
      const result = await apiClient.acquireAndValidateMedia({
        source,
        candidate,
        mediaSource,
      });

      await repository.updateCandidate(candidateId, {
        mediaState: 'MEDIA_READY',
        mediaSource,
        mediaValidation: result.validatedMedia.validation,
        mediaError: undefined,
      });
      await refreshData();
    } catch (err: any) {
      await repository.updateCandidate(candidateId, {
        mediaState: 'MEDIA_INVALID',
        mediaSource,
        mediaError: err.message,
      });
      await refreshData();
      throw err;
    }
  };

  const testAuthorizedMediaPipeline = async () => {
    return await apiClient.testAuthorizedMediaPipeline();
  };

  // --- 3. Render Candidate to Real 9:16 Video ---
  const renderCandidate = async (candidate: ClipCandidate): Promise<Clip> => {
    if (!workspace) throw new Error('No workspace active.');
    const source = await repository.getSourceById(candidate.sourceVideoId);
    if (!source) throw new Error(`Source video ${candidate.sourceVideoId} not found.`);

    const job = await createJob(
      'render',
      `Determining authorized media source for moment candidate "${candidate.hook}"...`,
      candidate.hook,
    );

    try {
      // Step A: Acquire authorized moving media & validate
      await updateJobState(
        job.id,
        'acquiring_media',
        'Acquiring verified moving media container to temporary processing workspace...',
      );

      // Trigger real acquisition & validation pipeline
      const mediaResult = await apiClient.acquireAndValidateMedia({
        source,
        candidate,
        mediaSource: candidate.mediaSource || source.mediaSource,
      });

      const validatedMedia = mediaResult.validatedMedia;

      // Update candidate media state
      await repository.updateCandidate(candidate.id, {
        mediaState: 'MEDIA_READY',
        mediaValidation: validatedMedia.validation,
        mediaError: undefined,
      });

      // Step B: Render 9:16 vertical video using FFmpeg
      await updateJobState(
        job.id,
        'rendering',
        `Encoding 1080x1920 H.264 stream (${candidate.duration}s window from ${candidate.startTime}s to ${candidate.endTime}s)...`,
      );

      const renderResult = await apiClient.renderClip({
        candidateId: candidate.id,
        sourceVideoId: source.id,
        sourcePath: validatedMedia.localMediaPath,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        duration: candidate.duration,
        subtitleText: candidate.transcript,
        subtitlePreferences: workspace.settings.subtitlePreferences,
        captionStyle: workspace.settings.captionStyle,
        brandAccent: workspace.settings.brandAccent,
      });

      // Step C: Generate Social Metadata
      await updateJobState(
        job.id,
        'generating_metadata',
        'Generating contextual caption and targeted hashtags...',
      );

      const socialMeta = SocialMetadataService.generate(candidate, workspace.settings);

      // Create pristine Clip record
      const clip: Clip = {
        id: renderResult.clipId,
        candidateId: candidate.id,
        sourceVideoId: source.id,
        sourceTitle: source.title,
        sourceChannel: source.channelTitle,
        title: candidate.hook,
        videoUrl: renderResult.videoUrl,
        posterUrl: renderResult.posterUrl,
        duration: renderResult.duration,
        resolution: { width: renderResult.width, height: renderResult.height },
        aspectRatio: '9:16',
        codec: renderResult.codec,
        fileSizeBytes: renderResult.fileSizeBytes,
        caption: socialMeta.caption,
        hashtags: socialMeta.hashtags,
        status: 'ready',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        validation: renderResult.validation,
      };

      await repository.saveClip(clip);
      await repository.updateCandidate(candidate.id, {
        status: 'rendered',
        mediaState: 'MEDIA_READY',
      });

      // Automatically place into internal Queue in "Needs Review" status
      const queueItem: QueueItem = {
        id: `q_${clip.id}`,
        clipId: clip.id,
        clip,
        status: 'Needs Review',
        priority: 1,
        addedAt: new Date().toISOString(),
      };
      await repository.saveQueueItem(queueItem);

      await updateJobState(
        job.id,
        'completed',
        `Render completed & validated successfully (${(renderResult.fileSizeBytes / 1024 / 1024).toFixed(
          2,
        )} MB, ${renderResult.width}x${renderResult.height}). Added to Queue.`,
      );

      await refreshData();
      return clip;
    } catch (err: any) {
      console.error('[JobContext] Render Candidate failed:', err);
      let errorCode: AppErrorCode = 'RENDER_FAILED';
      let candidateMediaState: CandidateMediaState = 'MEDIA_INVALID';

      if (err.message?.includes('MEDIA_SOURCE_UNAVAILABLE')) {
        errorCode = 'MEDIA_SOURCE_UNAVAILABLE';
        candidateMediaState = 'MEDIA_UNAVAILABLE';
      } else if (err.message?.includes('STATIC_MEDIA_REJECTED')) {
        errorCode = 'STATIC_MEDIA_REJECTED';
        candidateMediaState = 'MEDIA_INVALID';
      } else if (err.message?.includes('CANDIDATE_TIMESTAMP_INVALID')) {
        errorCode = 'CANDIDATE_TIMESTAMP_INVALID';
        candidateMediaState = 'MEDIA_INVALID';
      } else if (err.message?.includes('MEDIA_VALIDATION_FAILED')) {
        errorCode = 'MEDIA_VALIDATION_FAILED';
        candidateMediaState = 'MEDIA_INVALID';
      } else if (err.message?.includes('OUTPUT_VALIDATION_FAILED')) {
        errorCode = 'OUTPUT_VALIDATION_FAILED';
      }

      await updateJobState(
        job.id,
        'failed',
        `Media acquisition & render halted: ${err.message}`,
        undefined,
        errorCode,
        err.message,
      );

      await repository.updateCandidate(candidate.id, {
        status: 'failed',
        mediaState: candidateMediaState,
        mediaError: err.message,
      });
      await refreshData();
      throw err;
    }
  };

  // --- 4. Update Clip Metadata ---
  const updateClipMetadata = async (clipId: string, caption: string, hashtags: string[]) => {
    const updated = await repository.updateClip(clipId, { caption, hashtags });
    setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));

    // Also update in queue if present
    const qItem = queueItems.find((q) => q.clipId === clipId);
    if (qItem) {
      await repository.updateQueueItem(qItem.id, {
        clip: updated,
      });
    }
    await refreshData();
  };

  // --- 5. Queue Operations ---
  const moveClipToQueue = async (clipId: string) => {
    const clip = await repository.getClipById(clipId);
    if (!clip) throw new Error('Clip not found');

    const existing = queueItems.find((q) => q.clipId === clipId);
    if (!existing) {
      const item: QueueItem = {
        id: `q_${clip.id}_${Date.now()}`,
        clipId: clip.id,
        clip,
        status: 'Ready',
        priority: queueItems.length + 1,
        addedAt: new Date().toISOString(),
      };
      await repository.saveQueueItem(item);
    } else {
      await repository.updateQueueItem(existing.id, { status: 'Queued' });
    }
    await repository.updateClip(clipId, { status: 'queued' });
    await refreshData();
  };

  const updateQueueItemStatus = async (queueItemId: string, status: QueueItem['status']) => {
    await repository.updateQueueItem(queueItemId, { status });
    await refreshData();
  };

  const deleteClip = async (clipId: string) => {
    await repository.deleteClip(clipId);
    const qItem = queueItems.find((q) => q.clipId === clipId);
    if (qItem) {
      await repository.deleteQueueItem(qItem.id);
    }
    await refreshData();
  };

  const dismissJob = async (jobId: string) => {
    await repository.deleteJob(jobId);
    if (activeJob?.id === jobId) setActiveJob(null);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const resetDiscoveryData = async () => {
    await repository.resetDiscoveryData();
    setActiveJob(null);
    await refreshData();
  };

  return (
    <JobContext.Provider
      value={{
        jobs,
        activeJob,
        sources,
        channels,
        candidates,
        clips,
        queueItems,
        isLoadingData,
        refreshData,
        runDiscovery,
        updateMonitoredChannelStatus,
        removeMonitoredChannel,
        analyzeSource,
        retryAnalysis,
        approveCandidate,
        rejectCandidate,
        attachAuthorizedMedia,
        testAuthorizedMediaPipeline,
        renderCandidate,
        updateClipMetadata,
        moveClipToQueue,
        updateQueueItemStatus,
        deleteClip,
        dismissJob,
        resetDiscoveryData,
      }}
    >
      {children}
    </JobContext.Provider>
  );
};

export function useJobs() {
  const ctx = useContext(JobContext);
  if (!ctx) {
    throw new Error('useJobs must be used within a JobProvider');
  }
  return ctx;
}
