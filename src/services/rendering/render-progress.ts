import { RenderStep, RenderProgressUpdate } from './render-config';

export type ProgressCallback = (update: RenderProgressUpdate) => void;

export class RenderProgressTracker {
  private currentStep: RenderStep = 'PREPARING';
  private currentProgress: number = 0;
  private currentMessage: string = 'Initializing render job...';

  constructor(private onProgress?: ProgressCallback) {}

  public setStep(step: RenderStep, progress: number, message: string) {
    this.currentStep = step;
    this.currentProgress = Math.max(0, Math.min(100, progress));
    this.currentMessage = message;

    if (this.onProgress) {
      this.onProgress({
        step: this.currentStep,
        progress: this.currentProgress,
        message: this.currentMessage,
      });
    }
  }

  public getStatus(): RenderProgressUpdate {
    return {
      step: this.currentStep,
      progress: this.currentProgress,
      message: this.currentMessage,
    };
  }
}
