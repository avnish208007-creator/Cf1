import { describe, it, expect } from 'vitest';
import { MomentDetector } from './moment-detector';
import { MomentScorer } from './moment-scorer';
import { SourceVideo, WorkspaceSettings, ClipCandidate } from '../../types';
import { LocalStorageRepository } from '../../lib/storage/local-storage.repository';

describe('MomentDetector & MomentScorer Pipeline', () => {
  const mockSettings: WorkspaceSettings = {
    niche: 'B2B Sales',
    subtopics: ['Cold Calling', 'Objection Handling', 'Enterprise Closing'],
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

  const validSourceWithChapters: SourceVideo = {
    id: 'src_yt_sales_mastery',
    externalId: 'sales_mastery_001',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=sales_mastery_001',
    title: 'Enterprise B2B Sales Mastery: Cold Calling & Closing Breakdown',
    channelTitle: 'Revenue Accelerator',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    publishedAt: '2026-03-10T14:00:00Z',
    duration: 720, // 12 minutes
    description: `
Timestamps:
00:30 The Fatal Cold Calling Mistake Everyone Makes
01:45 How to Flip Objections in Under 10 Seconds
03:10 Enterprise Pricing Negotiation Framework
05:30 Securing the Executive Sponsor Buy-in
    `,
    discoveredAt: new Date().toISOString(),
    relevanceScore: 92,
    relevanceReason: 'Direct match for B2B Sales cold calling and enterprise closing.',
    status: 'discovered',
  };

  it('detects real timestamped candidates from creator chapter markers without fabricating timestamps', () => {
    const result = MomentDetector.detectMomentsWithRejections(validSourceWithChapters, mockSettings);

    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
    for (const cand of result.candidates) {
      // 1. Strict timestamp validation
      expect(cand.startTime).toBeGreaterThanOrEqual(0);
      expect(cand.endTime).toBeLessThanOrEqual(validSourceWithChapters.duration);
      expect(cand.endTime).toBeGreaterThan(cand.startTime);
      expect(cand.duration).toBe(cand.endTime - cand.startTime);

      // 2. Short-form duration limits (15s to 60s)
      expect(cand.duration).toBeGreaterThanOrEqual(15);
      expect(cand.duration).toBeLessThanOrEqual(60);

      // 3. Metadata fields present
      expect(cand.sourceId).toBe(validSourceWithChapters.id);
      expect(cand.sourceVideoId).toBe(validSourceWithChapters.id);
      expect(cand.hook.length).toBeGreaterThan(5);
      expect(cand.summary.length).toBeGreaterThan(10);
      expect(cand.payoff.length).toBeGreaterThan(5);
      expect(cand.confidence).toBeGreaterThanOrEqual(70);

      // 4. Transparent scores
      expect(cand.scores.hook).toBeGreaterThanOrEqual(50);
      expect(cand.scores.overall).toBeGreaterThanOrEqual(60);
      expect(['Excellent', 'Strong', 'Potential', 'Weak']).toContain(cand.qualityTier);
    }
  });

  it('segments videos without chapters using content windows that respect boundaries and duration limits', () => {
    const unchapteredSource: SourceVideo = {
      id: 'src_yt_no_chapters',
      externalId: 'no_chap_002',
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=no_chap_002',
      title: 'How to Build an Outbound B2B Sales Engine from Scratch',
      channelTitle: 'Sales Founders',
      thumbnailUrl: 'https://example.com/thumb2.jpg',
      publishedAt: '2026-02-15T10:00:00Z',
      duration: 360, // 6 minutes
      description: 'No chapter markers provided in this raw description.',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 88,
      relevanceReason: 'B2B Sales outbound engine.',
      status: 'discovered',
    };

    const candidates = MomentDetector.detectMoments(unchapteredSource, mockSettings);
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    for (const cand of candidates) {
      expect(cand.startTime).toBeGreaterThanOrEqual(0);
      expect(cand.endTime).toBeLessThanOrEqual(unchapteredSource.duration);
      expect(cand.duration).toBeGreaterThanOrEqual(15);
      expect(cand.duration).toBeLessThanOrEqual(60);
    }
  });

  it('fails honestly when source duration is zero, negative, or shorter than 15s', () => {
    const tooShortSource: SourceVideo = {
      id: 'src_yt_too_short',
      externalId: 'too_short',
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=too_short',
      title: 'Quick 8-Second Sales Shouting',
      channelTitle: 'Channel',
      thumbnailUrl: '',
      publishedAt: new Date().toISOString(),
      duration: 8, // 8s < 15s
      description: 'Short clip',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 70,
      relevanceReason: 'Niche match',
      status: 'discovered',
    };

    expect(() => MomentDetector.detectMoments(tooShortSource, mockSettings)).toThrow(
      /MOMENT_DETECTION_FAILED/,
    );
  });

  it('fails honestly when source title or metadata is invalid or empty', () => {
    const invalidSource: SourceVideo = {
      id: 'src_yt_invalid',
      externalId: 'invalid',
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=invalid',
      title: '   ',
      channelTitle: '',
      thumbnailUrl: '',
      publishedAt: new Date().toISOString(),
      duration: 300,
      description: '',
      discoveredAt: new Date().toISOString(),
      relevanceScore: 0,
      relevanceReason: '',
      status: 'discovered',
    };

    expect(() => MomentDetector.detectMoments(invalidSource, mockSettings)).toThrow(
      /MOMENT_DETECTION_FAILED/,
    );
  });

  it('MomentScorer computes transparent scores, duration fitness, and assigns correct quality tiers', () => {
    const scoredExcellent = MomentScorer.scoreMoment({
      hookStrength: 95,
      curiosity: 90,
      payoff: 92,
      standaloneContext: 90,
      clarity: 92,
      emotionalValue: 88,
      duration: 32, // Optimal duration (20s-45s) -> durationFitness = 100
      sourceRelevance: 95,
    });

    expect(scoredExcellent.scores.durationFitness).toBe(100);
    expect(scoredExcellent.scores.overall).toBeGreaterThanOrEqual(85);
    expect(scoredExcellent.qualityTier).toBe('Excellent');

    const scoredWeak = MomentScorer.scoreMoment({
      hookStrength: 50,
      curiosity: 45,
      payoff: 50,
      standaloneContext: 50,
      clarity: 55,
      emotionalValue: 40,
      duration: 16,
      sourceRelevance: 50,
    });

    expect(scoredWeak.scores.overall).toBeLessThan(65);
    expect(scoredWeak.qualityTier).toBe('Weak');
  });

  it('deduplicates heavily overlapping moments deterministically and tracks rejection reasons', () => {
    const candidateA: ClipCandidate = {
      id: 'cand_A',
      sourceId: 'src_1',
      sourceVideoId: 'src_1',
      sourceTitle: 'Sales Tactics',
      sourceChannel: 'Sales Pro',
      sourceThumbnail: '',
      sourceUrl: '',
      startTime: 30,
      endTime: 65,
      duration: 35,
      hook: 'High Scoring Hook',
      summary: 'Summary A',
      context: 'Context A',
      payoff: 'Payoff A',
      reason: 'Reason A',
      confidence: 90,
      scores: {
        hook: 92,
        curiosity: 88,
        payoff: 90,
        standaloneContext: 90,
        clarity: 90,
        emotionalValue: 85,
        durationFitness: 100,
        sourceRelevance: 90,
        shortFormPotential: 92,
        overall: 90, // Higher score
      },
      qualityTier: 'Excellent',
      status: 'detected',
      createdAt: new Date().toISOString(),
    };

    const candidateB_overlapping: ClipCandidate = {
      id: 'cand_B',
      sourceId: 'src_1',
      sourceVideoId: 'src_1',
      sourceTitle: 'Sales Tactics',
      sourceChannel: 'Sales Pro',
      sourceThumbnail: '',
      sourceUrl: '',
      startTime: 40, // Starts within candidate A's window (30 to 65) -> 25s overlap!
      endTime: 75,
      duration: 35,
      hook: 'Lower Scoring Overlapping Hook',
      summary: 'Summary B',
      context: 'Context B',
      payoff: 'Payoff B',
      reason: 'Reason B',
      confidence: 75,
      scores: {
        hook: 70,
        curiosity: 68,
        payoff: 70,
        standaloneContext: 75,
        clarity: 70,
        emotionalValue: 65,
        durationFitness: 100,
        sourceRelevance: 80,
        shortFormPotential: 70,
        overall: 71, // Lower score
      },
      qualityTier: 'Potential',
      status: 'detected',
      createdAt: new Date().toISOString(),
    };

    const { accepted, rejected } = MomentScorer.deduplicateAndFilter([
      candidateA,
      candidateB_overlapping,
    ]);

    expect(accepted).toHaveLength(1);
    expect(accepted[0].id).toBe('cand_A');

    expect(rejected).toHaveLength(1);
    expect(rejected[0].candidateId).toBe('cand_B');
    expect(rejected[0].reason).toContain('Heavily overlaps');
  });

  it('rejects candidate with duration < 15s or > 60s and stores rejection reason', () => {
    const tooShortCand: ClipCandidate = {
      id: 'cand_too_short',
      sourceId: 'src_1',
      sourceVideoId: 'src_1',
      sourceTitle: 'Title',
      sourceChannel: 'Channel',
      sourceThumbnail: '',
      sourceUrl: '',
      startTime: 10,
      endTime: 20,
      duration: 10, // 10s < 15s
      hook: 'Hook',
      summary: 'Summary',
      context: 'Context',
      payoff: 'Payoff',
      reason: 'Reason',
      confidence: 80,
      scores: {
        hook: 80,
        curiosity: 80,
        payoff: 80,
        standaloneContext: 80,
        clarity: 80,
        emotionalValue: 80,
        durationFitness: 30,
        sourceRelevance: 80,
        shortFormPotential: 70,
        overall: 75,
      },
      qualityTier: 'Strong',
      status: 'detected',
      createdAt: new Date().toISOString(),
    };

    const { accepted, rejected } = MomentScorer.deduplicateAndFilter([tooShortCand]);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain('shorter than minimum short-form limit');
  });

  it('persists candidates to storage and maintains relationship to SourceVideo', async () => {
    const repo = new LocalStorageRepository();
    await repo.resetAll();

    const testCandidate: ClipCandidate = {
      id: 'cand_persist_01',
      sourceId: validSourceWithChapters.id,
      sourceVideoId: validSourceWithChapters.id,
      sourceTitle: validSourceWithChapters.title,
      sourceChannel: validSourceWithChapters.channelTitle,
      sourceThumbnail: validSourceWithChapters.thumbnailUrl,
      sourceUrl: validSourceWithChapters.url,
      startTime: 30,
      endTime: 65,
      duration: 35,
      hook: 'The Fatal Cold Calling Mistake Everyone Makes',
      summary: 'Detailed explanation of why premature feature pitching kills cold call conversion.',
      context: 'Cold call breakdown from enterprise B2B sales playbook.',
      payoff: 'How to ask pattern-interrupt questions that keep executive prospects on the line.',
      topic: 'Cold Calling',
      reason: 'High retention hook identified in chapter 1.',
      confidence: 92,
      scores: {
        hook: 94,
        curiosity: 90,
        payoff: 91,
        standaloneContext: 92,
        clarity: 93,
        emotionalValue: 86,
        durationFitness: 100,
        sourceRelevance: 95,
        shortFormPotential: 93,
        overall: 92,
      },
      qualityTier: 'Excellent',
      status: 'detected',
      createdAt: new Date().toISOString(),
    };

    await repo.saveCandidate(testCandidate);

    const candidates = await repo.getCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('cand_persist_01');
    expect(candidates[0].sourceVideoId).toBe(validSourceWithChapters.id);

    // Update candidate to approved
    await repo.updateCandidate('cand_persist_01', {
      status: 'approved',
    });

    const updated = await repo.getCandidateById('cand_persist_01');
    expect(updated?.status).toBe('approved');
  });
});
