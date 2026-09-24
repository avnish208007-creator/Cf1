import { ChannelCandidate, WorkspaceSettings } from '../../types';

export interface RawDiscoveredChannel {
  channelId: string;
  channelName: string;
  channelUrl?: string;
  thumbnail?: string;
  description?: string;
  subscriberCount?: number;
  videoCount?: number;
  latestVideoPublishedAt?: string;
  matchedQuery: string;
}

export class ChannelScorer {
  /**
   * Evaluates a discovered channel against workspace niche, subtopics, language, and content style.
   * Returns a conservative, transparent score from 0 to 100 with matched queries.
   */
  public static scoreChannel(
    raw: RawDiscoveredChannel,
    allMatchedQueries: string[],
    settings: WorkspaceSettings,
  ): ChannelCandidate {
    const textCorpus = `${raw.channelName} ${raw.description || ''}`.toLowerCase();
    const niche = settings.niche.toLowerCase().trim();
    const subtopics = (settings.subtopics || []).map((s) => s.toLowerCase().trim());
    const language = (settings.language || 'English').toLowerCase();

    // 1. Niche Relevance Score (Max 35 points)
    let nicheScore = 0;
    const nicheWords = niche.split(/\s+/).map((w) => w.trim().replace(/[^a-z0-9]/g, '')).filter((w) => w.length >= 2);
    if (textCorpus.includes(niche)) {
      nicheScore = 35; // Exact niche phrase match
    } else {
      const matchedNicheWords = nicheWords.filter((w) => textCorpus.includes(w));
      if (nicheWords.length > 0) {
        const ratio = matchedNicheWords.length / nicheWords.length;
        nicheScore = Math.round(ratio * 30);
        // If channel name itself contains niche keyword, boost relevance
        if (nicheWords.some((w) => raw.channelName.toLowerCase().includes(w))) {
          nicheScore = Math.max(nicheScore, 25);
        }
      }
    }

    // 2. Subtopic Match Score (Max 25 points)
    let subtopicScore = 0;
    if (subtopics.length > 0) {
      let matchedCount = 0;
      for (const st of subtopics) {
        if (textCorpus.includes(st)) {
          matchedCount++;
        } else {
          const stWords = st.split(/\s+/).map((w) => w.trim().replace(/[^a-z0-9]/g, '')).filter((w) => w.length >= 2);
          if (stWords.some((w) => textCorpus.includes(w))) {
            matchedCount += 0.5;
          }
        }
      }
      subtopicScore = Math.min(25, Math.round((matchedCount / subtopics.length) * 25));
    } else {
      // Default to neutral subtopic score if none configured
      subtopicScore = 15;
    }

    // 3. Query Breadth / Multi-Angle Match (Max 15 points)
    // Channels appearing across multiple search angles indicate strong domain focus
    const queryBreadthScore = Math.min(15, allMatchedQueries.length * 5);

    // 4. Content Consistency & Reach Signal (Max 15 points)
    let reachScore = 0;
    if (raw.videoCount !== undefined && raw.videoCount > 0) {
      if (raw.videoCount >= 50) reachScore += 8;
      else if (raw.videoCount >= 10) reachScore += 5;
      else reachScore += 2;
    } else {
      reachScore += 4; // Neutral if not returned by provider
    }

    if (raw.subscriberCount !== undefined && raw.subscriberCount > 0) {
      if (raw.subscriberCount >= 50000) reachScore += 7;
      else if (raw.subscriberCount >= 5000) reachScore += 5;
      else reachScore += 2;
    } else {
      reachScore += 3; // Neutral if not returned by provider
    }

    // 5. Language Match Signal (Max 10 points)
    let languageScore = 8; // Default conservative English / international
    if (language.includes('english') || language.includes('en')) {
      languageScore = 10;
    }

    const totalRaw = nicheScore + subtopicScore + queryBreadthScore + reachScore + languageScore;
    const finalScore = Math.min(100, Math.max(10, Math.round(totalRaw)));

    const cleanChannelId = raw.channelId.replace(/^UC/, 'UC');
    const channelUrl = raw.channelUrl || `https://www.youtube.com/channel/${cleanChannelId}`;

    return {
      channelId: cleanChannelId,
      channelName: raw.channelName,
      channelUrl,
      thumbnail: raw.thumbnail,
      description: raw.description,
      subscriberCount: raw.subscriberCount,
      videoCount: raw.videoCount,
      relevanceScore: finalScore,
      matchedQueries: Array.from(new Set(allMatchedQueries)),
      discoveredAt: new Date().toISOString(),
    };
  }

  /**
   * Consolidates and deduplicates raw channels discovered across multiple queries.
   */
  public static consolidateChannels(
    rawChannels: RawDiscoveredChannel[],
    settings: WorkspaceSettings,
  ): ChannelCandidate[] {
    const channelMap = new Map<
      string,
      {
        channel: RawDiscoveredChannel;
        matchedQueries: Set<string>;
      }
    >();

    for (const raw of rawChannels) {
      if (!raw.channelId || !raw.channelName) continue;
      const existing = channelMap.get(raw.channelId);
      if (existing) {
        existing.matchedQueries.add(raw.matchedQuery);
        // Retain more complete metadata if subsequent hit has it
        if (!existing.channel.thumbnail && raw.thumbnail) {
          existing.channel.thumbnail = raw.thumbnail;
        }
        if (!existing.channel.subscriberCount && raw.subscriberCount) {
          existing.channel.subscriberCount = raw.subscriberCount;
        }
        if (!existing.channel.videoCount && raw.videoCount) {
          existing.channel.videoCount = raw.videoCount;
        }
      } else {
        channelMap.set(raw.channelId, {
          channel: { ...raw },
          matchedQueries: new Set([raw.matchedQuery]),
        });
      }
    }

    const scored = Array.from(channelMap.values()).map(({ channel, matchedQueries }) =>
      this.scoreChannel(channel, Array.from(matchedQueries), settings),
    );

    // Sort by relevance score descending
    return scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}
