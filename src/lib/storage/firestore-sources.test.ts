import { describe, it, expect, vi } from 'vitest';
import { LocalStorageRepository } from './local-storage.repository';
import { SourceVideo } from '../../types';

describe('Storage Deduplication & Persistence', () => {
  it('saves and updates unique source records properly', async () => {
    const repo = new LocalStorageRepository();
    await repo.resetAll();

    const sample1: SourceVideo = {
      id: 'src_yt_v1',
      externalId: 'v1',
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=v1',
      title: 'First Source Video',
      channelTitle: 'Channel A',
      thumbnailUrl: '',
      publishedAt: new Date().toISOString(),
      duration: 300,
      description: 'Test description',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 85,
      relevanceReason: 'Matched niche',
      status: 'discovered',
    };

    await repo.saveSource(sample1);
    let sources = await repo.getSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('src_yt_v1');

    // Updating existing source with analysis
    await repo.updateSource('src_yt_v1', {
      status: 'analyzed',
      relevanceScore: 92,
    });

    sources = await repo.getSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].status).toBe('analyzed');
    expect(sources[0].relevanceScore).toBe(92);
  });
});
