import { MomentScores, QualityTier, ClipCandidate, CandidateRejection } from '../../types';

export interface ScoreMomentParams {
  hookStrength: number; // 0-100
  curiosity: number; // 0-100
  payoff: number; // 0-100
  standaloneContext: number; // 0-100
  clarity: number; // 0-100
  emotionalValue: number; // 0-100
  duration: number; // in seconds
  sourceRelevance?: number; // 0-100
}

export class MomentScorer {
  static calculateDurationFitness(duration: number): number {
    if (duration >= 20 && duration <= 45) return 100;
    if (duration >= 15 && duration < 20) return 85;
    if (duration > 45 && duration <= 60) return 85;
    if (duration < 15) return Math.max(10, Math.round((duration / 15) * 50));
    // duration > 60
    return Math.max(20, Math.round(100 - (duration - 60) * 2));
  }

  static scoreMoment(params: ScoreMomentParams): { scores: MomentScores; qualityTier: QualityTier } {
    const {
      hookStrength,
      curiosity,
      payoff,
      standaloneContext,
      clarity,
      emotionalValue,
      duration,
      sourceRelevance = 80,
    } = params;

    const durationFitness = this.calculateDurationFitness(duration);

    // Short form potential formula (0 - 100)
    const shortFormPotential = Math.min(
      100,
      Math.max(
        1,
        Math.round(
          hookStrength * 0.3 +
            curiosity * 0.15 +
            payoff * 0.25 +
            standaloneContext * 0.15 +
            (durationFitness / 100) * 15,
        ),
      ),
    );

    // Weighted Overall Score (0 - 100)
    // Hook: 25%, Payoff: 20%, Curiosity: 15%, Standalone Context: 10%, Clarity: 10%, Duration Fitness: 10%, Source Relevance: 10%
    const overall = Math.min(
      100,
      Math.max(
        1,
        Math.round(
          hookStrength * 0.25 +
            payoff * 0.2 +
            curiosity * 0.15 +
            standaloneContext * 0.1 +
            clarity * 0.1 +
            (durationFitness / 100) * 10 +
            (sourceRelevance / 100) * 10,
        ),
      ),
    );

    const scores: MomentScores = {
      hook: Math.round(hookStrength),
      curiosity: Math.round(curiosity),
      payoff: Math.round(payoff),
      standaloneContext: Math.round(standaloneContext),
      clarity: Math.round(clarity),
      emotionalValue: Math.round(emotionalValue),
      durationFitness,
      sourceRelevance: Math.round(sourceRelevance),
      shortFormPotential,
      overall,
    };

    let qualityTier: QualityTier = 'Weak';
    if (overall >= 85) {
      qualityTier = 'Excellent';
    } else if (overall >= 75) {
      qualityTier = 'Strong';
    } else if (overall >= 65) {
      qualityTier = 'Potential';
    } else {
      qualityTier = 'Weak';
    }

    return { scores, qualityTier };
  }

  // Deduplicate overlapping candidates deterministically while preserving rejection records
  static deduplicateAndFilter(candidates: ClipCandidate[]): {
    accepted: ClipCandidate[];
    rejected: CandidateRejection[];
  } {
    const accepted: ClipCandidate[] = [];
    const rejected: CandidateRejection[] = [];

    // First pass: Filter out candidates with invalid duration limits
    const validDurationCandidates: ClipCandidate[] = [];
    for (const c of candidates) {
      if (c.duration < 15) {
        rejected.push({
          candidateId: c.id,
          startTime: c.startTime,
          endTime: c.endTime,
          duration: c.duration,
          reason: `Rejected: Candidate duration (${c.duration}s) is shorter than minimum short-form limit of 15s.`,
          topic: c.topic,
        });
      } else if (c.duration > 60) {
        rejected.push({
          candidateId: c.id,
          startTime: c.startTime,
          endTime: c.endTime,
          duration: c.duration,
          reason: `Rejected: Candidate duration (${c.duration}s) exceeds maximum short-form limit of 60s.`,
          topic: c.topic,
        });
      } else {
        validDurationCandidates.push(c);
      }
    }

    // Sort by overall score descending so the strongest candidate takes precedence
    const sorted = [...validDurationCandidates].sort((a, b) => b.scores.overall - a.scores.overall);

    for (const candidate of sorted) {
      let hasHeavyOverlap = false;
      let winningCandidate: ClipCandidate | null = null;
      let overlapSeconds = 0;

      for (const existing of accepted) {
        const maxStart = Math.max(candidate.startTime, existing.startTime);
        const minEnd = Math.min(candidate.endTime, existing.endTime);
        const overlap = minEnd - maxStart;

        // An overlap of > 5 seconds constitutes a conflicting moment
        if (overlap > 5) {
          hasHeavyOverlap = true;
          winningCandidate = existing;
          overlapSeconds = overlap;
          break;
        }
      }

      if (hasHeavyOverlap && winningCandidate) {
        rejected.push({
          candidateId: candidate.id,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          duration: candidate.duration,
          reason: `Rejected: Heavily overlaps (${Math.round(overlapSeconds)}s) with higher-scoring candidate [${winningCandidate.id}] (Score ${winningCandidate.scores.overall} vs ${candidate.scores.overall}).`,
          topic: candidate.topic,
        });
      } else {
        accepted.push(candidate);
      }
    }

    // Return accepted sorted chronologically by startTime
    accepted.sort((a, b) => a.startTime - b.startTime);

    return { accepted, rejected };
  }

  // Legacy helper for backward compatibility
  static deduplicateOverlapping(
    candidates: Array<{ startTime: number; endTime: number; scores: MomentScores }>,
  ): typeof candidates {
    const sorted = [...candidates].sort((a, b) => b.scores.overall - a.scores.overall);
    const nonOverlapping: typeof candidates = [];

    for (const item of sorted) {
      const overlaps = nonOverlapping.some((existing) => {
        const maxStart = Math.max(item.startTime, existing.startTime);
        const minEnd = Math.min(item.endTime, existing.endTime);
        const overlapDuration = minEnd - maxStart;
        return overlapDuration > 5;
      });

      if (!overlaps) {
        nonOverlapping.push(item);
      }
    }

    return nonOverlapping.sort((a, b) => a.startTime - b.startTime);
  }
}

