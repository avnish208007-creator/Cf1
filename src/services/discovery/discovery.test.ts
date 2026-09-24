import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YouTubeDataApiProvider } from './youtube-data.provider';
import { WorkspaceSettings, SourceVideo } from '../../types';
import { getYouTubeApiKey, isYouTubeConfigured, testYouTubeConnection, getDiscoveryProviderStatus } from '../../server/discovery-config';
import { handler as discoverHandler } from '../../../netlify/functions/discover';
import { handler as statusHandler } from '../../../netlify/functions/discovery-status';
import { handler as testStatusHandler } from '../../../netlify/functions/discovery-status-test';
import { ApiClient } from '../api/client';

describe('YouTube Discovery & Server Secret Architecture', () => {
  const originalEnv = process.env.YOUTUBE_API_KEY;

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
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.YOUTUBE_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.YOUTUBE_API_KEY = originalEnv;
    } else {
      delete process.env.YOUTUBE_API_KEY;
    }
  });

  describe('Server Discovery Configuration (Zero-Trust Secret Handling)', () => {
    it('returns null when YOUTUBE_API_KEY is not defined or empty', () => {
      delete process.env.YOUTUBE_API_KEY;
      expect(getYouTubeApiKey()).toBeNull();
      expect(isYouTubeConfigured()).toBe(false);

      process.env.YOUTUBE_API_KEY = '   ';
      expect(getYouTubeApiKey()).toBeNull();
      expect(isYouTubeConfigured()).toBe(false);
    });

    it('returns trimmed key when YOUTUBE_API_KEY is defined', () => {
      process.env.YOUTUBE_API_KEY = '  AIzaSyValidServerSecret123  ';
      expect(getYouTubeApiKey()).toBe('AIzaSyValidServerSecret123');
      expect(isYouTubeConfigured()).toBe(true);
    });

    it('getDiscoveryProviderStatus exposes only safe metadata without leaking key', () => {
      process.env.YOUTUBE_API_KEY = 'AIzaSySecretNeverExposed';
      const status = getDiscoveryProviderStatus();
      expect(status.configured).toBe(true);
      expect(status.provider).toBe('YouTube Data API v3');
      expect(status.status).toBe('connected');
      expect(JSON.stringify(status)).not.toContain('AIzaSySecretNeverExposed');
    });

    it('testYouTubeConnection reports Not Configured when secret is missing', async () => {
      delete process.env.YOUTUBE_API_KEY;
      const result = await testYouTubeConnection();
      expect(result.success).toBe(false);
      expect(result.status).toBe('Not configured');
      expect(result.errorCode).toBe('DISCOVERY_PROVIDER_UNAVAILABLE');
    });

    it('testYouTubeConnection uses minimal videoCategories check and handles success', async () => {
      process.env.YOUTUBE_API_KEY = 'AIzaSyValidKey';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [{ id: '1' }] }),
      } as Response);

      const result = await testYouTubeConnection();
      expect(result.success).toBe(true);
      expect(result.status).toBe('Connected');
      // Verifies low-quota endpoint was used (videoCategories instead of expensive search)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/videoCategories'),
        expect.anything(),
      );
    });

    it('testYouTubeConnection detects invalid API key safely', async () => {
      process.env.YOUTUBE_API_KEY = 'AIzaSyBadKey';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'API key not valid. Please pass a valid API key.' },
        }),
      } as Response);

      const result = await testYouTubeConnection();
      expect(result.success).toBe(false);
      expect(result.status).toBe('Invalid API key');
      expect(result.errorCode).toBe('DISCOVERY_API_KEY_INVALID');
    });

    it('testYouTubeConnection detects quota exhaustion safely', async () => {
      process.env.YOUTUBE_API_KEY = 'AIzaSyExhaustedKey';
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: 'Quota exceeded for the quota metric.' },
        }),
      } as Response);

      const result = await testYouTubeConnection();
      expect(result.success).toBe(false);
      expect(result.status).toBe('Quota exceeded');
      expect(result.errorCode).toBe('DISCOVERY_QUOTA_EXCEEDED');
    });
  });

  describe('Netlify / Server Discovery Endpoint (Strict Server Key Enforced)', () => {
    it('rejects discovery with DISCOVERY_PROVIDER_UNAVAILABLE if server secret is missing', async () => {
      delete process.env.YOUTUBE_API_KEY;

      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({
          settings: { ...mockSettings, youtubeApiKey: 'attackerKeyAttempt' },
        }),
      };

      const res = await discoverHandler(event);
      expect(res.statusCode).toBe(400);
      const parsed = JSON.parse(res.body);
      expect(parsed.errorCode).toBe('DISCOVERY_PROVIDER_UNAVAILABLE');
      expect(parsed.errorMessage).toContain('YOUTUBE_API_KEY');
    });

    it('rejects discovery with DISCOVERY_INVALID_NICHE if niche is empty or missing', async () => {
      process.env.YOUTUBE_API_KEY = 'AIzaSyValidKey';

      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({
          settings: { ...mockSettings, niche: '   ' },
        }),
      };

      const res = await discoverHandler(event);
      expect(res.statusCode).toBe(400);
      const parsed = JSON.parse(res.body);
      expect(parsed.errorCode).toBe('DISCOVERY_INVALID_NICHE');
    });

    it('performs legitimate discovery using server key when configured', async () => {
      process.env.YOUTUBE_API_KEY = 'AIzaSyServerKey999';

      const searchResponse = {
        items: [
          {
            id: { videoId: 'server_vid_001' },
            snippet: { title: 'AI Productivity Breakthroughs Tutorial' },
          },
        ],
      };

      const detailsResponse = {
        items: [
          {
            id: 'server_vid_001',
            snippet: {
              title: 'AI Productivity Breakthroughs Tutorial: Real Case Studies',
              channelTitle: 'Tech Hub',
              thumbnails: { high: { url: 'https://img.youtube.com/vi/server_vid_001/hqdefault.jpg' } },
              publishedAt: '2026-03-01T12:00:00Z',
              description: 'Guide on AI tools in modern software work.',
            },
            contentDetails: { duration: 'PT12M30S' },
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

      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({ settings: mockSettings, existingExternalIds: [] }),
      };

      const res = await discoverHandler(event);
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].id).toBe('src_yt_server_vid_001');
      expect(data.sources[0].duration).toBe(750);
    });

    it('status endpoints return safe structure', async () => {
      delete process.env.YOUTUBE_API_KEY;
      const res = await statusHandler({ httpMethod: 'GET' });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.configured).toBe(false);
      expect(data.status).toBe('not_configured');
    });
  });

  describe('ApiClient Discovery Failure Handling (No Silent Fallback)', () => {
    it('surfaces server error without silently falling back to local or fake media', async () => {
      const client = new ApiClient();

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          errorCode: 'DISCOVERY_PROVIDER_UNAVAILABLE',
          errorMessage: 'YouTube Data API v3 is not configured in the server environment.',
        }),
      } as Response);

      await expect(client.discover(mockSettings)).rejects.toThrow(
        /YouTube Data API v3 is not configured/,
      );
    });
  });

  describe('YouTubeDataApiProvider Core Logic', () => {
    const validKey = 'AIzaSyFakeValidKey1234567890';

    it('normalizes valid YouTube search and video details responses into SourceVideo records', async () => {
      const provider = new YouTubeDataApiProvider(validKey);

      const searchResponse = {
        items: [
          {
            id: { videoId: 'vid123_abc' },
            snippet: { title: 'AI Tools for Maximum Productivity Breakdown' },
          },
        ],
      };

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
      const provider = new YouTubeDataApiProvider(validKey);

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
      const provider = new YouTubeDataApiProvider(validKey);

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
      const provider = new YouTubeDataApiProvider(validKey);

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
});
