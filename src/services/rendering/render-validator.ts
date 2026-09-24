import fs from 'node:fs';
import path from 'node:path';
import { RenderRequestInput } from './render-config';
import { MediaValidator, RawProbeData } from './media-validator';
import { MediaValidationResult } from '../../types';
import { FFprobeRunner } from '../media/ffprobe-runner';

export class RenderValidator {
  /**
   * Validates render input before FFmpeg is executed
   */
  public static async validateInput(
    input: RenderRequestInput,
    resolvedSourcePath: string,
  ): Promise<{ sourceProbe: RawProbeData; sourceHadAudio: boolean }> {
    if (!input.candidateId) {
      throw new Error('INVALID_RENDER_INPUT: Missing candidateId.');
    }

    if (!resolvedSourcePath || !fs.existsSync(resolvedSourcePath)) {
      throw new Error(
        `MEDIA_NOT_FOUND: Source media file does not exist at "${resolvedSourcePath}".`,
      );
    }

    if (input.startTime < 0) {
      throw new Error(
        `TIMESTAMP_OUT_OF_RANGE: Candidate start timestamp (${input.startTime}s) cannot be negative.`,
      );
    }

    if (input.endTime <= input.startTime) {
      throw new Error(
        `TIMESTAMP_OUT_OF_RANGE: Candidate end timestamp (${input.endTime}s) must be strictly greater than start timestamp (${input.startTime}s).`,
      );
    }

    const duration = input.endTime - input.startTime;
    if (duration < 15 || duration > 60) {
      throw new Error(
        `TIMESTAMP_OUT_OF_RANGE: Candidate duration (${duration.toFixed(
          1,
        )}s) is outside the allowed short-form range of 15s to 60s.`,
      );
    }

    // Run FFprobe against source media
    const sourceProbe = await FFprobeRunner.probe(resolvedSourcePath);

    // Validate moving video container & streams
    const sourceValidation = MediaValidator.validateSourceMedia(sourceProbe, {
      candidateStartTime: input.startTime,
      candidateEndTime: input.endTime,
      requireAudio: false,
    });

    if (!sourceValidation.passed) {
      throw new Error(
        `INVALID_RENDER_INPUT: Source media failed validation. Details: ${sourceValidation.validationLog}`,
      );
    }

    // Explicit timestamp bounds check against source duration
    const sourceDuration = parseFloat(sourceProbe.format?.duration || '0');
    if (input.endTime > sourceDuration + 0.1) {
      throw new Error(
        `TIMESTAMP_OUT_OF_RANGE: Candidate endTime (${input.endTime.toFixed(
          2,
        )}s) exceeds actual media duration (${sourceDuration.toFixed(
          2,
        )}s). Silently clamping timestamps is prohibited.`,
      );
    }

    const sourceHadAudio = (sourceProbe.streams || []).some(
      (s) => s.codec_type === 'audio',
    );

    return { sourceProbe, sourceHadAudio };
  }

  /**
   * Validates final rendered MP4 output file
   */
  public static async validateOutput(
    outputPath: string,
    requestedDuration: number,
    sourceHadAudio: boolean,
  ): Promise<MediaValidationResult> {
    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `OUTPUT_NOT_FOUND: Rendered output file does not exist at "${outputPath}".`,
      );
    }

    const stat = fs.statSync(outputPath);
    if (stat.size < 10000) {
      throw new Error(
        `OUTPUT_VALIDATION_FAILED: Rendered file is empty or corrupted (size=${stat.size} bytes).`,
      );
    }

    // Run FFprobe on rendered output
    let outputProbe: RawProbeData;
    try {
      outputProbe = await FFprobeRunner.probe(outputPath);
    } catch (err: any) {
      throw new Error(
        `OUTPUT_VALIDATION_FAILED: Failed to probe rendered MP4: ${err.message}`,
      );
    }

    const validation = MediaValidator.validateProbe(outputProbe);

    if (!validation.passed) {
      throw new Error(
        `OUTPUT_VALIDATION_FAILED: Rendered MP4 failed validation. Details: ${validation.validationLog}`,
      );
    }

    // Strict 1080x1920 dimension check
    if (validation.width !== 1080 || validation.height !== 1920) {
      throw new Error(
        `DIMENSION_VALIDATION_FAILED: Rendered output must be exactly 1080x1920 vertical 9:16 (got ${validation.width}x${validation.height}).`,
      );
    }

    // Strict audio check if source had audio
    if (sourceHadAudio && !validation.hasAudioStream) {
      throw new Error(
        'AUDIO_VALIDATION_FAILED: Rendered clip is missing required audio stream present in source media.',
      );
    }

    // Strict duration check (within +/- 1.5s tolerance)
    const durationDelta = Math.abs(validation.durationSeconds - requestedDuration);
    if (durationDelta > 1.5) {
      throw new Error(
        `OUTPUT_VALIDATION_FAILED: Rendered output duration (${validation.durationSeconds.toFixed(
          1,
        )}s) does not match requested candidate duration (${requestedDuration.toFixed(
          1,
        )}s).`,
      );
    }

    // Strict static-media rejection check
    if (!validation.framesActuallyChange) {
      throw new Error(
        'STATIC_OUTPUT_REJECTED: Rendered output does not contain changing frames. Static media fallbacks are strictly prohibited.',
      );
    }

    return validation;
  }
}
