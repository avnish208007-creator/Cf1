export type ContentStyle =
  | 'educational'
  | 'storytelling'
  | 'commentary'
  | 'interview'
  | 'breakdown'
  | 'action';

export type CaptionStyle =
  | 'bold_punchy'
  | 'clean_subtle'
  | 'karaoke_highlight'
  | 'minimal';

export interface SubtitlePreferences {
  enabled: boolean;
  uppercase: boolean;
  maxWordsPerLine: number;
  position: 'bottom' | 'center';
  fontSize: number;
}

export interface WorkspaceSettings {
  niche: string;
  subtopics: string[];
  language: string;
  contentStyle: ContentStyle;
  captionStyle: CaptionStyle;
  brandAccent: string;
  subtitlePreferences: SubtitlePreferences;
  enableDevAuthorizedSource?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  settings: WorkspaceSettings;
}

export type SourceVideoStatus =
  | 'discovered'
  | 'analyzing'
  | 'analyzed'
  | 'failed';

export type MediaSourceType =
  | 'AUTHORIZED_DIRECT_URL'
  | 'AUTHORIZED_STORAGE'
  | 'DEVELOPMENT_TEST_MEDIA';

export type AuthorizationStatus = 'authorized' | 'unauthorized' | 'pending' | 'revoked';

export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'unvalidated';

export type CandidateMediaState =
  | 'MEDIA_REQUIRED'
  | 'MEDIA_ACQUIRING'
  | 'MEDIA_VALIDATING'
  | 'MEDIA_READY'
  | 'MEDIA_UNAVAILABLE'
  | 'MEDIA_INVALID';

export interface AuthorizedMediaSource {
  sourceType: MediaSourceType;
  mediaUrl: string; // Direct stream/file URL or storage reference
  authorizationStatus: AuthorizationStatus;
  provider: string; // e.g. 'direct_partner', 'authorized_storage', 'dev_test_provider'
  contentIdentifier: string;
  acquiredAt: string;
  expiration?: string;
  validationStatus: ValidationStatus;
  metadata?: Record<string, any>;
}

export interface SourceAnalysisResult {
  relevance: number; // 0 - 100 (niche relevance)
  subtopicMatchScore: number; // 0 - 100 (subtopic relevance)
  topicClarity: number; // 0 - 100
  contentRichness: number; // 0 - 100
  potentialHooksCount: number;
  standaloneContextScore: number; // 0 - 100
  shortFormPotentialScore: number; // 0 - 100 (likely short-form potential)
  topicCategory: string; // e.g. Practical Guide, Strategic Breakdown, etc.
  hookPotentialScore: number; // 0 - 100 (hook potential)
  confidence: number; // 0 - 100 (confidence based on metadata clarity)
  reasoning: string;
  recommendedAngles: string[];
  analyzedAt: string;
}

export interface SourceVideo {
  id: string;
  workspaceId?: string;
  externalId: string;
  channelId?: string;
  authorId?: string;
  platform: 'youtube' | 'local_authorized';
  provider?: string;
  url: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration: number; // seconds
  description: string;
  discoveryQuery?: string;
  discoveredAt: string;
  relevanceScore: number; // 0 - 100
  relevanceReason: string;
  rankScore?: number; // 0 - 100 transparent ranking score
  status: SourceVideoStatus;
  analysis?: SourceAnalysisResult;
  mediaSource?: AuthorizedMediaSource;
  errorCode?: string;
  errorMessage?: string;
}

export type QualityTier = 'Excellent' | 'Strong' | 'Potential' | 'Weak';

export type CandidateStatus =
  | 'detected'
  | 'selected'
  | 'approved'
  | 'rejected'
  | 'rendering'
  | 'rendered'
  | 'failed';

export type ProcessingState = 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'REJECTED';

export interface MomentScores {
  hook: number; // 0 - 100
  curiosity: number; // 0 - 100
  payoff: number; // 0 - 100
  standaloneContext: number; // 0 - 100
  clarity: number; // 0 - 100
  emotionalValue: number; // 0 - 100
  durationFitness?: number; // 0 - 100
  sourceRelevance?: number; // 0 - 100
  shortFormPotential: number; // 0 - 100
  overall: number; // 0 - 100
}

export interface CandidateRejection {
  candidateId?: string;
  startTime: number;
  endTime: number;
  duration: number;
  reason: string;
  topic?: string;
}

export interface ClipCandidate {
  id: string;
  sourceId: string;
  sourceVideoId: string;
  sourceTitle: string;
  sourceChannel: string;
  sourceThumbnail: string;
  sourceUrl: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  duration: number; // in seconds
  hook: string; // detected hook
  summary: string; // moment summary
  context: string;
  payoff: string;
  topic?: string;
  reason: string; // reason for selection
  confidence: number; // 0 - 100
  scores: MomentScores;
  qualityTier: QualityTier;
  status: CandidateStatus;
  processingState?: ProcessingState;
  rejectionReason?: string;
  transcript?: string;
  mediaState?: CandidateMediaState;
  mediaSource?: AuthorizedMediaSource;
  mediaValidation?: MediaValidationResult;
  mediaError?: string;
  createdAt: string;
}

