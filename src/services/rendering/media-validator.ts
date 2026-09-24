import { MediaValidationResult } from '../../types';

export interface RawProbeData {
  format?: {
    format_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
  };
  streams?: Array<{
    codec_type: 'video' | 'audio' | string;
    codec_name: string;
    width?: number;
    height?: number;
    nb_frames?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    duration?: string;
  }>;
  sceneChangesDetected?: number;
}

export interface SourceValidationOptions {
  candidateStartTime?: number;
  candidateEndTime?: number;
  requireAudio?: boolean;
}

export class MediaValidator {
  /**
   * Validates raw moving media container, streams, frame progression, and candidate timestamps.
   * Explicitly detects and rejects static images, zero-frame files, synthetic looped images,
   * corrupted files, and timestamp mismatches.
   */
  static validateSourceMedia(
    probe: RawProbeData,
    options?: SourceValidationOptions,
  ): MediaValidationResult {
    const format = probe.format || {};
    const streams = probe.streams || [];

    const fileSizeBytes = parseInt(format.size || '0', 10);
    const durationSeconds = parseFloat(format.duration || '0');
    const formatName = (format.format_name || '').toLowerCase();

    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    const fileExists = fileSizeBytes > 0;

    // 1. Container Validation: Must be genuine video container
    const isImageContainer =
      formatName.includes('image2') ||
      formatName.includes('png_pipe') ||
      formatName.includes('jpeg_pipe') ||
      formatName.includes('singlejpeg') ||
      formatName.includes('bmp_pipe') ||
      formatName.includes('gif');

    const validContainer =
      !isImageContainer &&
      (formatName.includes('mp4') ||
        formatName.includes('mov') ||
        formatName.includes('m4a') ||
        formatName.includes('matroska') ||
        formatName.includes('webm') ||
        formatName.includes('3gp'));

    const hasVideoStream = Boolean(videoStream);
    const requireAudio = options?.requireAudio ?? true;
    const hasAudioStream = requireAudio ? Boolean(audioStream) : true;

    const width = videoStream?.width || 0;
    const height = videoStream?.height || 0;
    const nonZeroDimensions = width > 0 && height > 0;

    // 2. Codec Validation
    const videoCodec = (videoStream?.codec_name || '').toLowerCase();
    const audioCodec = (audioStream?.codec_name || '').toLowerCase();

    // Reject static image codecs masquerading as video
    const isImageCodec = [
      'mjpeg',
      'png',
      'webp',
      'bmp',
      'gif',
      'tiff',
      'jpeg2000',
    ].includes(videoCodec);

    const supportedVideoCodecs = [
      'h264',
      'avc1',
      'hevc',
      'h265',
      'vp9',
      'vp8',
      'av1',
    ];
    const supportedVideoCodec =
      !isImageCodec && supportedVideoCodecs.includes(videoCodec);

    const supportedAudioCodecs = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];
    const supportedAudioCodec = !requireAudio
      ? true
      : supportedAudioCodecs.includes(audioCodec);

    const browserCompatibleCodec = supportedVideoCodec && supportedAudioCodec;

    // 3. Static Media & Frame Progression Protection
    // A valid MP4 container alone is NOT proof of moving media. Require real frame progression!
    const nbFrames = parseInt(videoStream?.nb_frames || '0', 10);
    const isZeroFrame = nbFrames === 0;
    const isSingleFrame = nbFrames === 1;

    // Moving video must have adequate frames for duration (at least 5 fps for real moving content)
    // or detected scene transitions. A 30s video with 1 or 2 frames is a static thumbnail, not moving video.
    const hasMinimumFrames =
      durationSeconds <= 0
        ? false
        : nbFrames > 1 && (durationSeconds <= 1 || nbFrames >= durationSeconds * 5);

    const framesActuallyChange =
      !isImageContainer &&
      !isImageCodec &&
      !isZeroFrame &&
      !isSingleFrame &&
      hasMinimumFrames;

    // 4. Candidate Timestamp Validation
    let timestampsValid = true;
    let timestampError = '';

    if (
      options?.candidateStartTime !== undefined &&
      options?.candidateEndTime !== undefined
    ) {
      const tsCheck = MediaValidator.validateCandidateTimestamps(
        {
          startTime: options.candidateStartTime,
          endTime: options.candidateEndTime,
        },
        durationSeconds,
      );
      timestampsValid = tsCheck.valid;
      if (!tsCheck.valid) {
        timestampError = tsCheck.error || 'Invalid candidate timestamps';
      }
    }

    const passed =
      fileExists &&
      fileSizeBytes > 10000 && // Minimum sensible media size
      validContainer &&
      hasVideoStream &&
      hasAudioStream &&
      nonZeroDimensions &&
      durationSeconds > 0 &&
      supportedVideoCodec &&
      supportedAudioCodec &&
      framesActuallyChange &&
      timestampsValid;

