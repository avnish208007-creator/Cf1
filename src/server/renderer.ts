import { RendererService } from '../services/rendering/renderer.service';
import { RenderRequest, RenderResult } from '../services/rendering/renderer.interface';
import { ProgressCallback } from '../services/rendering/render-progress';

export class ServerVideoRenderer {
  private renderer = new RendererService();

  async render(
    req: RenderRequest,
    onProgress?: (progress: { stage: string; percent: number; message: string }) => void,
  ): Promise<RenderResult> {
    const result = await this.renderer.render(
      {
        candidateId: req.candidateId,
        sourceVideoId: req.sourceVideoId,
        sourcePath: req.sourcePath,
        startTime: req.startTime,
        endTime: req.endTime || req.startTime + req.duration,
        duration: req.duration,
        subtitleText: req.subtitleText,
        subtitlePreferences: req.subtitlePreferences,
        captionStyle: req.captionStyle,
        brandAccent: req.brandAccent,
      },
      onProgress
        ? (p) => {
            onProgress({
              stage: p.step,
              percent: p.progress,
              message: p.message,
            });
          }
        : undefined,
    );

    return result;
  }
}
