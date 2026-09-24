import { describe, it, expect } from 'vitest';
import { SourceAnalyzer } from './source-analyzer';
import { SourceVideo, WorkspaceSettings } from '../../types';

describe('SourceAnalyzer', () => {
  const settings: WorkspaceSettings = {
    niche: 'SaaS Marketing',
    subtopics: ['Cold Email', 'Retention'],
    language: 'en',
    contentStyle: 'educational',
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

  it('performs structured relevance analysis and returns category, scores, and hook triggers', () => {
    const source: SourceVideo = {
      id: 'src_yt_saas_01',
      externalId: 'saas_01',
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=saas_01',
      title: 'How to Scale SaaS Marketing with Cold Email: 5 Critical Mistakes to Avoid',
      channelTitle: 'SaaS Growth Lab',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(), // 10 days old
      duration: 600, // 10 mins
      description:
        'In this breakdown, we reveal how top founders optimize SaaS marketing, master cold email sequences, and increase customer retention.',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 0,
      relevanceReason: '',
      status: 'discovered',
    };

    const analysis = SourceAnalyzer.analyze(source, settings);

    expect(analysis.relevance).toBeGreaterThanOrEqual(80);
    expect(analysis.subtopicMatchScore).toBeGreaterThanOrEqual(70);
    expect(analysis.topicClarity).toBeGreaterThanOrEqual(80);
    expect(analysis.contentRichness).toBeGreaterThanOrEqual(80);
    expect(analysis.potentialHooksCount).toBeGreaterThanOrEqual(3);
    expect(analysis.topicCategory).toBe('Practical Tutorial');
    expect(analysis.shortFormPotentialScore).toBeGreaterThanOrEqual(75);
    expect(analysis.confidence).toBeGreaterThanOrEqual(80);
    expect(analysis.recommendedAngles.length).toBeGreaterThan(0);
    expect(analysis.reasoning).toContain('SaaS Marketing');

    const rank = SourceAnalyzer.calculateRankScore(source, analysis);
    expect(rank).toBeGreaterThanOrEqual(75);
  });

  it('throws structured error when source content is insufficient or missing title', () => {
    const invalidSource: SourceVideo = {
      id: 'src_yt_empty',
      externalId: 'empty',
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=empty',
      title: '   ',
      channelTitle: 'Unknown',
      thumbnailUrl: '',
      publishedAt: new Date().toISOString(),
      duration: 0,
      description: '',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 0,
      relevanceReason: '',
      status: 'discovered',
    };

    expect(() => SourceAnalyzer.analyze(invalidSource, settings)).toThrow(
      /SOURCE_ANALYSIS_UNAVAILABLE/,
    );
  });
});
