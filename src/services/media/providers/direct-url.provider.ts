import fs from 'node:fs';
import path from 'node:path';
import { IMediaProvider, AcquiredMediaResult } from '../media-provider.interface';
import { SourceVideo, AuthorizedMediaSource } from '../../../types';

export class AuthorizedDirectUrlProvider implements IMediaProvider {
  readonly id = 'authorized_direct_url_provider';
  readonly name = 'Authorized Direct URL Media Provider';
  readonly sourceType = 'AUTHORIZED_DIRECT_URL';

  canAcquire(source: SourceVideo, mediaSource?: AuthorizedMediaSource): boolean {
    const candidateSource = mediaSource || source.mediaSource;
    if (candidateSource && candidateSource.sourceType === 'AUTHORIZED_DIRECT_URL') {
      return (
        candidateSource.authorizationStatus === 'authorized' &&
        Boolean(candidateSource.mediaUrl) &&
        !this.isYouTubeWatchUrl(candidateSource.mediaUrl)
      );
    }

    // Direct MP4 URL on source video if not a YouTube watch URL
    if (source.url && !this.isYouTubeWatchUrl(source.url)) {
      return source.url.startsWith('http://') || source.url.startsWith('https://');
    }

    return false;
  }

  private isYouTubeWatchUrl(urlStr: string): boolean {
    if (!urlStr) return false;
    return (
      urlStr.includes('youtube.com/watch') ||
      urlStr.includes('youtu.be/') ||
      urlStr.includes('youtube.com/shorts/')
    );
  }

  async acquire(
    source: SourceVideo,
    targetDir: string,
    mediaSource?: AuthorizedMediaSource,
  ): Promise<AcquiredMediaResult> {
    const activeMediaSource = mediaSource || source.mediaSource;
    const mediaUrl = activeMediaSource?.mediaUrl || source.url;

    if (!mediaUrl) {
      throw new Error(
        'MEDIA_SOURCE_UNAVAILABLE: No media URL provided for authorized direct acquisition.',
      );
    }

    if (this.isYouTubeWatchUrl(mediaUrl)) {
      throw new Error(
        'MEDIA_SOURCE_UNAVAILABLE: YouTube watch URL is a discovery reference only. YouTube Data API does not provide downloadable media, and ClipFlow strictly complies with Terms of Service by never using stream extractors, scrapers, or DRM bypasses. Provide an explicit AUTHORIZED_DIRECT_URL or AUTHORIZED_STORAGE reference.',
      );
    }

    const safeSourceId = source.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.join(targetDir, `acquired_${safeSourceId}.mp4`);

    try {
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to acquire authorized media from ${mediaUrl}: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) {
        throw new Error(
          `MEDIA_VALIDATION_FAILED: Acquired media file is corrupt or unexpectedly small (${buffer.length} bytes).`,
        );
      }

      fs.writeFileSync(outPath, buffer);

      const stats = fs.statSync(outPath);

      return {
        sourceVideoId: source.id,
        localMediaPath: outPath,
        sourceType: 'AUTHORIZED_DIRECT_URL',
        provider: activeMediaSource?.provider || 'direct_url_provider',
        fileSizeBytes: stats.size,
        mimeType: response.headers.get('content-type') || 'video/mp4',
        contentIdentifier: activeMediaSource?.contentIdentifier || source.externalId,
        acquiredAt: new Date().toISOString(),
        temporaryWorkspaceDir: targetDir,
      };
    } catch (err: any) {
      if (fs.existsSync(outPath)) {
        try {
          fs.unlinkSync(outPath);
        } catch {}
      }
      throw new Error(`MEDIA_ACQUISITION_FAILED: ${err.message}`);
    }
  }
}