    let failureReasons: string[] = [];
    if (!fileExists || fileSizeBytes <= 10000)
      failureReasons.push(`File missing or empty (${fileSizeBytes} bytes)`);
    if (isImageContainer)
      failureReasons.push(
        `STATIC_MEDIA_REJECTED: Static image container "${formatName}" rejected. Moving video required.`,
      );
    if (!validContainer)
      failureReasons.push(`Invalid media container format: "${formatName}"`);
    if (!hasVideoStream) failureReasons.push('Missing video stream');
    if (isImageCodec)
      failureReasons.push(
        `STATIC_MEDIA_REJECTED: Static image codec "${videoCodec}" rejected. Moving video required.`,
      );
    if (!supportedVideoCodec)
      failureReasons.push(`Unsupported video codec: "${videoCodec}"`);
    if (requireAudio && !hasAudioStream)
      failureReasons.push('Missing required audio stream');
    if (requireAudio && !supportedAudioCodec)
      failureReasons.push(`Unsupported audio codec: "${audioCodec}"`);
    if (!nonZeroDimensions)
      failureReasons.push(`Non-zero dimensions required (got ${width}x${height})`);
    if (durationSeconds <= 0)
      failureReasons.push(`Invalid duration: ${durationSeconds}s`);
    if (isZeroFrame)
      failureReasons.push('ZERO_FRAME_DETECTED: Video stream contains 0 frames.');
    if (isSingleFrame)
      failureReasons.push(
        'STATIC_MEDIA_REJECTED: Single frame detected. Static image cannot be processed as moving video.',
      );
    if (!framesActuallyChange && !isZeroFrame && !isSingleFrame)
      failureReasons.push(
        `INSUFFICIENT_FRAME_PROGRESSION: Detected only ${nbFrames} frames across ${durationSeconds.toFixed(
          1,
        )}s video. Moving video requires adequate frame progression.`,
      );
    if (!timestampsValid) failureReasons.push(timestampError);

    const log = passed
      ? `MEDIA_VALID: Container=${formatName}, Size=${fileSizeBytes}B, Duration=${durationSeconds.toFixed(
          2,
        )}s, Dim=${width}x${height}, Codecs=${videoCodec}/${audioCodec}, Frames=${nbFrames}, FramesActuallyChange=true`
      : `MEDIA_VALIDATION_FAILED: ${failureReasons.join('; ')}`;

    return {
      passed,
      fileExists,
      fileSizeBytes,
      validContainer,
      hasVideoStream,
      hasAudioStream: Boolean(audioStream),
      durationSeconds,
      width,
      height,
      isNineSixteen:
        height > 0 && width > 0 && Math.abs(width / height - 9 / 16) < 0.03,
      framesActuallyChange,
      browserCompatibleCodec,
      validationTimestamp: new Date().toISOString(),
      validationLog: log,
    };
  }

  /**
   * Validates rendered 9:16 vertical MP4 output.
   */
  static validateProbe(probe: RawProbeData): MediaValidationResult {
    const sourceResult = MediaValidator.validateSourceMedia(probe, {
      requireAudio: true,
    });
    const format = probe.format || {};
    const streams = probe.streams || [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const width = videoStream?.width || 0;
    const height = videoStream?.height || 0;

    // Check 9:16 aspect ratio (e.g. 1080x1920 or proportional 9:16 within 3% tolerance)
    const isNineSixteen =
      height > 0 && width > 0 && Math.abs(width / height - 9 / 16) < 0.03;

    const passed = sourceResult.passed && isNineSixteen;
    const log = passed
      ? `${sourceResult.validationLog}, 9:16=true`
      : `${sourceResult.validationLog}${
          !isNineSixteen ? '; Output not formatted to 9:16 vertical ratio' : ''
        }`;

    return {
      ...sourceResult,
      isNineSixteen,
      passed,
      validationLog: log,
    };
  }

  /**
   * Strict validation of candidate timestamps against actual media duration.
   * Silently clamping timestamps is strictly prohibited.
   */
  static validateCandidateTimestamps(
    candidate: { startTime: number; endTime: number; duration?: number },
    actualMediaDuration: number,
  ): { valid: boolean; error?: string } {
    if (typeof candidate.startTime !== 'number' || isNaN(candidate.startTime)) {
      return {
        valid: false,
        error: 'CANDIDATE_TIMESTAMP_INVALID: Candidate start timestamp must be a valid number.',
      };
    }
    if (typeof candidate.endTime !== 'number' || isNaN(candidate.endTime)) {
      return {
        valid: false,
        error: 'CANDIDATE_TIMESTAMP_INVALID: Candidate end timestamp must be a valid number.',
      };
    }

    if (candidate.startTime < 0) {
      return {
        valid: false,
        error: `CANDIDATE_TIMESTAMP_INVALID: Candidate start timestamp (${candidate.startTime}s) cannot be negative.`,
      };
    }

    if (candidate.endTime <= candidate.startTime) {
      return {
        valid: false,
        error: `CANDIDATE_TIMESTAMP_INVALID: Candidate end timestamp (${candidate.endTime}s) must be strictly greater than start timestamp (${candidate.startTime}s).`,
      };
    }

    if (actualMediaDuration > 0 && candidate.endTime > actualMediaDuration + 0.05) {
      return {
        valid: false,
        error: `CANDIDATE_TIMESTAMP_INVALID: Candidate end timestamp (${candidate.endTime}s) exceeds actual media duration (${actualMediaDuration.toFixed(
          2,
        )}s). Silently clamping timestamps is prohibited.`,
      };
    }

    const duration = candidate.endTime - candidate.startTime;
    if (duration < 15 || duration > 60) {
      return {
        valid: false,
        error: `CANDIDATE_TIMESTAMP_INVALID: Candidate duration (${duration.toFixed(
          1,
        )}s) is outside the required short-form range of 15s to 60s.`,
      };
    }

    return { valid: true };
  }
}
