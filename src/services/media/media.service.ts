import fs from 'node:fs';
import {
  SourceVideo,
  ClipCandidate,
  AuthorizedMediaSource,
  ValidatedMedia,
  ValidatedRendererInput,
} from '../../types';
import { IMediaProvider, AcquiredMediaResult } from './media-provider.interface';
import { AuthorizedDirectUrlProvider } from './providers/direct-url.provider';
import { AuthorizedStorageProvider } from './providers/storage.provider';
import { DevelopmentTestMediaProvider } from './providers/dev-test.provider';
import { tempMediaWorkspace } from './temporary-workspace';
import { FFprobeRunner } from './ffprobe-runner';
import { MediaValidator } from '../rendering/media-validator';
import { RendererHandoffService } from '../rendering/renderer-handoff.service';

export interface AcquireAndValidateResult {
  validatedMedia: ValidatedMedia;
  temporaryWorkspaceDir: string;
  cleanup: () => Promise<void>;
}

export class MediaAcquisitionService {
  private providers: IMediaProvider[] = [
    new AuthorizedDirectUrlProvider(),
    new AuthorizedStorageProvider(),
    new DevelopmentTestMediaProvider(false),
  ];

  /**
   * Returns the registered provider capable of acquiring authorized media for the source.
   */
  getProvider(
    source: SourceVideo,
    mediaSource?: AuthorizedMediaSource,
  ): IMediaProvider | null {
    const activeMediaSource = mediaSource || source.mediaSource;

    for (const provider of this.providers) {
      if (provider.canAcquire(source, activeMediaSource)) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Checks if an authorized media provider is available for the given source.
   */
  canAcquire(source: SourceVideo, mediaSource?: AuthorizedMediaSource): boolean {
    return Boolean(this.getProvider(source, mediaSource));
  }

  /**
   * Full pipeline:
   * Approved Candidate
   * → determine authorized media source
   * → acquire authorized moving media to temporary workspace
   * → probe with ffprobe & validate moving media (no static images/thumbnails)
   * → validate candidate timestamps against actual duration (no silent clamping)
   * → return validated media with temporary workspace lifecycle cleanup handle
   */
  async acquireAndValidate(params: {
    source: SourceVideo;
    candidate?: ClipCandidate;
    mediaSource?: AuthorizedMediaSource;
    isTestPipeline?: boolean;
  }): Promise<AcquireAndValidateResult> {
    const { source, candidate, mediaSource, isTestPipeline } = params;
    const activeMediaSource = mediaSource || source.mediaSource;

    // 1. Determine authorized provider
    let provider: IMediaProvider | null = null;
    if (isTestPipeline || activeMediaSource?.sourceType === 'DEVELOPMENT_TEST_MEDIA') {
      provider = new DevelopmentTestMediaProvider(true);
    } else {
      provider = this.getProvider(source, activeMediaSource);
    }

    if (!provider) {
      if (source.platform === 'youtube') {
        throw new Error(
          `MEDIA_SOURCE_UNAVAILABLE: YouTube watch URL (${source.url}) is a discovery reference only. YouTube Data API does not provide downloadable media, and ClipFlow strictly complies with Terms of Service by never using stream extractors, scrapers, or DRM bypasses. An explicit authorized media source (AUTHORIZED_DIRECT_URL or AUTHORIZED_STORAGE) is required to acquire moving media.`,
        );
      }
      throw new Error(
        `MEDIA_SOURCE_UNAVAILABLE: No authorized media provider available for source "${source.title}". Provide an authorized direct URL or storage reference.`,
      );
    }

    // 2. Create isolated ephemeral processing workspace
    const workspace = await tempMediaWorkspace.create(
      `acquire_${candidate?.id || source.id}`,
    );

    const cleanup = async () => {
      await tempMediaWorkspace.cleanup(workspace.dir);
    };

    let acquiredResult: AcquiredMediaResult;
    try {
      // 3. Acquire actual moving media into temporary workspace
      acquiredResult = await provider.acquire(
        source,
        workspace.dir,
        activeMediaSource,
      );

      // Verify file physically exists on disk
      if (!fs.existsSync(acquiredResult.localMediaPath)) {
        throw new Error(
          `MEDIA_ACQUISITION_FAILED: Acquired media file does not exist at expected path "${acquiredResult.localMediaPath}".`,
        );
      }
    } catch (acqErr: any) {
      await cleanup();
      throw acqErr;
    }

    // 4. Validate source media with FFprobe
    try {
      const probeData = await FFprobeRunner.probe(acquiredResult.localMediaPath);

      // Run static-media & frame-progression validation
      const validation = MediaValidator.validateSourceMedia(probeData, {
        candidateStartTime: candidate?.startTime,
        candidateEndTime: candidate?.endTime,
        requireAudio: true,
      });

      if (!validation.passed) {
        throw new Error(validation.validationLog || 'MEDIA_VALIDATION_FAILED');
      }

      // Check frame progression
      const progressionCheck = await FFprobeRunner.verifyFrameProgression(
        acquiredResult.localMediaPath,
        15,
      );

      if (!progressionCheck.hasProgression) {
        throw new Error(
          `STATIC_MEDIA_REJECTED: ${progressionCheck.details}. Moving video required.`,
        );
      }

      // 5. Candidate Timestamp Validation
      if (candidate) {
        const tsCheck = MediaValidator.validateCandidateTimestamps(
          candidate,
          validation.durationSeconds,
        );
        if (!tsCheck.valid) {
          throw new Error(tsCheck.error || 'CANDIDATE_TIMESTAMP_INVALID');
        }
      }

      const videoStream = (probeData.streams || []).find(
        (s) => s.codec_type === 'video',
      );
      const audioStream = (probeData.streams || []).find(
        (s) => s.codec_type === 'audio',
      );

      const nbFrames = parseInt(videoStream?.nb_frames || '0', 10);
      const fps = parseFloat(videoStream?.r_frame_rate || '30') || 30;

      const validatedMedia: ValidatedMedia = {
        sourceVideoId: source.id,
        candidateId: candidate?.id,
        localMediaPath: acquiredResult.localMediaPath,
        sourceType: acquiredResult.sourceType,
        provider: acquiredResult.provider,
        fileSizeBytes: validation.fileSizeBytes,
        durationSeconds: validation.durationSeconds,
        width: validation.width,
        height: validation.height,
        videoCodec: videoStream?.codec_name || 'unknown',
        audioCodec: audioStream?.codec_name || 'unknown',
        nbFrames,
        fps,
        validatedAt: new Date().toISOString(),
        validation,
      };

      return {
        validatedMedia,
        temporaryWorkspaceDir: workspace.dir,
        cleanup,
      };
    } catch (valErr: any) {
      // Ephemeral cleanup on validation failure
      await cleanup();
      throw valErr;
    }
  }

  /**
   * Isolated development-only test harness:
   * Tests real moving media acquisition, ffprobe probing, frame progression,
   * duration checks, timestamp bounds validation, renderer handoff, and temporary file cleanup.
   */
  async testPipeline(): Promise<{
    success: boolean;
    stepResults: Array<{ step: string; status: 'passed' | 'failed'; details: string }>;
    validatedMedia: ValidatedMedia;
    handoff: ValidatedRendererInput;
  }> {
    const stepResults: Array<{ step: string; status: 'passed' | 'failed'; details: string }> = [];

    const mockDevSource: SourceVideo = {
      id: 'src_dev_test_bbb',
      externalId: 'dev_test_authorized_bbb',
      platform: 'local_authorized',
      url: '/dev-media/authorized_sample.mp4',
      title: '[DEVELOPMENT TEST ONLY] Big Buck Bunny Sunflower HD Moving Media Sample',
      channelTitle: 'Blender Foundation (CC BY 3.0)',
      thumbnailUrl: '',
      publishedAt: '2026-01-01T00:00:00Z',
      duration: 40,
      description: 'Isolated test source for media pipeline verification.',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 100,
      relevanceReason: 'Technical pipeline verification only.',
      status: 'discovered',
      mediaSource: {
        sourceType: 'DEVELOPMENT_TEST_MEDIA',
        mediaUrl: '/dev-media/authorized_sample.mp4',
        authorizationStatus: 'authorized',
        provider: 'blender_foundation_cc_by',
        contentIdentifier: 'big_buck_bunny_hd',
        acquiredAt: new Date().toISOString(),
        validationStatus: 'valid',
      },
    };

    const mockCandidate: ClipCandidate = {
      id: 'cand_test_bbb_01',
      sourceId: mockDevSource.id,
      sourceVideoId: mockDevSource.id,
      sourceTitle: mockDevSource.title,
      sourceChannel: mockDevSource.channelTitle,
      sourceThumbnail: '',
      sourceUrl: mockDevSource.url,
      startTime: 10.0,
      endTime: 35.0,
      duration: 25.0,
      hook: 'Test Moving Media Segment',
      summary: 'Isolated test candidate for pipeline verification',
      context: 'Test context',
      payoff: 'Test payoff',
      reason: 'Validation test',
      confidence: 100,
      scores: {
        hook: 90,
        curiosity: 85,
        payoff: 88,
        standaloneContext: 90,
        clarity: 92,
        emotionalValue: 80,
        shortFormPotential: 90,
        overall: 89,
      },
      qualityTier: 'Excellent',
      status: 'approved',
      createdAt: new Date().toISOString(),
    };

    // Step 1: Acquisition into temporary workspace
    const { validatedMedia, temporaryWorkspaceDir, cleanup } =
      await this.acquireAndValidate({
        source: mockDevSource,
        candidate: mockCandidate,
        isTestPipeline: true,
      });

    stepResults.push({
      step: 'ACQUIRE',
      status: 'passed',
      details: `Acquired ${(validatedMedia.fileSizeBytes / 1024 / 1024).toFixed(
        2,
      )} MB moving media to temp workspace "${temporaryWorkspaceDir}"`,
    });

    // Step 2: FFprobe probe validation
    stepResults.push({
      step: 'FFPROBE',
      status: 'passed',
      details: `Container=${validatedMedia.validation.validContainer ? 'valid' : 'invalid'}, Video=${
        validatedMedia.videoCodec
      } (${validatedMedia.width}x${validatedMedia.height}), Audio=${
        validatedMedia.audioCodec
      }, Duration=${validatedMedia.durationSeconds.toFixed(2)}s, Frames=${
        validatedMedia.nbFrames
      }`,
    });

    // Step 3: Frame progression verification
    stepResults.push({
      step: 'FRAME_PROGRESSION',
      status: 'passed',
      details: `Verified real frame progression (${validatedMedia.nbFrames} frames, ~${Math.round(
        validatedMedia.fps,
      )} fps). Static image fallbacks rejected.`,
    });

    // Step 4: Candidate timestamp validation
    stepResults.push({
      step: 'TIMESTAMP_VALIDATION',
      status: 'passed',
      details: `Candidate timestamps [${mockCandidate.startTime}s - ${mockCandidate.endTime}s] (${mockCandidate.duration}s duration) strictly verified against ${validatedMedia.durationSeconds.toFixed(
        2,
      )}s media. No silent clamping.`,
    });

    // Step 5: Renderer handoff preparation
    const handoff = RendererHandoffService.prepareHandoff(
      validatedMedia,
      mockCandidate,
      mockDevSource,
    );

    stepResults.push({
      step: 'RENDERER_HANDOFF',
      status: 'passed',
      details: `Verified renderer input handoff prepared with validated media path "${validatedMedia.localMediaPath}"`,
    });

    // Step 6: Temporary processing cleanup
    const tempFileExistedBefore = fs.existsSync(validatedMedia.localMediaPath);
    await cleanup();
    const tempFileExistsAfter = fs.existsSync(validatedMedia.localMediaPath);

    if (tempFileExistedBefore && !tempFileExistsAfter) {
      stepResults.push({
        step: 'TEMPORARY_CLEANUP',
        status: 'passed',
        details: 'Temporary processing workspace and source media file cleanly deleted.',
      });
    } else {
      stepResults.push({
        step: 'TEMPORARY_CLEANUP',
        status: 'failed',
        details: `Temporary file still exists after cleanup: ${validatedMedia.localMediaPath}`,
      });
    }

    return {
      success: stepResults.every((s) => s.status === 'passed'),
      stepResults,
      validatedMedia,
      handoff,
    };
  }
}

export const mediaAcquisitionService = new MediaAcquisitionService();
export const mediaService = mediaAcquisitionService;
