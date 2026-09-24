import fs from 'node:fs';
import path from 'node:path';
import {
  RenderRequestInput,
  RenderExecutionResult,
  RenderOptions,
} from './render-config';
import { RenderValidator } from './render-validator';
import { FFmpegRenderer } from './ffmpeg-renderer';
import { RenderProgressTracker, ProgressCallback } from './render-progress';
import { tempMediaWorkspace } from '../media/temporary-workspace';

export class RendererService {
  private outputsDir = path.resolve(process.cwd(), 'public/outputs');

  constructor() {
    if (!fs.existsSync(this.outputsDir)) {
      fs.mkdirSync(this.outputsDir, { recursive: true });
    }
  }

  /**
   * Executes the full V1 Reel Rendering Pipeline
   */
  public async render(
    request: RenderRequestInput,
    onProgress?: ProgressCallback,
    options?: Partial<RenderOptions>,
  ): Promise<RenderExecutionResult> {
    const progressTracker = new RenderProgressTracker(onProgress);

    // 1. Strict Authorization & Source Path Verification
    if (
      !request.sourcePath ||
      request.sourcePath.includes('youtube.com') ||
      request.sourcePath.includes('youtu.be')
    ) {
      throw new Error(
        'MEDIA_SOURCE_UNAVAILABLE: YouTube watch URLs are discovery references only and cannot be passed to the video renderer. Provide an authorized moving media source (AUTHORIZED_DIRECT_URL or AUTHORIZED_STORAGE).',
      );
    }

    const resolvedSourcePath = path.isAbsolute(request.sourcePath)
      ? request.sourcePath
      : path.resolve(process.cwd(), request.sourcePath);

    progressTracker.setStep(
      'PREPARING',
      10,
      'Validating source moving media and candidate timestamps...',
    );

    // 2. Pre-Render Validation
    const { sourceProbe, sourceHadAudio } = await RenderValidator.validateInput(
      request,
      resolvedSourcePath,
    );

    // 3. Ephemeral Processing Workspace Creation
    const workspaceName = `render_${request.candidateId}_${Date.now()}`;
    const workspace = await tempMediaWorkspace.create(workspaceName);

    const tempOutputPath = path.join(workspace.dir, `clip_${request.candidateId}.mp4`);
    const tempPosterPath = path.join(workspace.dir, `poster_${request.candidateId}.jpg`);

    try {
      progressTracker.setStep(
        'RENDERING',
        30,
        'Encoding 1080x1920 9:16 vertical stream with FFmpeg...',
      );

      // 4. Real FFmpeg Rendering Execution
      await FFmpegRenderer.renderClip({
        input: request,
        resolvedSourcePath,
        tempWorkspaceDir: workspace.dir,
        outputPath: tempOutputPath,
        posterPath: tempPosterPath,
        sourceHadAudio,
        options,
      });

      progressTracker.setStep(
        'VALIDATING',
        75,
        'Running ffprobe stream and frame-progression validation on rendered output...',
      );

      const requestedDuration = request.endTime - request.startTime;

      // 5. Post-Render Output Validation
      const validation = await RenderValidator.validateOutput(
        tempOutputPath,
        requestedDuration,
        sourceHadAudio,
      );

      progressTracker.setStep(
        'FINALIZING',
        90,
        'Persisting rendered clip and generating web distribution artifacts...',
      );

      // 6. Copy validated artifacts to public output store
      const finalOutputFileName = `clip_${request.candidateId}.mp4`;
      const finalPosterFileName = `poster_${request.candidateId}.jpg`;
      const finalOutputPath = path.join(this.outputsDir, finalOutputFileName);
      const finalPosterPath = path.join(this.outputsDir, finalPosterFileName);

      fs.copyFileSync(tempOutputPath, finalOutputPath);
      if (fs.existsSync(tempPosterPath)) {
        fs.copyFileSync(tempPosterPath, finalPosterPath);
      }

      progressTracker.setStep(
        'FINALIZING',
        100,
        'Render completed and verified successfully.',
      );

      return {
        clipId: `clip_${request.candidateId}`,
        videoUrl: `/outputs/${finalOutputFileName}`,
        posterUrl: fs.existsSync(finalPosterPath) ? `/outputs/${finalPosterFileName}` : '',
        width: validation.width,
        height: validation.height,
        duration: validation.durationSeconds,
        fileSizeBytes: validation.fileSizeBytes,
        codec: { video: 'h264', audio: sourceHadAudio ? 'aac' : 'none' },
        validation,
      };
    } finally {
      // 7. Ephemeral Processing Workspace Teardown
      await tempMediaWorkspace.cleanup(workspace.dir);
    }
  }
}
