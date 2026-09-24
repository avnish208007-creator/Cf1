import { IMediaProvider, AcquiredMediaResult } from './media-provider.interface';
import { SourceVideo, AuthorizedMediaSource } from '../../types';
import { DevelopmentTestMediaProvider } from './providers/dev-test.provider';

export class DevelopmentMediaProvider implements IMediaProvider {
  readonly id = 'dev_media_provider';
  readonly name = '[DEVELOPMENT TEST ONLY] Isolated Test Media Provider';
  readonly sourceType = 'DEVELOPMENT_TEST_MEDIA';

  private provider: DevelopmentTestMediaProvider;

  constructor(isExplicitlyAllowed: boolean) {
    this.provider = new DevelopmentTestMediaProvider(isExplicitlyAllowed);
  }

  canAcquire(source: SourceVideo, mediaSource?: AuthorizedMediaSource): boolean {
    return this.provider.canAcquire(source, mediaSource);
  }

  async acquire(
    source: SourceVideo,
    targetDir: string,
    mediaSource?: AuthorizedMediaSource,
  ): Promise<AcquiredMediaResult> {
    return this.provider.acquire(source, targetDir, mediaSource);
  }
}
