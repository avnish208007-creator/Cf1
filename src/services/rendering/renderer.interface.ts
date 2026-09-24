import { ClipCandidate, Clip, MediaValidationResult, SubtitlePreferences } from '../../types';

export interface RenderRequest {
  candidateId: string;
  sourceVideoId: string;
  sourcePath: string;
  startTime: number;
  endTime: number;
  duration: number;
  subtitleText?: string;
  subtitlePreferences: SubtitlePreferences;
  captionStyle: string;
  brandAccent: string;
}

export interface RenderResult {
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

export interface IRenderer {
  render(request: RenderRequest): Promise<RenderResult>;
}
