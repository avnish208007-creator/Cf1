import { SubtitlePreferences, MediaValidationResult } from '../../types';

export interface RenderOptions {
  targetWidth: number;
  targetHeight: number;
  aspectRatio: '9:16';
  videoCodec: string;
  audioCodec: string;
  videoPreset: string;
  crf: number;
  audioBitrate: string;
  audioSampleRate: number;
  audioChannels: number;
  pixelFormat: string;
  fastStart: boolean;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  targetWidth: 1080,
  targetHeight: 1920,
  aspectRatio: '9:16',
  videoCodec: 'libx264',
  audioCodec: 'aac',
  videoPreset: 'veryfast',
  crf: 22,
  audioBitrate: '128k',
  audioSampleRate: 48000,
  audioChannels: 2,
  pixelFormat: 'yuv420p',
  fastStart: true,
};

export interface SubtitleConfig {
  enabled: boolean;
  uppercase: boolean;
  fontSize: number;
  maxCharsPerLine: number;
  position: 'bottom' | 'center';
  primaryColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: number;
  marginV: number;
}

export interface BrandingConfig {
  enabled: boolean;
  watermarkText?: string;
  accentColor?: string;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  opacity?: number;
}

export interface RenderRequestInput {
  candidateId: string;
  sourceVideoId: string;
  sourcePath: string;
  startTime: number;
  endTime: number;
  duration: number;
  subtitleText?: string;
  subtitlePreferences?: SubtitlePreferences;
  captionStyle?: string;
  brandAccent?: string;
  branding?: BrandingConfig;
  jobId?: string;
}

export interface RenderExecutionResult {
  clipId: string;
  videoUrl: string;
  posterUrl: string;
  width: number;
  height: number;
  duration: number;
  fileSizeBytes: number;
  codec: { video: string; audio: string };
  validation: MediaValidationResult;
}

export type RenderStep = 'PREPARING' | 'RENDERING' | 'VALIDATING' | 'FINALIZING';

export interface RenderProgressUpdate {
  step: RenderStep;
  progress: number;
  message: string;
}
