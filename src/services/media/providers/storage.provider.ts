import fs from 'node:fs';
import path from 'node:path';
import { IMediaProvider, AcquiredMediaResult } from '../media-provider.interface';
import { SourceVideo, AuthorizedMediaSource } from '../../../types';

export class AuthorizedStorageProvider implements IMediaProvider {
  readonly id = 'authorized_storage_provider';
  readonly name = 'Authorized Storage Media Provider';
  readonly sourceType = 'AUTHORIZED_STORAGE';

  canAcquire(source: SourceVideo, mediaSource?: AuthorizedMediaSource): boolean {
    const candidateSource = mediaSource || source.mediaSource;
    if (candidateSource && candidateSource.sourceType === 'AUTHORIZED_STORAGE') {
      return (
        candidateSource.authorizationStatus === 'authorized' &&
        Boolean(candidateSource.mediaUrl)
      );
    }
    return source.platform === 'local_authorized' && !source.url.startsWith('http');
  }

  async acquire(
    source: SourceVideo,
    targetDir: string,
    mediaSource?: AuthorizedMediaSource,
  ): Promise<AcquiredMediaResult> {
    const activeMediaSource = mediaSource || source.mediaSource;
    const mediaRef = activeMediaSource?.mediaUrl || source.url;

    if (!mediaRef) {
      throw new Error(
        'MEDIA_SOURCE_UNAVAILABLE: No storage reference provided for authorized storage acquisition.',
      );
    }

    const resolvedPath = path.isAbsolute(mediaRef)
      ? mediaRef
      : path.resolve(process.cwd(), mediaRef);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `MEDIA_SOURCE_UNAVAILABLE: Authorized storage media not found at path "${resolvedPath}".`,
      );
    }

    const safeSourceId = source.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.join(targetDir, `storage_${safeSourceId}.mp4`);

    fs.copyFileSync(resolvedPath, outPath);
    const stats = fs.statSync(outPath);

    return {
      sourceVideoId: source.id,
      localMediaPath: outPath,
      sourceType: 'AUTHORIZED_STORAGE',
      provider: activeMediaSource?.provider || 'storage_provider',
      fileSizeBytes: stats.size,
      mimeType: 'video/mp4',
      contentIdentifier: activeMediaSource?.contentIdentifier || source.externalId,
      acquiredAt: new Date().toISOString(),
      temporaryWorkspaceDir: targetDir,
    };
  }
}
