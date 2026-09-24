import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {
  RenderRequestInput,
  RenderOptions,
  DEFAULT_RENDER_OPTIONS,
} from './render-config';
import { SubtitleGenerator } from './subtitle-generator';

const execFileAsync = promisify(execFile);

export class FFmpegRenderer {
  /**
   * Executes the real FFmpeg rendering pipeline to produce a 1080x1920 vertical MP4.
   */
  public static async renderClip(params: {
    input: RenderRequestInput;
    resolvedSourcePath: string;
    tempWorkspaceDir: string;
    outputPath: string;
    posterPath: string;
    sourceHadAudio: boolean;
    options?: Partial<RenderOptions>;
  }): Promise<{ outputPath: string; posterPath: string }> {
    const {
      input,
      resolvedSourcePath,
      tempWorkspaceDir,
      outputPath,
      posterPath,
      sourceHadAudio,
      options = {},
    } = params;

    const renderOpts = { ...DEFAULT_RENDER_OPTIONS, ...options };
    const duration = input.endTime - input.startTime;

    // 1. Build Video Filter Graph
    const filterParts: string[] = [
      // Intelligent center crop to 1080x1920 (9:16)
      `scale=${renderOpts.targetWidth}:${renderOpts.targetHeight}:force_original_aspect_ratio=increase`,
      `crop=${renderOpts.targetWidth}:${renderOpts.targetHeight}`,
    ];

    // 2. Subtitle Processing
    let srtTempPath: string | null = null;
    const isSubtitlesEnabled = input.subtitlePreferences?.enabled ?? true;

    if (isSubtitlesEnabled && input.subtitleText && input.subtitleText.trim()) {
      const srtContent = SubtitleGenerator.generateFromText(
        input.subtitleText,
        duration,
        input.subtitlePreferences,
      );

      if (srtContent) {
        srtTempPath = path.join(
          tempWorkspaceDir,
          `sub_${input.candidateId}_${Date.now()}.srt`,
        );
        fs.writeFileSync(srtTempPath, srtContent, 'utf-8');

        const escapedSrt = srtTempPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        const forceStyle = SubtitleGenerator.buildForceStyle(
          input.subtitlePreferences,
          input.brandAccent,
        );

        filterParts.push(`subtitles='${escapedSrt}':force_style='${forceStyle}'`);
      }
    }

    // 3. Optional Branding / Watermark Overlay
    if (input.branding?.enabled && input.branding.watermarkText) {
      const watermarkText = input.branding.watermarkText.replace(/'/g, "\\'");
      const opacity = input.branding.opacity ?? 0.7;
      let xPos = 'w-tw-50';
      let yPos = '50';

      if (input.branding.position === 'top-left') {
        xPos = '50';
        yPos = '50';
      } else if (input.branding.position === 'bottom-left') {
        xPos = '50';
        yPos = 'h-th-80';
      } else if (input.branding.position === 'bottom-right') {
        xPos = 'w-tw-50';
        yPos = 'h-th-80';
      }

      filterParts.push(
        `drawtext=text='${watermarkText}':x=${xPos}:y=${yPos}:fontsize=28:fontcolor=white@${opacity}:box=1:boxcolor=black@0.4:boxborderw=6`,
      );
    }

    const vf = filterParts.join(',');

    // 4. Assemble FFmpeg CLI Arguments
    const ffmpegArgs: string[] = [
      '-y', // Overwrite output if exists
      '-ss',
      input.startTime.toFixed(3),
      '-i',
      resolvedSourcePath,
      '-t',
      duration.toFixed(3),
      '-map',
      '0:v:0',
    ];

    if (sourceHadAudio) {
      ffmpegArgs.push('-map', '0:a:0?');
    }

    ffmpegArgs.push(
      '-vf',
      vf,
      '-c:v',
      renderOpts.videoCodec,
      '-preset',
      renderOpts.videoPreset,
      '-crf',
      renderOpts.crf.toString(),
      '-pix_fmt',
      renderOpts.pixelFormat,
    );

    if (sourceHadAudio) {
      ffmpegArgs.push(
        '-c:a',
        renderOpts.audioCodec,
        '-ac',
        renderOpts.audioChannels.toString(),
        '-b:a',
        renderOpts.audioBitrate,
        '-ar',
        renderOpts.audioSampleRate.toString(),
      );
    } else {
      ffmpegArgs.push('-an'); // No audio stream if source had no audio
    }

    if (renderOpts.fastStart) {
      ffmpegArgs.push('-movflags', '+faststart');
    }

    ffmpegArgs.push(outputPath);

    // 5. Execute FFmpeg
    try {
      await execFileAsync('ffmpeg', ffmpegArgs);
    } catch (err: any) {
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath);
        } catch {}
      }
      throw new Error(`FFMPEG_RENDER_FAILED: FFmpeg encoding failed: ${err.message}`);
    } finally {
      if (srtTempPath && fs.existsSync(srtTempPath)) {
        try {
          fs.unlinkSync(srtTempPath);
        } catch {}
      }
    }

    // 6. Generate Poster Frame
    const posterTimestamp = Math.min(1.0, duration / 2).toFixed(2);
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        posterTimestamp,
        '-i',
        outputPath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        posterPath,
      ]);
    } catch (posterErr) {
      console.warn('[FFmpegRenderer] Poster generation warning:', posterErr);
    }

    return { outputPath, posterPath };
  }
}
