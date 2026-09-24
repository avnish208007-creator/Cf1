import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaValidator, RawProbeData } from '../rendering/media-validator';
import { AuthorizedDirectUrlProvider } from './providers/direct-url.provider';
import { AuthorizedStorageProvider } from './providers/storage.provider';
import { DevelopmentTestMediaProvider } from './providers/dev-test.provider';
import { MediaAcquisitionService } from './media.service';
import { RendererHandoffService } from '../rendering/renderer-handoff.service';
import { tempMediaWorkspace } from './temporary-workspace';
import { SourceVideo, ClipCandidate, ValidatedMedia } from '../../types';
import fs from 'node:fs';

describe('ClipFlow Authorized Media Acquisition and Validation Pipeline', () => {
  describe('MediaValidator: Moving Media & Frame Progression Checks', () => {
    it('accepts valid moving media with real frame progression and supported codecs', () => {
      const probe: RawProbeData = {
        format: {
          format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
          duration: '45.000000',
          size: '15480000',
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            nb_frames: '1350', // 30 fps * 45s = 1350 frames
            r_frame_rate: '30/1',
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
          },
        ],
      };

      const result = MediaValidator.validateSourceMedia(probe, {
        candidateStartTime: 10,
        candidateEndTime: 35,
        requireAudio: true,
      });

      expect(result.passed).toBe(true);
      expect(result.validContainer).toBe(true);
      expect(result.hasVideoStream).toBe(true);
      expect(result.hasAudioStream).toBe(true);
      expect(result.framesActuallyChange).toBe(true);
      expect(result.browserCompatibleCodec).toBe(true);
    });

    it('rejects static image containers (e.g. image2, png_pipe)', () => {
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
            width: 1280,
            height: 720,
            nb_frames: '1',
          },
        ],
      };

      const result = MediaValidator.validateSourceMedia(staticImageProbe);
      expect(result.passed).toBe(false);
      expect(result.validContainer).toBe(false);
      expect(result.validationLog).toContain('STATIC_MEDIA_REJECTED');
    });

    it('rejects static image codecs masquerading as video (e.g. mjpeg, webp)', () => {
      const mjpegProbe: RawProbeData = {
        format: {
          format_name: 'mp4',
          duration: '30.000000',
          size: '2000000',
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'mjpeg', // Static image sequence
            width: 1920,
            height: 1080,
            nb_frames: '30',
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
          },
        ],
      };

      const result = MediaValidator.validateSourceMedia(mjpegProbe);
      expect(result.passed).toBe(false);
      expect(result.validationLog).toContain('STATIC_MEDIA_REJECTED');
    });

    it('rejects single-frame or zero-frame files (thumbnail loops)', () => {
      const singleFrameProbe: RawProbeData = {
        format: {
          format_name: 'mov,mp4',
          duration: '30.000000',
          size: '500000',
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            nb_frames: '1', // Single static image looped
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
          },
        ],
      };

      const result = MediaValidator.validateSourceMedia(singleFrameProbe);
      expect(result.passed).toBe(false);
      expect(result.framesActuallyChange).toBe(false);
      expect(result.validationLog).toContain('STATIC_MEDIA_REJECTED: Single frame detected');
    });

    it('rejects empty or corrupted files', () => {
      const emptyProbe: RawProbeData = {
        format: {
          format_name: 'mp4',
          duration: '0',
          size: '0', // Zero size
        },
        streams: [],
      };

      const result = MediaValidator.validateSourceMedia(emptyProbe);
      expect(result.passed).toBe(false);
      expect(result.fileExists).toBe(false);
      expect(result.hasVideoStream).toBe(false);

      const tinyCorruptProbe: RawProbeData = {
        format: {
          format_name: 'mp4',
          duration: '0',
          size: '120', // Tiny corrupt stub (< 10000 bytes)
        },
        streams: [],
      };

      const tinyResult = MediaValidator.validateSourceMedia(tinyCorruptProbe);
      expect(tinyResult.passed).toBe(false);
      expect(tinyResult.validationLog).toContain('empty');
    });
  });

  describe('Candidate Timestamp Validation (No Silent Clamping)', () => {
    it('accepts timestamps strictly within video duration and short-form constraints (15-60s)', () => {
      const check = MediaValidator.validateCandidateTimestamps(
        { startTime: 5, endTime: 35 },
        120.0, // actual media duration
      );
      expect(check.valid).toBe(true);
    });

    it('rejects candidates whose end timestamp exceeds actual media duration without clamping', () => {
      const check = MediaValidator.validateCandidateTimestamps(
        { startTime: 30, endTime: 75 },
        60.0, // media is only 60s long
      );
      expect(check.valid).toBe(false);
      expect(check.error).toContain('CANDIDATE_TIMESTAMP_INVALID');
      expect(check.error).toContain('exceeds actual media duration');
      expect(check.error).toContain('Silently clamping timestamps is prohibited');
    });

    it('rejects candidates with duration under 15 seconds', () => {
      const check = MediaValidator.validateCandidateTimestamps(
        { startTime: 10, endTime: 20 }, // 10s duration
        100.0,
      );
      expect(check.valid).toBe(false);
      expect(check.error).toContain('outside the required short-form range of 15s to 60s');
    });

    it('rejects candidates with duration over 60 seconds', () => {
      const check = MediaValidator.validateCandidateTimestamps(
        { startTime: 10, endTime: 85 }, // 75s duration
        200.0,
      );
      expect(check.valid).toBe(false);
      expect(check.error).toContain('outside the required short-form range of 15s to 60s');
    });

    it('rejects negative start timestamps or inverted bounds', () => {
      const negCheck = MediaValidator.validateCandidateTimestamps(
        { startTime: -5, endTime: 25 },
        100.0,
      );
      expect(negCheck.valid).toBe(false);
      expect(negCheck.error).toContain('cannot be negative');

      const invCheck = MediaValidator.validateCandidateTimestamps(
        { startTime: 30, endTime: 20 },
        100.0,
      );
      expect(invCheck.valid).toBe(false);
      expect(invCheck.error).toContain('strictly greater than start timestamp');
    });
  });

  describe('Authorized Media Provider Architecture & Strict Isolation', () => {
    const mockYouTubeSource: SourceVideo = {
      id: 'src_yt_101',
      externalId: 'yt_abc_999',
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=yt_abc_999',
      title: 'YouTube Metadata Discovery Video',
      channelTitle: 'Creator Channel',
      thumbnailUrl: 'https://img.youtube.com/vi/yt_abc_999/hqdefault.jpg',
      publishedAt: '2026-01-01T00:00:00Z',
      duration: 120,
      description: 'Metadata only',
      discoveredAt: '2026-03-01T00:00:00Z',
      relevanceScore: 90,
      relevanceReason: 'Matches niche',
      status: 'discovered',
    };

    it('AuthorizedDirectUrlProvider strictly rejects YouTube watch URLs and directs to authorized sources', () => {
      const provider = new AuthorizedDirectUrlProvider();
      expect(provider.canAcquire(mockYouTubeSource)).toBe(false);
    });

    it('DevelopmentTestMediaProvider strictly isolates Big Buck Bunny and refuses to act as silent fallback for YouTube sources', async () => {
      const devProvider = new DevelopmentTestMediaProvider(false);

      // Must not accept regular YouTube production source
      expect(devProvider.canAcquire(mockYouTubeSource)).toBe(false);

      // Must throw isolation violation if forced
      await expect(
        devProvider.acquire(mockYouTubeSource, '/tmp'),
      ).rejects.toThrow('ISOLATION_VIOLATION');
    });

    it('MediaAcquisitionService throws MEDIA_SOURCE_UNAVAILABLE when only YouTube watch URL is provided', async () => {
      const service = new MediaAcquisitionService();

      await expect(
        service.acquireAndValidate({
          source: mockYouTubeSource,
        }),
      ).rejects.toThrow('MEDIA_SOURCE_UNAVAILABLE');
    });
  });

  describe('Renderer Handoff Preparation', () => {
    it('prepares validated renderer handoff input and preserves exact candidate timestamps', () => {
      const mockValidatedMedia: ValidatedMedia = {
        sourceVideoId: 'src_test_01',
        candidateId: 'cand_test_01',
        localMediaPath: 'public/dev-media/authorized_sample.mp4',
        sourceType: 'AUTHORIZED_STORAGE',
        provider: 'storage_provider',
        fileSizeBytes: 15000000,
        durationSeconds: 40.0,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        nbFrames: 1200,
        fps: 30,
        validatedAt: new Date().toISOString(),
        validation: {
          passed: true,
          fileExists: true,
          fileSizeBytes: 15000000,
          validContainer: true,
          hasVideoStream: true,
          hasAudioStream: true,
          durationSeconds: 40.0,
          width: 1920,
          height: 1080,
          isNineSixteen: false,
          framesActuallyChange: true,
          browserCompatibleCodec: true,
          validationTimestamp: new Date().toISOString(),
        },
      };

      const mockCandidate: ClipCandidate = {
        id: 'cand_test_01',
        sourceId: 'src_test_01',
        sourceVideoId: 'src_test_01',
        sourceTitle: 'Moving Media Source',
        sourceChannel: 'Test Channel',
        sourceThumbnail: '',
        sourceUrl: '',
        startTime: 10.0,
        endTime: 35.0,
        duration: 25.0,
        hook: 'Exciting Hook Segment',
        summary: 'High retention segment',
        context: 'Context',
        payoff: 'Payoff',
        reason: 'Reason',
        confidence: 95,
        scores: {
          hook: 92,
          curiosity: 88,
          payoff: 90,
          standaloneContext: 85,
          clarity: 90,
          emotionalValue: 80,
          shortFormPotential: 92,
          overall: 90,
        },
        qualityTier: 'Excellent',
        status: 'approved',
        createdAt: new Date().toISOString(),
      };

      const mockSource: SourceVideo = {
        id: 'src_test_01',
        externalId: 'ext_test_01',
        platform: 'local_authorized',
        url: 'public/dev-media/authorized_sample.mp4',
        title: 'Moving Media Source',
        channelTitle: 'Test Channel',
        thumbnailUrl: '',
        publishedAt: '2026-01-01T00:00:00Z',
        duration: 40.0,
        description: 'Test description',
        discoveredAt: '2026-01-01T00:00:00Z',
        relevanceScore: 95,
        relevanceReason: 'Niche match',
        status: 'discovered',
      };

      const handoff = RendererHandoffService.prepareHandoff(
        mockValidatedMedia,
        mockCandidate,
        mockSource,
      );

      expect(handoff.candidateId).toBe('cand_test_01');
      expect(handoff.startTime).toBe(10.0);
      expect(handoff.endTime).toBe(35.0);
      expect(handoff.duration).toBe(25.0);
      expect(handoff.validatedMedia.localMediaPath).toBe(
        'public/dev-media/authorized_sample.mp4',
      );
    });

    it('throws error when candidate timestamp exceeds media duration at renderer handoff', () => {
      const mockValidatedMedia: ValidatedMedia = {
        sourceVideoId: 'src_test_01',
        localMediaPath: 'public/dev-media/authorized_sample.mp4',
        sourceType: 'AUTHORIZED_STORAGE',
        provider: 'storage_provider',
        fileSizeBytes: 15000000,
        durationSeconds: 30.0, // Media is only 30s
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        nbFrames: 900,
        fps: 30,
        validatedAt: new Date().toISOString(),
        validation: {} as any,
      };

      const mockCandidate: ClipCandidate = {
        id: 'cand_test_01',
        sourceId: 'src_test_01',
        sourceVideoId: 'src_test_01',
        sourceTitle: 'Moving Media Source',
        sourceChannel: 'Test Channel',
        sourceThumbnail: '',
        sourceUrl: '',
        startTime: 10.0,
        endTime: 45.0, // 45s exceeds 30s duration!
        duration: 35.0,
        hook: 'Hook',
        summary: 'Summary',
        context: 'Context',
        payoff: 'Payoff',
        reason: 'Reason',
        confidence: 90,
        scores: {} as any,
        qualityTier: 'Excellent',
        status: 'approved',
        createdAt: new Date().toISOString(),
      };

      const mockSource: SourceVideo = {
        id: 'src_test_01',
        externalId: 'ext_test_01',
        platform: 'local_authorized',
        url: '',
        title: 'Title',
        channelTitle: 'Channel',
        thumbnailUrl: '',
        publishedAt: '',
        duration: 30,
        description: '',
        discoveredAt: '',
        relevanceScore: 90,
        relevanceReason: '',
        status: 'discovered',
      };

      expect(() =>
        RendererHandoffService.prepareHandoff(
          mockValidatedMedia,
          mockCandidate,
          mockSource,
        ),
      ).toThrow('RENDERER_HANDOFF_FAILED: CANDIDATE_TIMESTAMP_INVALID');
    });
  });

  describe('Temporary Processing Workspace Lifecycle', () => {
    it('creates and cleans up ephemeral directories cleanly', async () => {
      const ws = await tempMediaWorkspace.create('lifecycle_test');
      expect(fs.existsSync(ws.dir)).toBe(true);

      // Create a dummy temporary file inside
      const tempFile = `${ws.dir}/dummy.tmp`;
      fs.writeFileSync(tempFile, 'temporary data');
      expect(fs.existsSync(tempFile)).toBe(true);

      // Cleanup
      const cleaned = await tempMediaWorkspace.cleanup(ws.dir);
      expect(cleaned).toBe(true);
      expect(fs.existsSync(ws.dir)).toBe(false);
      expect(fs.existsSync(tempFile)).toBe(false);
    });
  });
});
