import { WorkspaceSettings, MonitoredChannel } from '../../types';
import { RssEntry } from './rss/rss-discovery.provider';

export interface VideoRelevanceResult {
  score: number; // 0 - 100
  relevant: boolean;
  reasons: string[];
  rejectionReason?: string;
}

export interface VideoRelevanceOptions {
  threshold?: number;
}

export const DEFAULT_VIDEO_RELEVANCE_THRESHOLD = 60;

export class VideoRelevanceScorer {
  private static readonly STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
    'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
    'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'down',
    'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
    'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
    'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
    'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only',
    'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
    'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
    'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
    'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
    'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'you', 'your', 'yours',
  ]);

  /**
   * Tokenizes text into normalized lowercase alphanumeric words (preserving 2+ character words like "ai", "ml", "3d").
   */
  public static tokenize(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-_]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !this.STOP_WORDS.has(w));
  }

  /**
   * Normalizes a search phrase for substring matching.
   */
  public static normalizePhrase(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Evaluates the relevance of an RSS video upload against active workspace settings.
   */
  public static scoreVideo(
    video: Pick<RssEntry, 'title' | 'description'> | { title: string; description?: string },
    channel: Pick<MonitoredChannel, 'channelName' | 'relevanceScore' | 'niche'> | { channelName?: string; relevanceScore?: number },
    settings: WorkspaceSettings,
    options: VideoRelevanceOptions = {},
  ): VideoRelevanceResult {
    const threshold = options.threshold ?? DEFAULT_VIDEO_RELEVANCE_THRESHOLD;
    const reasons: string[] = [];
    let score = 0;

    const rawNiche = settings.niche?.trim() || '';
    const normNiche = this.normalizePhrase(rawNiche);
    const nicheTokens = this.tokenize(rawNiche);

    const subtopics = (settings.subtopics || [])
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const subtopicTokens = Array.from(
      new Set(subtopics.flatMap((s) => this.tokenize(s))),
    );

    const rawTitle = video.title || '';
    const normTitle = this.normalizePhrase(rawTitle);
    const titleTokens = this.tokenize(rawTitle);
    const titleTokenSet = new Set(titleTokens);

    const rawDesc = video.description || '';
    const normDesc = this.normalizePhrase(rawDesc);
    const descTokens = this.tokenize(rawDesc);
    const descTokenSet = new Set(descTokens);

    // 1. Direct or Keyword Matches in Title (Dominant Factor: up to 55 pts)
    if (normNiche && normTitle.includes(normNiche)) {
      score += 45;
      reasons.push(`Direct niche phrase match in title ("${normNiche}") (+45 pts)`);
    } else {
      let matchedNicheTokens = 0;
      for (const token of nicheTokens) {
        if (titleTokenSet.has(token) || titleTokens.some((t) => t.includes(token) || token.includes(t))) {
          matchedNicheTokens++;
        }
      }
      if (matchedNicheTokens > 0) {
        const pts = matchedNicheTokens === 1 ? 30 : Math.min(45, matchedNicheTokens * 25);
        score += pts;
        reasons.push(`Matched ${matchedNicheTokens} niche keywords in title (+${pts} pts)`);
      }
    }

    // 2. Subtopic Matches in Title (up to 30 pts)
    let matchedSubtopicPhrase = false;
    for (const sub of subtopics) {
      const normSub = this.normalizePhrase(sub);
      if (normSub && normTitle.includes(normSub)) {
        score += 30;
        reasons.push(`Direct subtopic match in title ("${normSub}") (+30 pts)`);
        matchedSubtopicPhrase = true;
        break;
      }
    }

    if (!matchedSubtopicPhrase && subtopicTokens.length > 0) {
      let matchedSubTokens = 0;
      for (const token of subtopicTokens) {
        if (titleTokenSet.has(token) || titleTokens.some((t) => t.includes(token) || token.includes(t))) {
          matchedSubTokens++;
        }
      }
      if (matchedSubTokens > 0) {
        const pts = Math.min(25, matchedSubTokens * 15);
        score += pts;
        reasons.push(`Matched subtopic keywords in title (+${pts} pts)`);
      }
    }

    // 3. Description Relevance (up to 25 pts)
    if (normNiche && normDesc.includes(normNiche)) {
      score += 20;
      reasons.push(`Niche mentioned in description (+20 pts)`);
    } else {
      let matchedDescNiche = 0;
      for (const token of nicheTokens) {
        if (descTokenSet.has(token) || descTokens.some((t) => t.includes(token) || token.includes(t))) {
          matchedDescNiche++;
        }
      }
      if (matchedDescNiche > 0) {
        const pts = Math.min(15, matchedDescNiche * 8);
        score += pts;
        reasons.push(`Niche keywords in description (+${pts} pts)`);
      }
    }

    for (const sub of subtopics) {
      const normSub = this.normalizePhrase(sub);
      if (normSub && normDesc.includes(normSub)) {
        score += 15;
        reasons.push(`Subtopic "${normSub}" in description (+15 pts)`);
        break;
      } else {
        const sTokens = this.tokenize(sub);
        const hasSome = sTokens.filter((t) => descTokenSet.has(t));
        if (hasSome.length > 0) {
          score += 10;
          reasons.push(`Subtopic terms in description (+10 pts)`);
          break;
        }
      }
    }

    // 4. Channel Supporting Evidence (Bounded up to 15 pts)
    const channelScore = typeof channel.relevanceScore === 'number' ? channel.relevanceScore : 50;
    const channelBonus = Math.round((channelScore / 100) * 15);
    score += channelBonus;
    reasons.push(`Monitored channel relevance evidence (${channelScore}/100 -> +${channelBonus} pts)`);

    // Channel Name alignment
    if (channel.channelName) {
      const chTokens = this.tokenize(channel.channelName);
      const chMatch = chTokens.some((t) =>
        nicheTokens.some((nt) => nt.includes(t) || t.includes(nt)) ||
        subtopicTokens.some((st) => st.includes(t) || t.includes(st)),
      );
      if (chMatch) {
        score += 5;
        reasons.push(`Channel brand aligns with niche (+5 pts)`);
      }
    }

    // 5. Off-Topic / Lifestyle Penalty (e.g. vlog, haul, mukbang on non-lifestyle channels)
    const isVlogNoise = /\b(vlog|haul|mukbang|unboxing my makeup|daily routine|get ready with me|grwm)\b/i.test(
      rawTitle,
    );
    const nicheIsLifestyle = /\b(vlog|lifestyle|beauty|makeup)\b/i.test(rawNiche);

    if (isVlogNoise && !nicheIsLifestyle) {
      score = Math.max(0, score - 35);
      reasons.push(`Off-topic lifestyle penalty (-35 pts)`);
    }

    // Clamp score to 0..100
    const finalScore = Math.min(100, Math.max(0, score));
    const relevant = finalScore >= threshold;

    let rejectionReason: string | undefined;
    if (!relevant) {
      rejectionReason = `Video score ${finalScore}/100 is below relevance threshold (${threshold}/100) for niche "${rawNiche}".`;
    }

    return {
      score: finalScore,
      relevant,
      reasons,
      rejectionReason,
    };
  }
}
