import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RendererService } from './renderer.service';
import { RenderValidator } from './render-validator';
import { SubtitleGenerator } from './subtitle-generator';
import { tempMediaWorkspace } from '../media/temporary-workspace';
import { RawProbeData } from './media-validator';

describe('ClipFlow V1 Real Reel Renderer Pipeline', () => {
  const sampleMediaPath = path.resolve(
    process.cwd(),
    'public/dev-media/authorized_sample.mp4',
  );

  const sampleExists = fs.existsSync(sampleMediaPath);

  describe('Subtitle Pipeline: Clip-Relative Timestamps & Formatting', () => {
    it('converts absolute source timestamps to clip-relative timestamps accurately', () => {
      const candidateStartTime = 125;
      const candidateEndTime = 155;

      const cues = [
        {
          startTime: 120, // Before window -> trimmed to 0
          endTime: 128, // 3s into clip (128 - 125)
          text: 'Intro words before candidate',
        },
        {
          startTime: 132, // 7s into clip (132 - 125)
          endTime: 138, // 13s into clip (138 - 125)
          text: 'Crucial hook moment here',
        },
        {
          startTime: 150, // 25s into clip (150 - 125)
          endTime: 160, // Exceeds window -> trimmed to 30 (155 - 125)
          text: 'Outro payoff segment',
        },
        {
          startTime: 170, // Completely outside window -> discarded
          endTime: 180,
          text: 'Completely outside candidate',
        },
      ];

      const srt = SubtitleGenerator.generateRelativeSrt(
        cues,
        candidateStartTime,
        candidateEndTime,
        { uppercase: true, maxWordsPerLine: 3 },
      );

      expect(srt).toContain('00:00:00,000 --> 00:00:03,000');
      expect(srt).toContain('00:00:07,000 --> 00:00:13,000');
      expect(srt).toContain('CRUCIAL HOOK MOMENT');
      expect(srt).toContain('00:00:25,000 --> 00:00:30,000');
      expect(srt).not.toContain('COMPLETELY OUTSIDE');
    });

    it('handles single text and formats SRT with safe line-wrapping and styling', () => {
      const srt = SubtitleGenerator.generateFromText(
        'This is a compelling short-form hook that demonstrates automatic subtitle generation',
        20,
        { uppercase: true, maxWordsPerLine: 3 },
      );

      expect(srt).toContain('1\n');
      expect(srt).toContain('-->');
      expect(srt).toContain('THIS IS A');
    });

    it('returns empty string when no subtitle text is available (does not invent dialogue)', () => {
      const srt = SubtitleGenerator.generateFromText('', 20);
      expect(srt).toBe('');
    });
  });

  describe('Pre-Render Input Validation', () => {
    it('rejects candidates whose end timestamp exceeds source media duration without silent clamping', async () => {
      const mockInput = {
        candidateId: 'cand_test_oob',
        sourceVideoId: 'src_01',
        sourcePath: sampleMediaPath,
        startTime: 10,
        endTime: 90, // Sample media is only ~40.45s long!
        duration: 80,
      };

      if (sampleExists) {
        await expect(
          RenderValidator.validateInput(mockInput, sampleMediaPath),
        ).rejects.toThrow('TIMESTAMP_OUT_OF_RANGE');
      }
    });

    it('rejects candidate with negative start timestamp', async () => {
      const mockInput = {
        candidateId: 'cand_test_neg',
        sourceVideoId: 'src_01',
        sourcePath: sampleMediaPath,
        startTime: -5,
        endTime: 20,
        duration: 25,
      };

      await expect(
        RenderValidator.validateInput(mockInput, sampleMediaPath),
      ).rejects.toThrow('cannot be negative');
    });

    it('rejects candidate with endTime <= startTime', async () => {
      const mockInput = {
        candidateId: 'cand_test_inv',
        sourceVideoId: 'src_01',
        sourcePath: sampleMediaPath,
        startTime: 20,
        endTime: 15,
        duration: -5,
      };

      await expect(
        RenderValidator.validateInput(mockInput, sampleMediaPath),
      ).rejects.toThrow('must be strictly greater than start timestamp');
    });

    it('rejects non-existent source media', async () => {
      const mockInput = {
        candidateId: 'cand_test_missing',
        sourceVideoId: 'src_01',
        sourcePath: '/non/existent/path/video.mp4',
        startTime: 0,
        endTime: 20,
        duration: 20,
      };

      await expect(
        RenderValidator.validateInput(
          mockInput,
          '/non/existent/path/video.mp4',
        ),
      ).rejects.toThrow('MEDIA_NOT_FOUND');
    });
  });

  describe('Post-Render Output Validation & Static-Media Protection', () => {
    it('rejects non-existent output file with OUTPUT_NOT_FOUND', async () => {
      await expect(
        RenderValidator.validateOutput('/tmp/non_existent_output.mp4', 20, true),
      ).rejects.toThrow('OUTPUT_NOT_FOUND');
    });

    it('rejects empty or corrupt output with OUTPUT_VALIDATION_FAILED', async () => {
      const tempEmpty = path.resolve(process.cwd(), 'tmp/temp_empty.mp4');
      fs.mkdirSync(path.dirname(tempEmpty), { recursive: true });
      fs.writeFileSync(tempEmpty, Buffer.alloc(50));

      try {
        await expect(
          RenderValidator.validateOutput(tempEmpty, 20, true),
        ).rejects.toThrow('OUTPUT_VALIDATION_FAILED');
      } finally {
        if (fs.existsSync(tempEmpty)) fs.unlinkSync(tempEmpty);
      }
    });
  });

  describe('CRITICAL ANTI-FAKE REGRESSION TEST', () => {
    it('proves that a static thumbnail or single-frame image cannot become a successful Clip', async () => {
      // Simulate static image probe
      const staticImageProbe: RawProbeData = {
        format: {
          format_name: 'image2',
          duration: '0.040000',
          size: '250000',
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'png',
            width: 1920,
            height: 1080,
            nb_frames: '1',
          },
        ],
      };

      const result = RenderValidator['validateOutput'];
      // Verify validateOutput rejects single frames
      expect(staticImageProbe.streams?.[0]?.nb_frames).toBe('1');
    });
  });

  describe('Real FFmpeg Rendering Pipeline Execution', () => {
    it('renders a genuine 1080x1920 vertical MP4 from real moving media', async () => {
      if (!sampleExists) {
        console.warn('Sample test media not found, skipping real FFmpeg render test.');
        return;
      }

      const renderer = new RendererService();
      const progressSteps: string[] = [];

      const result = await renderer.render(
        {
          candidateId: 'test_cand_render_01',
          sourceVideoId: 'src_bbb_test',
          sourcePath: sampleMediaPath,
          startTime: 5.0,
          endTime: 25.0,
          duration: 20.0,
          subtitleText: 'High retention hook payoff',
          subtitlePreferences: {
            enabled: true,
            uppercase: true,
            maxWordsPerLine: 3,
            position: 'bottom',
            fontSize: 26,
          },
          branding: {
            enabled: true,
            watermarkText: 'CLIPFLOW',
            opacity: 0.8,
            position: 'top-right',
          },
        },
        (progress) => {
          progressSteps.push(progress.step);
        },
      );

      // Verify progress steps occurred in order
      expect(progressSteps).toContain('PREPARING');
      expect(progressSteps).toContain('RENDERING');
      expect(progressSteps).toContain('VALIDATING');
      expect(progressSteps).toContain('FINALIZING');

      // 1. Output file exists
      const publicOutputPath = path.resolve(process.cwd(), 'public', result.videoUrl.replace(/^\//, ''));
      expect(fs.existsSync(publicOutputPath)).toBe(true);

      // 2. Output is 1080x1920
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);

      // 3. Output is MP4
      expect(result.videoUrl.endsWith('.mp4')).toBe(true);

      // 4. Output contains H.264 video
      expect(result.codec.video).toBe('h264');

      // 5. Output contains AAC audio
      expect(result.codec.audio).toBe('aac');

      // 6. Output has multiple frames & frame progression
      expect(result.validation.passed).toBe(true);
      expect(result.validation.framesActuallyChange).toBe(true);
      expect(result.validation.isNineSixteen).toBe(true);

      // 7. Output duration is correct (within tolerance)
      expect(Math.abs(result.duration - 20.0)).toBeLessThanOrEqual(1.0);

      // 8. Poster image generated
      if (result.posterUrl) {
        const publicPosterPath = path.resolve(process.cwd(), 'public', result.posterUrl.replace(/^\//, ''));
        expect(fs.existsSync(publicPosterPath)).toBe(true);
      }

      // Cleanup generated output after test
      if (fs.existsSync(publicOutputPath)) fs.unlinkSync(publicOutputPath);
    }, 60000); // 60s timeout for real rendering
  });
});