export interface ValidatedMedia {
  sourceVideoId: string;
  candidateId?: string;
  localMediaPath: string;
  sourceType: MediaSourceType;
  provider: string;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  nbFrames: number;
  fps: number;
  validatedAt: string;
  validation: MediaValidationResult;
}

export interface ValidatedRendererInput {
  validatedMedia: ValidatedMedia;
  candidateId: string;
  startTime: number;
  endTime: number;
  duration: number;
  sourceMetadata: {
    id: string;
    title: string;
    channelTitle: string;
    platform: string;
    url: string;
  };
}

export type ClipStatus = 'draft' | 'rendering' | 'ready' | 'queued' | 'failed';

export interface MediaValidationResult {
  passed: boolean;
  fileExists: boolean;
  fileSizeBytes: number;
  validContainer: boolean;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  durationSeconds: number;
  width: number;
  height: number;
  isNineSixteen: boolean;
  framesActuallyChange: boolean;
  browserCompatibleCodec: boolean;
  validationTimestamp: string;
  validationLog?: string;
}

export interface Clip {
  id: string;
  candidateId: string;
  sourceVideoId: string;
  sourceTitle: string;
  sourceChannel: string;
  title: string;
  videoUrl: string; // URL / endpoint pointing to real MP4 file
  posterUrl: string;
  duration: number;
  resolution: { width: number; height: number };
  aspectRatio: '9:16';
  codec: { video: string; audio: string };
  fileSizeBytes: number;
  caption: string;
  hashtags: string[];
  status: ClipStatus;
  createdAt: string;
  updatedAt: string;
  validation?: MediaValidationResult;
  errorCode?: string;
  errorMessage?: string;
}

export type JobType =
  | 'discovery'
  | 'analysis'
  | 'moment_detection'
  | 'render'
  | 'pipeline';

export type JobStatus =
  | 'queued'
  | 'discovering'
  | 'analyzing'
  | 'detecting_moments'
  | 'acquiring_media'
  | 'rendering'
  | 'generating_metadata'
  | 'completed'
  | 'failed';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  progress?: number; // Real percentage if known
  currentStep: string;
  targetId?: string; // ID of sourceVideo or candidate being processed
  targetTitle?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  logs?: string[];
}

export type QueueItemStatus = 'Needs Review' | 'Ready' | 'Queued';

export interface QueueItem {
  id: string;
  clipId: string;
  clip: Clip;
  status: QueueItemStatus;
  priority: number;
  addedAt: string;
  notes?: string;
}

export type MonitoredChannelStatus = 'active' | 'paused';

export interface ChannelCandidate {
  channelId: string;
  channelName: string;
  channelUrl: string;
  thumbnail?: string;
  description?: string;
  subscriberCount?: number;
  videoCount?: number;
  relevanceScore: number;
  matchedQueries: string[];
  discoveredAt: string;
}

export interface MonitoredChannel {
  id: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  channelUrl: string;
  rssUrl: string;
  niche: string;
  relevanceScore: number;
  status: MonitoredChannelStatus;
  discoveredAt: string;
  lastCheckedAt?: string;
  lastSuccessfulCheckAt?: string;
  latestVideoId?: string;
  latestVideoTitle?: string;
  latestVideoPublishedAt?: string;
  matchedQueries?: string[];
  thumbnailUrl?: string;
}

export type AppErrorCode =
  | 'DISCOVERY_PROVIDER_UNAVAILABLE'
  | 'DISCOVERY_INSTANCE_UNAVAILABLE'
  | 'DISCOVERY_REQUEST_TIMEOUT'
  | 'DISCOVERY_RATE_LIMITED'
  | 'DISCOVERY_REQUEST_FAILED'
  | 'DISCOVERY_INVALID_NICHE'
  | 'DISCOVERY_NO_CHANNELS_FOUND'
  | 'DISCOVERY_NO_NEW_VIDEOS'
  | 'VIDEO_CHANNEL_MISMATCH'
  | 'RSS_REQUEST_FAILED'
  | 'RSS_INVALID_RESPONSE'
  | 'DISCOVERY_API_KEY_INVALID'
  | 'DISCOVERY_QUOTA_EXCEEDED'
  | 'SOURCE_ANALYSIS_UNAVAILABLE'
  | 'MEDIA_UNAVAILABLE'
  | 'MEDIA_SOURCE_UNAVAILABLE'
  | 'MEDIA_VALIDATION_FAILED'
  | 'STATIC_MEDIA_REJECTED'
  | 'CANDIDATE_TIMESTAMP_INVALID'
  | 'RENDER_FAILED'
  | 'OUTPUT_VALIDATION_FAILED'
  | 'STORAGE_FAILED'
  | 'INVALID_CONFIG'
  | 'NETWORK_ERROR';
