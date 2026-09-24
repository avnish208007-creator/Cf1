import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvidiousInstanceManager } from './invidious/instance-manager';
import { RSSDiscoveryProvider } from './rss/rss-discovery.provider';
import { ChannelScorer } from './channel-scorer';
import { DiscoveryService } from './discovery.service';
import { WorkspaceSettings } from '../../types';
import { getDiscoveryProviderStatus } from '../../server/discovery-config';

describe('Invidious + YouTube RSS Discovery Pipeline', () => {
  const mockSettings: WorkspaceSettings = {
    niche: 'AI & Machine Learning',
    subtopics: ['Generative AI', 'LLMs', 'Prompt Engineering'],
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
  });

  describe('Discovery Provider Status & Zero-Billing Architecture', () => {
    it('reports Invidious + YouTube RSS without requiring any billing or API keys', () => {
      const status = getDiscoveryProviderStatus();
      expect(status.configured).toBe(true);
      expect(status.provider).toBe('Invidious + YouTube RSS');
      expect(status.status).toBe('connected');
      expect(status.totalInstances).toBeGreaterThan(0);
    });
  });

  describe('InvidiousInstanceManager', () => {
    it('manages known public instances with health checks and rotation', () => {
      const manager = new InvidiousInstanceManager([
        'https://inv.tux.pizza',
        'https://invidious.nerdvpn.de',
      ]);

      const instances = manager.getInstances();
      expect(instances.length).toBe(2);
      expect(instances[0].baseUrl).toBe('https://inv.tux.pizza');
      expect(manager.getHealthyInstances().length).toBe(2);
    });

    it('marks failing instance as unhealthy and fails over', async () => {
      const manager = new InvidiousInstanceManager([
        'https://failing-instance.test',
        'https://working-instance.test',
      ]);

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('failing-instance.test')) {
          return Promise.reject(new Error('Network connection timeout'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ title: 'AI Channel', authorId: 'UC123' }],
        } as Response);
      });

      const res = await manager.fetchJson<any[]>('/api/v1/search', {
        searchParams: { q: 'ai' },
        timeoutMs: 1000,
        maxRetries: 2,
      });

      expect(res.data).toBeDefined();
      expect(res.instanceUsed).toBe('https://working-instance.test');
      expect(manager.isHealthy('https://failing-instance.test')).toBe(false);
    });
  });

  describe('ChannelScorer', () => {
    it('transparently scores channels based on niche and subtopic matching', () => {
      const candidate = {
        channelId: 'UC_AI_Guru_123',
        channelName: 'AI & Machine Learning Insights',
        channelUrl: 'https://youtube.com/channel/UC_AI_Guru_123',
        description: 'Comprehensive tutorials on Generative AI, LLMs, and Neural Networks.',
        subscriberCount: 250000,
        videoCount: 150,
        matchedQuery: 'ai tools',
      };

      const result = ChannelScorer.scoreChannel(
        candidate,
        ['ai tools', 'generative ai tutorial'],
        mockSettings,
      );

      expect(result.relevanceScore).toBeGreaterThanOrEqual(70);
      expect(result.matchedQueries.length).toBeGreaterThan(0);
    });

    it('penalizes channels unrelated to the target niche', () => {
      const candidate = {
        channelId: 'UC_Cooking_123',
        channelName: 'Grandma Italian Kitchen',
        channelUrl: 'https://youtube.com/channel/UC_Cooking_123',
        description: 'Traditional pasta and sourdough recipes from Tuscany.',
        subscriberCount: 50000,
        matchedQuery: 'pasta recipes',
      };

      const result = ChannelScorer.scoreChannel(
        candidate,
        ['ai machine learning'],
        mockSettings,
      );

      expect(result.relevanceScore).toBeLessThan(40);
    });
  });

  describe('RSSDiscoveryProvider', () => {
    const sampleAtomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCv6J_XauvwXvBlSZUQBoTbg"/>
 <id>yt:channel:UCv6J_XauvwXvBlSZUQBoTbg</id>
 <yt:channelId>UCv6J_XauvwXvBlSZUQBoTbg</yt:channelId>
 <title>AI Explained</title>
 <link rel="alternate" href="https://www.youtube.com/channel/UCv6J_XauvwXvBlSZUQBoTbg"/>
 <author>
  <name>AI Explained</name>
  <uri>https://www.youtube.com/channel/UCv6J_XauvwXvBlSZUQBoTbg</uri>
 </author>
 <published>2026-01-10T12:00:00+00:00</published>
 <entry>
  <id>yt:video:dQw4w9WgXcQ</id>
  <yt:videoId>dQw4w9WgXcQ</yt:videoId>
  <yt:channelId>UCv6J_XauvwXvBlSZUQBoTbg</yt:channelId>
  <title>DeepSeek V3 Architecture & Breakthroughs Explained</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
  <author>
   <name>AI Explained</name>
   <uri>https://www.youtube.com/channel/UCv6J_XauvwXvBlSZUQBoTbg</uri>
  </author>
  <published>2026-03-20T14:30:00+00:00</published>
  <updated>2026-03-20T15:00:00+00:00</updated>
  <media:group>
   <media:title>DeepSeek V3 Architecture & Breakthroughs Explained</media:title>
   <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/>
   <media:description>A comprehensive deep dive into DeepSeek V3 mixture of experts architecture.</media:description>
  </media:group>
 </entry>
</feed>`;

    it('builds canonical YouTube Atom RSS url correctly', () => {
      const provider = new RSSDiscoveryProvider();
      const url = provider.getFeedUrl('UCv6J_XauvwXvBlSZUQBoTbg');
      expect(url).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCv6J_XauvwXvBlSZUQBoTbg');
    });

    it('parses YouTube Atom XML entries accurately without third-party services', () => {
      const provider = new RSSDiscoveryProvider();
      const entries = provider.parseFeedXml(sampleAtomXml);

      expect(entries.length).toBe(1);
      const entry = entries[0];
      expect(entry.videoId).toBe('dQw4w9WgXcQ');
      expect(entry.channelId).toBe('UCv6J_XauvwXvBlSZUQBoTbg');
      expect(entry.channelTitle).toBe('AI Explained');
      expect(entry.title).toBe('DeepSeek V3 Architecture & Breakthroughs Explained');
      expect(entry.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(entry.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
      expect(entry.description).toContain('mixture of experts');
    });

    it('normalizes RSS entries into authentic SourceVideo records', () => {
      const provider = new RSSDiscoveryProvider();
      const entries = provider.parseFeedXml(sampleAtomXml);
      const source = provider.normalizeSourceVideo(entries[0], 'ws_test_1', 92);

      expect(source.id).toBe('src_yt_dQw4w9WgXcQ');
      expect(source.externalId).toBe('dQw4w9WgXcQ');
      expect(source.platform).toBe('youtube');
      expect(source.title).toBe('DeepSeek V3 Architecture & Breakthroughs Explained');
      expect(source.relevanceScore).toBe(92);
      expect(source.status).toBe('discovered');
    });
  });

  describe('DiscoveryService (Orchestrator)', () => {
    it('orchestrates two-step Invidious discovery and RSS feed monitoring', async () => {
      const mockInvidious = {
        generateQueries: vi.fn().mockReturnValue(['ai tools', 'generative ai tutorial']),
        discoverChannels: vi.fn().mockResolvedValue([
          {
            channelId: 'UC_Tech_1',
            channelName: 'Tech Today',
            channelUrl: 'https://youtube.com/channel/UC_Tech_1',
            thumbnail: 'https://img.test/ch1.jpg',
            description: 'AI & Tech channel',
            relevanceScore: 88,
            matchedQueries: ['ai tools'],
            discoveredAt: new Date().toISOString(),
          },
        ]),
      };

      const mockRss = {
        getFeedUrl: vi.fn().mockImplementation((id: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`),
        monitorChannels: vi.fn().mockResolvedValue({
          newSources: [
            {
              id: 'src_yt_vid1',
              externalId: 'vid1',
              platform: 'youtube',
              url: 'https://youtube.com/watch?v=vid1',
              title: 'Top AI Tools in 2026',
              channelTitle: 'Tech Today',
              thumbnailUrl: 'https://img.test/vid1.jpg',
              publishedAt: new Date().toISOString(),
              duration: 0,
              description: 'AI tools breakdown',
              discoveredAt: new Date().toISOString(),
              relevanceScore: 88,
              relevanceReason: 'From Tech Today',
              status: 'discovered',
            },
          ],
          totalChecked: 1,
          duplicatesSkipped: 0,
          failedChannels: [],
          channelUpdates: [],
        }),
      };

      const savedChannels: any[] = [];
      const mockRepo = {
        getWorkspace: vi.fn().mockResolvedValue({ id: 'ws_test', settings: mockSettings }),
        getChannels: vi.fn().mockImplementation(async () => [...savedChannels]),
        getMonitoredChannels: vi.fn().mockImplementation(async () => [...savedChannels]),
        saveChannel: vi.fn().mockImplementation(async (c: any) => { savedChannels.push(c); }),
        saveChannels: vi.fn().mockImplementation(async (list: any[]) => { savedChannels.push(...list); }),
        saveMonitoredChannel: vi.fn().mockResolvedValue(undefined),
        updateChannel: vi.fn().mockResolvedValue(undefined),
        getSources: vi.fn().mockResolvedValue([]),
        getSourceVideos: vi.fn().mockResolvedValue([]),
        saveSources: vi.fn().mockResolvedValue(undefined),
        saveSourceVideos: vi.fn().mockResolvedValue(undefined),
      };

      const service = new DiscoveryService(
        mockRepo as any,
        mockInvidious as any,
        mockRss as any,
      );

      const result = await service.runDiscovery(mockSettings);

      expect(result.sources.length).toBe(1);
      expect(result.channels?.length).toBe(1);
      expect(result.channelsDiscovered).toBe(1);
      expect(result.providerName).toBe('Invidious + YouTube RSS');
      expect(mockInvidious.discoverChannels).toHaveBeenCalled();
      expect(mockRss.monitorChannels).toHaveBeenCalled();
    });
  });
});
