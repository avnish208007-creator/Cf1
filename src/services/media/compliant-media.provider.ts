import { IMediaProvider, AcquiredMediaResult } from './media-provider.interface';
import { SourceVideo, AuthorizedMediaSource } from '../../types';
import { AuthorizedDirectUrlProvider } from './providers/direct-url.provider';

export class CompliantMediaProvider implements IMediaProvider {
  readonly id = 'compliant_production_provider';
  readonly name = 'Compliant Production Media Provider';
  readonly sourceType = 'AUTHORIZED_DIRECT_URL';

  private directProvider = new AuthorizedDirectUrlProvider();

  canAcquire(source: SourceVideo, mediaSource?: AuthorizedMediaSource): boolean {
    return this.directProvider.canAcquire(source, mediaSource);
  }

  async acquire(
    source: SourceVideo,
    targetDir: string,
    mediaSource?: AuthorizedMediaSource,
  ): Promise<AcquiredMediaResult> {
    return this.directProvider.acquire(source, targetDir, mediaSource);
  }
}
