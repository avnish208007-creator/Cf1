import fs from 'node:fs';
import {
  ValidatedMedia,
  ValidatedRendererInput,
  ClipCandidate,
  SourceVideo,
} from '../../types';
import { MediaValidator } from './media-validator';

export class RendererHandoffService {
  /**
   * Prepares and validates the handoff between validated moving media and the renderer input.
   * Ensures exact candidate timestamps are preserved and verified against the actual media duration.
   */
  static prepareHandoff(
    validatedMedia: ValidatedMedia,
    candidate: ClipCandidate,
    source: SourceVideo,
  ): ValidatedRendererInput {
    // 1. Verify media file existence
    if (!fs.existsSync(validatedMedia.localMediaPath)) {
      throw new Error(
        `RENDERER_HANDOFF_FAILED: Validated media file not found at "${validatedMedia.localMediaPath}".`,
      );
    }

    // 2. Strict timestamp verification against actual media duration (no silent clamping)
    const tsCheck = MediaValidator.validateCandidateTimestamps(
      candidate,
      validatedMedia.durationSeconds,
    );
    if (!tsCheck.valid) {
      throw new Error(`RENDERER_HANDOFF_FAILED: ${tsCheck.error}`);
    }

    const duration = candidate.endTime - candidate.startTime;

    return {
      validatedMedia,
      candidateId: candidate.id,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      duration,
      sourceMetadata: {
        id: source.id,
        title: source.title,
        channelTitle: source.channelTitle,
        platform: source.platform,
        url: source.url,
      },
    };
  }
}
