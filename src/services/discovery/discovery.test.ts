import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YouTubeDataApiProvider } from './youtube-data.provider';
import { WorkspaceSettings, SourceVideo } from '../../types';

describe('YouTubeDataApiProvider', () => {
  const mockSettings: WorkspaceSettings = {
    niche: 'AI Tools',
    subtopics: ['Productivity', 'Automation'],
    language: 'en',
    contentStyle: 'breakdown',
    captionStyle: 'bold_punchy',
    brandAccent: '#10b981',
    subtitlePreferences: {
      enabled: true,
      uppercase: true,
      maxWordsPerLine: 3,
      position: 'bottom',
      fontSize: 28,
    },
    youtubeApiKey: 'AIzaSyFakeValidKey1234567890',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes valid YouTube search and video details responses into SourceVideo records', async () => {
    const provider = new YouTubeDataApiProvider(mockSettings.youtubeApiKey);

    // Mock search API call
    const searchResponse = {
      items: [
        {
          id: { videoId: 'vid123_abc' },
          snippet: { title: 'AI Tools for Maximum Productivity Breakdown' },
        },
      ],
    };

    // Mock video details API call
    const detailsResponse = {
      items: [
        {
          id: 'vid123_abc',
          snippet: {
            title: 'AI Tools for Maximum Productivity Breakdown: 5 Essential Steps',
            channelTitle: 'Tech Insights',
            thumbnails: { high: { url: 'https://img.youtube.com/vi/vid123_abc/hqdefault.jpg' } },
            publishedAt: '2026-03-01T12:00:00Z',
            description: 'Comprehensive guide and breakdown on how to leverage AI tools for daily productivity.',
          },
          contentDetails: {
            duration: 'PT8M45S', // 525 seconds
          },
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => searchResponse,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => detailsResponse,
      } as Response);
    });

    const existingIds = new Set<string>();
    const result = await provider.discover(mockSettings, existingIds);

    expect(result.sources).toHaveLength(1);
    expect(result.totalAccepted).toBe(1);
    expect(result.totalRejected).toBe(0);

    const src = result.sources[0];
    expect(src.id).toBe('src_yt_vid123_abc');
    expect(src.externalId).toBe('vid123_abc');
    expect(src.platform).toBe('youtube');
    expect(src.url).toBe('https://www.youtube.com/watch?v=vid123_abc');
    expect(src.title).toBe('AI Tools for Maximum Productivity Breakdown: 5 Essential Steps');
    expect(src.channelTitle).toBe('Tech Insights');
    expect(src.duration).toBe(525);
    expect(src.relevanceScore).toBeGreaterThanOrEqual(70);
    expect(src.rankScore).toBeGreaterThanOrEqual(50);
    expect(src.status).toBe('discovered');
  });

  it('prevents duplicate sources when videoId already exists in database or in-flight query', async () => {
    const provider = new YouTubeDataApiProvider(mockSettings.youtubeApiKey);

    const searchResponse = {
      items: [
        {
          id: { videoId: 'existing_vid_999' },
          snippet: { title: 'Existing Video' },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => searchResponse,
    } as Response);

    const existingIds = new Set<string>(['existing_vid_999']);
    const result = await provider.discover(mockSettings, existingIds);

    expect(result.sources).toHaveLength(0);
    expect(result.totalAccepted).toBe(0);
  });

  it('rejects invalid, private, deleted, or too short video results honestly', async () => {
    const provider = new YouTubeDataApiProvider(mockSettings.youtubeApiKey);

    const searchResponse = {
      items: [
        { id: { videoId: 'del_vid' }, snippet: { title: '[Deleted video]' } },
        { id: { videoId: 'short_vid' }, snippet: { title: 'Quick 5s AI Tip' } },
        { id: { videoId: 'no_chan' }, snippet: { title: 'Anonymous Video' } },
      ],
    };

    const detailsResponse = {
      items: [
        {
          id: 'del_vid',
          snippet: { title: '[Deleted video]', channelTitle: 'Channel' },
          contentDetails: { duration: 'PT5M00S' },
        },
        {
          id: 'short_vid',
          snippet: { title: 'Quick 5s AI Tip', channelTitle: 'Channel' },
          contentDetails: { duration: 'PT5S' }, // 5s < 15s minimum
        },
        {
          id: 'no_chan',
          snippet: { title: 'Anonymous Video', channelTitle: '' },
          contentDetails: { duration: 'PT2M00S' },
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => searchResponse,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => detailsResponse,
      } as Response);
    });

    const result = await provider.discover(mockSettings, new Set());

    expect(result.sources).toHaveLength(0);
    expect(result.totalRejected).toBe(3);
    expect(result.rejections).toHaveLength(3);
    expect(result.rejections?.[0].reason).toContain('deleted or marked private');
    expect(result.rejections?.[1].reason).toContain('shorter than minimum');
    expect(result.rejections?.[2].reason).toContain('Missing channel');
  });

  it('handles quota exhaustion (403 quotaExceeded) with clear honest error', async () => {
    const provider = new YouTubeDataApiProvider(mockSettings.youtubeApiKey);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        error: { message: 'The request cannot be completed because you have exceeded your quota.' },
      }),
    } as Response);

    await expect(provider.discover(mockSettings, new Set())).rejects.toThrow(
      /DISCOVERY_QUOTA_EXCEEDED/,
    );
  });

  it('handles invalid API key (400 or 403 keyInvalid) with clear honest error', async () => {
    const provider = new YouTubeDataApiProvider('AIzaSyInvalidKey');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        error: { message: 'API key not valid. Please pass a valid API key.' },
      }),
    } as Response);

    await expect(provider.discover(mockSettings, new Set())).rejects.toThrow(
      /DISCOVERY_API_KEY_INVALID/,
    );
  });
});
