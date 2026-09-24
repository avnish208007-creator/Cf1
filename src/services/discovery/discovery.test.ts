import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvidiousInstanceManager } from './invidious/instance-manager';
import { InvidiousDiscoveryProvider } from './invidious/invidious-discovery.provider';
import { RSSDiscoveryProvider } from './rss/rss-discovery.provider';
import { ChannelScorer } from './channel-scorer';
import { VideoRelevanceScorer } from './video-relevance-scorer';
import { DiscoveryService } from './discovery.service';
import { WorkspaceSettings, MonitoredChannel } from '../../types';
import { getDiscoveryProviderStatus } from '../../server/discovery-config';

describe('Invidious + YouTube RSS Discovery Pipeline', () => {
  const mockSettings: WorkspaceSettings = {
    niche: 'AI technology',
    subtopics: ['Machine Learning', 'Neural Networks', 'Artificial Intelligence'],
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
        'https://invidious.f5.si',
        'https://inv.nadeko.net',
      ]);

      const instances = manager.getInstances();
      expect(instances.length).toBe(2);
      expect(instances[0].baseUrl).toBe('https://invidious.f5.si');
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

  describe('Pure Channel Discovery (No Video-to-Channel Promotion)', () => {
    it('searches type=channel only and does not promote video search results into channels', async () => {
      const mockManager = {
        fetchJson: vi.fn().mockImplementation(async (path: string, options: any) => {
          // Verify that search is strictly for type=channel
          expect(options.searchParams.type).toBe('channel');
          return {
            data: [
              {
                type: 'channel',
                author: 'Two Minute Papers',
                authorId: 'UCbfYPyITQ-7l4upoX8nvctg',
                authorUrl: '/channel/UCbfYPyITQ-7l4upoX8nvctg',
                description: 'Awesome research papers in AI and machine learning explained.',
                subCount: 1500000,
                videoCount: 700,
              },
            ],
            instanceUsed: 'https://invidious.f5.si',
          };
        }),
      };

      const provider = new InvidiousDiscoveryProvider(mockManager as any);
      const channels = await provider.discoverChannels(mockSettings, 10);

      expect(channels.length).toBeGreaterThan(0);
      expect(channels[0].channelId).toBe('UCbfYPyITQ-7l4upoX8nvctg');
      expect(channels[0].channelName).toBe('Two Minute Papers');
    });

    it('consolidates duplicate channels correctly', () => {
      const rawChannels = [
        {
          channelId: 'UC_DUP_1',
          channelName: 'AI Explored',
          channelUrl: 'https://youtube.com/channel/UC_DUP_1',
          description: 'AI news and technology',
          matchedQuery: 'ai technology',
        },
        {
          channelId: 'UC_DUP_1',
          channelName: 'AI Explored',
          channelUrl: 'https://youtube.com/channel/UC_DUP_1',
          description: 'AI news and technology updates',
          matchedQuery: 'machine learning',
        },
      ];

      const consolidated = ChannelScorer.consolidateChannels(rawChannels, mockSettings);
      expect(consolidated.length).toBe(1);
      expect(consolidated[0].channelId).toBe('UC_DUP_1');
      expect(consolidated[0].matchedQueries).toContain('ai technology');
      expect(consolidated[0].matchedQueries).toContain('machine learning');
    });
  });

  describe('VideoRelevanceScorer', () => {
    const channelContext = {
      channelName: 'Tech Insights',
      relevanceScore: 80,
      niche: 'AI technology',
    };

    it('accepts relevant videos matching the active niche ("OpenAI releases new AI model")', () => {
      const video = {
        title: 'OpenAI releases new AI model for robotics and coding',
        description: 'A detailed breakdown of the new artificial intelligence model and its benchmark results.',
      };

      const result = VideoRelevanceScorer.scoreVideo(video, channelContext, mockSettings);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.relevant).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('rejects completely irrelevant videos ("My daily vlog")', () => {
      const video = {
        title: 'My daily vlog - morning routine and grocery shopping',
        description: 'Follow me around the city as I prepare breakfast and visit my favorite stores.',
      };

      const result = VideoRelevanceScorer.scoreVideo(video, channelContext, mockSettings);
      expect(result.score).toBeLessThan(60);
      expect(result.relevant).toBe(false);
      expect(result.rejectionReason).toBeDefined();
    });

    it('accepts potentially relevant technology videos ("New technology changing the future")', () => {
      const video = {
        title: 'New technology changing the future of automation',
        description: 'Exploring machine learning advances and next generation technology systems.',
      };

      const result = VideoRelevanceScorer.scoreVideo(video, channelContext, mockSettings);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.relevant).toBe(true);
    });

    it('evaluates Shorts based on metadata relevance without automatic rejection', () => {
      const shortVideo = {
        title: 'Top 3 AI tools that will save you hours! #Shorts',
        description: 'Supercharge your workflow with these artificial intelligence tools.',
      };

      const result = VideoRelevanceScorer.scoreVideo(shortVideo, channelContext, mockSettings);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.relevant).toBe(true);
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
        matchedQuery: 'ai technology',
      };

      const result = ChannelScorer.scoreChannel(
        candidate,
        ['ai technology', 'machine learning'],
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
        ['ai technology'],
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
  <id>yt:video:vid_ai_1</id>
  <yt:videoId>vid_ai_1</yt:videoId>
  <yt:channelId>UCv6J_XauvwXvBlSZUQBoTbg</yt:channelId>
  <title>DeepSeek V3 AI Architecture Explained</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=vid_ai_1"/>
  <published>2026-03-20T14:30:00+00:00</published>
  <media:group>
   <media:title>DeepSeek V3 AI Architecture Explained</media:title>
   <media:thumbnail url="https://i.ytimg.com/vi/vid_ai_1/hqdefault.jpg"/>
   <media:description>A comprehensive deep dive into artificial intelligence and neural networks.</media:description>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:vid_vlog_2</id>
  <yt:videoId>vid_vlog_2</yt:videoId>
  <yt:channelId>UCv6J_XauvwXvBlSZUQBoTbg</yt:channelId>
  <title>Weekend Vlog - My trip to the mountain cabin</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=vid_vlog_2"/>
  <published>2026-03-21T10:00:00+00:00</published>
  <media:group>
   <media:title>Weekend Vlog - My trip to the mountain cabin</media:title>
   <media:thumbnail url="https://i.ytimg.com/vi/vid_vlog_2/hqdefault.jpg"/>
   <media:description>A relaxing personal weekend vlog.</media:description>
  </media:group>
 </entry>
</feed>`;

    it('builds canonical YouTube Atom RSS url correctly', () => {
      const provider = new RSSDiscoveryProvider();
      const url = provider.getFeedUrl('UCv6J_XauvwXvBlSZUQBoTbg');
      expect(url).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCv6J_XauvwXvBlSZUQBoTbg');
    });

    it('parses YouTube Atom XML entries accurately', () => {
      const provider = new RSSDiscoveryProvider();
      const entries = provider.parseFeedXml(sampleAtomXml);

      expect(entries.length).toBe(2);
      expect(entries[0].videoId).toBe('vid_ai_1');
      expect(entries[0].title).toBe('DeepSeek V3 AI Architecture Explained');
    });

    it('filters RSS uploads by video relevance (accepts relevant, rejects irrelevant, skips duplicates)', async () => {
      const provider = new RSSDiscoveryProvider();
      vi.spyOn(provider, 'fetchChannelFeed').mockResolvedValue([
        {
          videoId: 'vid_ai_1',
          channelId: 'UCv6J_XauvwXvBlSZUQBoTbg',
          title: 'DeepSeek V3 AI Architecture Explained',
          channelTitle: 'AI Explained',
          publishedAt: '2026-03-20T14:30:00Z',
          url: 'https://youtube.com/watch?v=vid_ai_1',
          description: 'Deep dive into artificial intelligence and neural networks.',
        },
        {
          videoId: 'vid_vlog_2',
          channelId: 'UCv6J_XauvwXvBlSZUQBoTbg',
          title: 'Weekend Vlog - My trip to the mountain cabin',
          channelTitle: 'AI Explained',
          publishedAt: '2026-03-21T10:00:00Z',
          url: 'https://youtube.com/watch?v=vid_vlog_2',
          description: 'A personal lifestyle vlog.',
        },
        {
          videoId: 'vid_dup_3',
          channelId: 'UCv6J_XauvwXvBlSZUQBoTbg',
          title: 'Existing AI Video',
          channelTitle: 'AI Explained',
          publishedAt: '2026-03-19T10:00:00Z',
          url: 'https://youtube.com/watch?v=vid_dup_3',
          description: 'Machine learning video.',
        },
      ]);

      const channels: MonitoredChannel[] = [
        {
          id: 'UCv6J_XauvwXvBlSZUQBoTbg',
          workspaceId: 'ws_test',
          channelId: 'UCv6J_XauvwXvBlSZUQBoTbg',
          channelName: 'AI Explained',
          channelUrl: 'https://youtube.com/channel/UCv6J_XauvwXvBlSZUQBoTbg',
          rssUrl: 'https://youtube.com/feeds/videos.xml?channel_id=UCv6J_XauvwXvBlSZUQBoTbg',
          niche: 'AI technology',
          relevanceScore: 85,
          status: 'active',
          discoveredAt: '2026-03-20T00:00:00Z',
        },
      ];

      const existingIds = new Set(['vid_dup_3']);
      const result = await provider.monitorChannels(channels, existingIds, 10, mockSettings);

      expect(result.videosChecked).toBe(3);
      expect(result.videosAccepted).toBe(1); // Only vid_ai_1
      expect(result.videosRejected).toBe(1); // vid_vlog_2 rejected
      expect(result.duplicatesSkipped).toBe(1); // vid_dup_3 skipped
      expect(result.newSources.length).toBe(1);
      expect(result.newSources[0].externalId).toBe('vid_ai_1');
      expect(result.rejections.length).toBe(1);
      expect(result.rejections[0].videoId).toBe('vid_vlog_2');
    });
  });

  describe('DiscoveryService (Orchestrator)', () => {
    it('orchestrates two-step Invidious discovery and RSS feed monitoring with video relevance', async () => {
      const mockInvidious = {
        generateQueries: vi.fn().mockReturnValue(['ai technology', 'machine learning']),
        discoverChannels: vi.fn().mockResolvedValue([
          {
            channelId: 'UC_Tech_1',
            channelName: 'Tech Today',
            channelUrl: 'https://youtube.com/channel/UC_Tech_1',
            thumbnail: 'https://img.test/ch1.jpg',
            description: 'AI & Tech channel',
            relevanceScore: 88,
            matchedQueries: ['ai technology'],
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
              title: 'Top AI Technology in 2026',
              channelTitle: 'Tech Today',
              thumbnailUrl: 'https://img.test/vid1.jpg',
              publishedAt: new Date().toISOString(),
              duration: 0,
              description: 'AI tools breakdown',
              discoveredAt: new Date().toISOString(),
              relevanceScore: 90,
              relevanceReason: 'Score 90/100: Direct niche phrase match in title',
              status: 'discovered',
            },
          ],
          totalChecked: 1,
          videosChecked: 3,
          videosAccepted: 1,
          videosRejected: 1,
          duplicatesSkipped: 1,
          rejections: [{ videoId: 'vid2', title: 'Cooking Vlog', reason: 'Below threshold' }],
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
      expect(result.videosChecked).toBe(3);
      expect(result.videosAccepted).toBe(1);
      expect(result.videosRejected).toBe(1);
      expect(result.duplicatesSkipped).toBe(1);
      expect(result.providerName).toBe('Invidious + YouTube RSS');
      expect(mockInvidious.discoverChannels).toHaveBeenCalled();
      expect(mockRss.monitorChannels).toHaveBeenCalled();
    });
  });

  describe('Timeout, Failover & Error Resilience', () => {
    it('attempts next instance when an Invidious instance times out', async () => {
      const manager = new InvidiousInstanceManager([
        'https://timeout-instance.test',
        'https://responsive-instance.test',
      ]);

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('timeout-instance.test')) {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          return Promise.reject(abortError);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ type: 'channel', author: 'AI Tech', authorId: 'UC999' }],
        } as Response);
      });

      const res = await manager.fetchJson<any[]>('/api/v1/search', {
        searchParams: { q: 'ai', type: 'channel' },
        timeoutMs: 100,
        maxRetries: 2,
      });

      expect(res.data).toBeDefined();
      expect(res.instanceUsed).toBe('https://responsive-instance.test');
    });

    it('continues with remaining channels when one RSS channel feed fails', async () => {
      const provider = new RSSDiscoveryProvider();
      vi.spyOn(provider, 'fetchChannelFeed').mockImplementation(async (channelId: string) => {
        if (channelId === 'UC_FAILS') {
          throw new Error('RSS_REQUEST_FAILED: Timeout fetching feed');
        }
        return [
          {
            videoId: 'vid_ok_1',
            channelId: 'UC_WORKS',
            title: 'AI Robotics Breakthrough',
            channelTitle: 'Tech Works',
            publishedAt: '2026-03-24T00:00:00Z',
            url: 'https://youtube.com/watch?v=vid_ok_1',
            description: 'AI robotics and machine learning demo.',
          },
        ];
      });

      const channels: MonitoredChannel[] = [
        {
          id: 'UC_FAILS',
          workspaceId: 'ws_test',
          channelId: 'UC_FAILS',
          channelName: 'Failing Channel',
          channelUrl: 'https://youtube.com/channel/UC_FAILS',
          rssUrl: 'https://youtube.com/feeds/videos.xml?channel_id=UC_FAILS',
          niche: 'AI technology',
          relevanceScore: 70,
          status: 'active',
          discoveredAt: '2026-03-24T00:00:00Z',
        },
        {
          id: 'UC_WORKS',
          workspaceId: 'ws_test',
          channelId: 'UC_WORKS',
          channelName: 'Working Channel',
          channelUrl: 'https://youtube.com/channel/UC_WORKS',
          rssUrl: 'https://youtube.com/feeds/videos.xml?channel_id=UC_WORKS',
          niche: 'AI technology',
          relevanceScore: 85,
          status: 'active',
          discoveredAt: '2026-03-24T00:00:00Z',
        },
      ];

      const result = await provider.monitorChannels(channels, new Set(), 10, mockSettings);

      expect(result.videosChecked).toBe(1);
      expect(result.videosAccepted).toBe(1);
      expect(result.newSources.length).toBe(1);
      expect(result.newSources[0].externalId).toBe('vid_ok_1');
    });

    it('fails with DISCOVERY_PROVIDER_UNAVAILABLE if all instances fail', async () => {
      const manager = new InvidiousInstanceManager([
        'https://down-1.test',
        'https://down-2.test',
      ]);

      global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

      await expect(
        manager.fetchJson('/api/v1/search', { maxRetries: 1, timeoutMs: 50 }),
      ).rejects.toThrow(/DISCOVERY_PROVIDER_UNAVAILABLE/);
    });
  });

  describe('Discovery Reset', () => {
    it('resets channels, sources, candidates, and discovery jobs without deleting workspace or settings', async () => {
      const { LocalStorageRepository } = await import('../../lib/storage/local-storage.repository');
      const testRepo = new LocalStorageRepository();

      await testRepo.saveWorkspace({
        id: 'ws_fitness',
        name: 'My Content Engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        settings: {
          niche: 'Fitness',
          subtopics: ['Hypertrophy', 'Strength Training'],
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
        },
      });

      await testRepo.saveChannel({
        id: 'UC_fit_1',
        workspaceId: 'ws_fitness',
        channelId: 'UC_fit_1',
        channelName: 'Fitness Channel',
        channelUrl: 'https://youtube.com/channel/UC_fit_1',
        rssUrl: 'https://youtube.com/feeds/videos.xml?channel_id=UC_fit_1',
        niche: 'Fitness',
        relevanceScore: 90,
        status: 'active',
        discoveredAt: new Date().toISOString(),
      });

      await testRepo.saveSource({
        id: 'src_fit_1',
        workspaceId: 'ws_fitness',
        externalId: 'fit_1',
        platform: 'youtube',
        url: 'https://youtube.com/watch?v=fit_1',
        title: 'Full Body Workout',
        channelTitle: 'Fitness Channel',
        thumbnailUrl: 'https://img.test/fit1.jpg',
        publishedAt: new Date().toISOString(),
        duration: 300,
        description: 'Workout description',
        discoveredAt: new Date().toISOString(),
        relevanceScore: 85,
        relevanceReason: 'Workout video matches fitness niche',
        status: 'discovered',
      });

      await testRepo.saveJob({
        id: 'job_disc_1',
        type: 'discovery',
        status: 'completed',
        currentStep: 'Done',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        logs: [],
      });

      // Execute discovery reset
      await testRepo.resetDiscoveryData();

      const channelsAfter = await testRepo.getChannels();
      const sourcesAfter = await testRepo.getSources();
      const candidatesAfter = await testRepo.getCandidates();
      const jobsAfter = await testRepo.getJobs();
      const wsAfter = await testRepo.getWorkspace();

      expect(channelsAfter.length).toBe(0);
      expect(sourcesAfter.length).toBe(0);
      expect(candidatesAfter.length).toBe(0);
      expect(jobsAfter.length).toBe(0);
      expect(wsAfter).not.toBeNull();
      expect(wsAfter?.name).toBe('My Content Engine');
      expect(wsAfter?.settings.niche).toBe('Fitness');
    });
  });
});

