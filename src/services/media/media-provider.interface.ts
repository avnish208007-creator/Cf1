import { SourceVideo, AuthorizedMediaSource, MediaSourceType } from '../../types';

export interface AcquiredMediaResult {
  sourceVideoId: string;
  localMediaPath: string; // Absolute or workspace path to the acquired moving media file
  sourceType: MediaSourceType;
  provider: string;
  fileSizeBytes: number;
  mimeType: string;
  contentIdentifier: string;
  acquiredAt: string;
  temporaryWorkspaceDir?: string;
  durationSeconds?: number;
}

export type MediaAcquisitionResult = AcquiredMediaResult;

export interface IMediaProvider {
  readonly id: string;
  readonly name: string;
  readonly sourceType: MediaSourceType;

  /**
   * Evaluates if this provider can legitimately acquire moving media for the given source.
   */
  canAcquire(source: SourceVideo, mediaSource?: AuthorizedMediaSource): boolean;

  /**
   * Acquires the moving media file into the specified target directory.
   * Throws MEDIA_SOURCE_UNAVAILABLE if unauthorized or unavailable.
   */
  acquire(
    source: SourceVideo,
    targetDir: string,
    mediaSource?: AuthorizedMediaSource,
  ): Promise<AcquiredMediaResult>;
}
