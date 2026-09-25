import { describe, it, expect } from 'vitest';
import { sanitizeFirestoreData } from './sanitize';
import { Job, SourceVideo, ClipCandidate, MonitoredChannel } from '../../types';

describe('sanitizeFirestoreData', () => {
  it('preserves job with targetTitle defined and removes undefined properties', () => {
    const jobWithTitle: Job = {
      id: 'job_123',
      type: 'analysis',
      status: 'analyzing',
      currentStep: 'Evaluating...',
      targetTitle: 'Super Fast Muscle Building',
      createdAt: '2026-09-24T12:00:00.000Z',
      updatedAt: '2026-09-24T12:00:00.000Z',
      progress: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      completedAt: undefined,
      logs: ['Step 1'],
    };

    const sanitized = sanitizeFirestoreData(jobWithTitle);

    expect(sanitized).toHaveProperty('id', 'job_123');
    expect(sanitized).toHaveProperty('targetTitle', 'Super Fast Muscle Building');
    expect(sanitized).not.toHaveProperty('progress');
    expect(sanitized).not.toHaveProperty('errorCode');
    expect(sanitized).not.toHaveProperty('errorMessage');
    expect(sanitized).not.toHaveProperty('completedAt');
    expect(Object.values(sanitized).includes(undefined)).toBe(false);
  });

  it('preserves job without targetTitle and omits undefined targetTitle completely', () => {
    const jobWithoutTitle: Job = {
      id: 'job_456',
      type: 'discovery',
      status: 'queued',
      currentStep: 'Querying discovery angles...',
      targetTitle: undefined,
      createdAt: '2026-09-24T12:00:00.000Z',
      updatedAt: '2026-09-24T12:00:00.000Z',
      logs: ['Init'],
    };

    const sanitized = sanitizeFirestoreData(jobWithoutTitle);

    expect(sanitized).toHaveProperty('id', 'job_456');
    expect(sanitized).not.toHaveProperty('targetTitle');
    expect(sanitized).toHaveProperty('currentStep', 'Querying discovery angles...');
    expect(Object.keys(sanitized)).not.toContain('targetTitle');
    expect(Object.values(sanitized).includes(undefined)).toBe(false);
  });

  it('recursively cleans nested undefined properties inside objects and arrays', () => {
    const complexNested = {
      level1: {
        validString: 'hello',
        invalidUndefined: undefined,
        nestedNull: null,
        level2: {
          deepValid: 100,
          deepUndefined: undefined,
          deepArray: [{ a: 1, b: undefined }, undefined, { c: 'valid', d: null }],
        },
      },
    };

    const sanitized = sanitizeFirestoreData(complexNested);

    expect(sanitized.level1).toHaveProperty('validString', 'hello');
    expect(sanitized.level1).not.toHaveProperty('invalidUndefined');
    expect(sanitized.level1.nestedNull).toBeNull();
    expect(sanitized.level1.level2.deepValid).toBe(100);
    expect(sanitized.level1.level2).not.toHaveProperty('deepUndefined');
    expect(sanitized.level1.level2.deepArray.length).toBe(2);
    expect(sanitized.level1.level2.deepArray[0]).toEqual({ a: 1 });
    expect(sanitized.level1.level2.deepArray[1]).toEqual({ c: 'valid', d: null });
  });

  it('preserves intentional null values without stripping them', () => {
    const dataWithNull = {
      workspaceId: 'ws_123',
      latestVideoId: null,
      parentRef: null,
      count: 0,
      active: false,
    };

    const sanitized = sanitizeFirestoreData(dataWithNull);

    expect(sanitized.latestVideoId).toBeNull();
    expect(sanitized.parentRef).toBeNull();
    expect(sanitized.count).toBe(0);
    expect(sanitized.active).toBe(false);
  });

  it('handles Date objects and primitives without modification', () => {
    const now = new Date();
    expect(sanitizeFirestoreData(now)).toEqual(now);
    expect(sanitizeFirestoreData(42)).toBe(42);
    expect(sanitizeFirestoreData('text')).toBe('text');
    expect(sanitizeFirestoreData(true)).toBe(true);
    expect(sanitizeFirestoreData(null)).toBeNull();
    expect(sanitizeFirestoreData(undefined)).toBeUndefined();
  });

  it('sanitizes SourceVideo, ClipCandidate, and MonitoredChannel models with optional fields', () => {
    const source: SourceVideo = {
      id: 'src_1',
      workspaceId: 'ws_1',
      externalId: 'ext_1',
      platform: 'youtube',
      url: 'https://youtube.com/watch?v=ext_1',
      title: 'Fitness Video',
      channelTitle: 'Gym Channel',
      thumbnailUrl: 'https://img.test/1.jpg',
      publishedAt: '2026-09-24T00:00:00Z',
      duration: 120,
      description: 'Description',
      discoveredAt: '2026-09-24T00:00:00Z',
      relevanceScore: 85,
      relevanceReason: 'Niche match',
      status: 'discovered',
      errorCode: undefined,
      errorMessage: undefined,
      mediaSource: undefined,
    };

    const sanitizedSource = sanitizeFirestoreData(source);
    expect(sanitizedSource).not.toHaveProperty('errorCode');
    expect(sanitizedSource).not.toHaveProperty('errorMessage');
    expect(sanitizedSource).not.toHaveProperty('mediaSource');
    expect(sanitizedSource.title).toBe('Fitness Video');

    const channel: MonitoredChannel = {
      id: 'ch_1',
      workspaceId: 'ws_1',
      channelId: 'ch_1',
      channelName: 'Fitness Channel',
      channelUrl: 'https://youtube.com/channel/ch_1',
      rssUrl: 'https://youtube.com/feeds/videos.xml?channel_id=ch_1',
      niche: 'Fitness',
      relevanceScore: 90,
      status: 'active',
      discoveredAt: '2026-09-24T00:00:00Z',
      lastCheckedAt: undefined,
      lastSuccessfulCheckAt: undefined,
      latestVideoId: undefined,
      latestVideoTitle: undefined,
      thumbnailUrl: undefined,
    };

    const sanitizedChannel = sanitizeFirestoreData(channel);
    expect(sanitizedChannel).not.toHaveProperty('lastCheckedAt');
    expect(sanitizedChannel).not.toHaveProperty('lastSuccessfulCheckAt');
    expect(sanitizedChannel).not.toHaveProperty('latestVideoId');
    expect(sanitizedChannel).not.toHaveProperty('latestVideoTitle');
    expect(sanitizedChannel).not.toHaveProperty('thumbnailUrl');
    expect(sanitizedChannel.channelName).toBe('Fitness Channel');
  });
});
