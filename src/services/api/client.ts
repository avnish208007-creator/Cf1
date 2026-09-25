import {
  WorkspaceSettings,
  SourceVideo,
  SourceAnalysisResult,
  ClipCandidate,
  CandidateRejection,
  Job,
  MonitoredChannel,
} from '../../types';
import { RenderRequest, RenderResult } from '../rendering/renderer.interface';
import { DiscoveryResult } from '../discovery/discovery.interface';
import { SourceAnalyzer } from '../analysis/source-analyzer';
import { MomentDetector } from '../moments/moment-detector';
import { repository } from '../../lib/storage';

export class ApiClient {
  private baseUrl = '';

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!res.ok) {
      let errorBody: any = {};
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { errorMessage: res.statusText };
      }
      throw new Error(
        errorBody.errorMessage || errorBody.error || `Request failed with status ${res.status}`,
      );
    }

    return await res.json();
  }

  // --- Discovery Provider Status & Connection Test ---
  async getDiscoveryStatus(): Promise<{
    configured: boolean;
    provider: string;
    status: 'connected' | 'not_configured' | 'unavailable';
    instancesHealthy?: number;
    totalInstances?: number;
    note?: string;
  }> {
    return await this.request('/api/discovery/status', { method: 'GET' });
  }

  async testDiscoveryConnection(): Promise<{
    success: boolean;
    status: string;
    errorCode?: string;
    message: string;
    instanceUsed?: string;
    latencyMs?: number;
  }> {
    return await this.request('/api/discovery/status/test', { method: 'POST' });
  }

  // --- Discovery (Strictly Server-Side) ---
  async discover(
    settings: WorkspaceSettings,
    existingExternalIds: string[] = [],
    monitoredChannels: MonitoredChannel[] = [],
  ): Promise<DiscoveryResult> {
    return await this.request<DiscoveryResult>('/api/discover', {
      method: 'POST',
      body: JSON.stringify({ settings, existingExternalIds, monitoredChannels }),
    });
  }

  // --- Reset Discovery ---
  async resetDiscovery(workspaceId?: string): Promise<{ success: boolean; message: string }> {
    return await this.request('/api/discovery/reset', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    });
  }

  // --- Scheduled RSS Check ---
  async runScheduledRss(
    channels: MonitoredChannel[],
    existingExternalIds: string[] = [],
  ): Promise<{
    newSources: SourceVideo[];
    totalChecked: number;
    duplicatesSkipped: number;
    channelUpdates?: Array<{ channelId: string; latestVideoId?: string; latestVideoTitle?: string; lastSuccessfulCheckAt: string }>;
  }> {
    return await this.request('/api/discovery/scheduled-rss', {
      method: 'POST',
      body: JSON.stringify({ channels, existingExternalIds }),
    });
  }

  // --- Source Analysis & Moment Detection ---
  async analyzeSource(
    source: SourceVideo,
    settings: WorkspaceSettings,
  ): Promise<{ analysis: SourceAnalysisResult; moments: ClipCandidate[]; rejections?: CandidateRejection[] }> {
    try {
      return await this.request<{
        analysis: SourceAnalysisResult;
        moments: ClipCandidate[];
        rejections?: CandidateRejection[];
      }>('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ source, settings }),
      });
    } catch (serverErr: any) {
      console.warn('[ApiClient] Server analyze fallback to in-browser engine:', serverErr.message);
      const analysis = SourceAnalyzer.analyze(source, settings);
      const detection = MomentDetector.detectMomentsWithRejections(source, settings);
      return { analysis, moments: detection.candidates, rejections: detection.rejections };
    }
  }

  // --- Media Acquisition & Validation ---
  async acquireAndValidateMedia(params: {
    source: SourceVideo;
    candidate?: ClipCandidate;
    mediaSource?: any;
  }): Promise<{ success: boolean; validatedMedia: any; temporaryWorkspaceDir: string }> {
    return await this.request<{
      success: boolean;
      validatedMedia: any;
      temporaryWorkspaceDir: string;
    }>('/api/media/acquire-and-validate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // --- Development Test Pipeline ---
  async testAuthorizedMediaPipeline(): Promise<{
    success: boolean;
    stepResults: Array<{ step: string; status: 'passed' | 'failed'; details: string }>;
    validatedMedia: any;
    handoff: any;
  }> {
    return await this.request<{
      success: boolean;
      stepResults: Array<{ step: string; status: 'passed' | 'failed'; details: string }>;
      validatedMedia: any;
      handoff: any;
    }>('/api/media/test-pipeline', {
      method: 'POST',
    });
  }

  // --- Video Rendering ---
  async renderClip(params: RenderRequest): Promise<RenderResult> {
    return await this.request<RenderResult>('/api/render', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // --- Job Status Polling ---
  async getJobStatus(jobId: string): Promise<Job> {
    return await this.request<Job>(`/api/job-status?jobId=${encodeURIComponent(jobId)}`);
  }
}

export const apiClient = new ApiClient();
