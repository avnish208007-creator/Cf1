import fs from 'node:fs';
import path from 'node:path';
import { IMediaProvider, AcquiredMediaResult } from '../media-provider.interface';
import { SourceVideo, AuthorizedMediaSource } from '../../../types';

export class DevelopmentTestMediaProvider implements IMediaProvider {
  readonly id = 'dev_test_media_provider';
  readonly name = '[DEVELOPMENT TEST ONLY] Isolated Moving Media Provider';
  readonly sourceType = 'DEVELOPMENT_TEST_MEDIA';

  constructor(private isExplicitTestContext: boolean = false) {}

  canAcquire(source: SourceVideo, mediaSource?: AuthorizedMediaSource): boolean {
    const candidateSource = mediaSource || source.mediaSource;
    // Strict isolation: Only allows explicit DEVELOPMENT_TEST_MEDIA or isolated dev test ID
    if (candidateSource?.sourceType === 'DEVELOPMENT_TEST_MEDIA') {
      return true;
    }
    if (this.isExplicitTestContext && source.externalId.includes('dev_test')) {
      return true;
    }
    return false;
  }

  async acquire(
    source: SourceVideo,
    targetDir: string,
    mediaSource?: AuthorizedMediaSource,
  ): Promise<AcquiredMediaResult> {
    const candidateSource = mediaSource || source.mediaSource;

    // Strict Isolation Guard: Never allow Big Buck Bunny as silent fallback for production sources
    if (source.platform === 'youtube' && candidateSource?.sourceType !== 'DEVELOPMENT_TEST_MEDIA') {
      throw new Error(
        'ISOLATION_VIOLATION: Development test media (Big Buck Bunny) cannot be used as a silent fallback for real YouTube production sources.',
      );
    }

    if (!this.canAcquire(source, mediaSource)) {
      throw new Error(
        'MEDIA_SOURCE_UNAVAILABLE: Source is not configured as an authorized DEVELOPMENT_TEST_MEDIA test sample.',
      );
    }

    const sampleRelative = 'public/dev-media/authorized_sample.mp4';
    const sampleAbsolute = path.resolve(process.cwd(), sampleRelative);

    if (!fs.existsSync(sampleAbsolute)) {
      throw new Error(
        `DEVELOPMENT_TEST_MEDIA_NOT_FOUND: Authorized moving media sample not found at ${sampleAbsolute}.`,
      );
    }

    const safeSourceId = source.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.join(targetDir, `dev_test_${safeSourceId}.mp4`);

    fs.copyFileSync(sampleAbsolute, outPath);
    const stats = fs.statSync(outPath);

    return {
      sourceVideoId: source.id,
      localMediaPath: outPath,
      sourceType: 'DEVELOPMENT_TEST_MEDIA',
      provider: 'blender_foundation_cc_by',
      fileSizeBytes: stats.size,
      mimeType: 'video/mp4',
      contentIdentifier: 'big_buck_bunny_sunflower_hd_sample',
      acquiredAt: new Date().toISOString(),
      temporaryWorkspaceDir: targetDir,
    };
  }
}
