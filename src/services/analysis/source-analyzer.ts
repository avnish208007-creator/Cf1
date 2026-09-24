import { SourceVideo, SourceAnalysisResult, WorkspaceSettings } from '../../types';

export class SourceAnalyzer {
  static analyze(source: SourceVideo, settings: WorkspaceSettings): SourceAnalysisResult {
    // Validation: Ensure source actually has content to analyze
    if (!source.title || source.title.trim().length < 4) {
      throw new Error(
        'SOURCE_ANALYSIS_UNAVAILABLE: Insufficient source content. The source title is missing or too brief to perform genuine analysis.',
      );
    }

    const titleLower = source.title.toLowerCase();
    const descLower = (source.description || '').toLowerCase();
    const nicheLower = (settings.niche || '').toLowerCase().trim();

    // 1. Niche Relevance (0 - 100)
    let relevanceScore = 55;
    const nicheKeywords = nicheLower.split(/\s+/).filter((k) => k.length > 2);
    let nicheMatches = 0;
    for (const kw of nicheKeywords) {
      if (titleLower.includes(kw)) nicheMatches += 2;
      if (descLower.includes(kw)) nicheMatches += 1;
    }
    if (titleLower.includes(nicheLower)) relevanceScore += 25;
    else if (nicheMatches > 0) relevanceScore += Math.min(25, nicheMatches * 8);

    if (descLower.includes(nicheLower)) relevanceScore += 10;
    relevanceScore = Math.min(100, relevanceScore);

    // 2. Subtopic Relevance (0 - 100)
    let subtopicMatches = 0;
    let matchedSubtopicsCount = 0;
    if (settings.subtopics && settings.subtopics.length > 0) {
      for (const sub of settings.subtopics) {
        const subLower = sub.toLowerCase().trim();
        if (subLower.length === 0) continue;
        const inTitle = titleLower.includes(subLower);
        const inDesc = descLower.includes(subLower);
        if (inTitle || inDesc) {
          matchedSubtopicsCount += 1;
          subtopicMatches += inTitle ? 2 : 1;
        }
      }
      const ratio = matchedSubtopicsCount / settings.subtopics.length;
      var subtopicMatchScore = Math.min(100, Math.round(50 + ratio * 50));
    } else {
      var subtopicMatchScore = 75; // Neutral baseline when no subtopics configured
    }

    // 3. Topic Clarity (0 - 100)
    let topicClarity = 70;
    if (source.title.length >= 15 && source.title.length <= 100) topicClarity += 15;
    if (source.title.includes('?') || source.title.includes(':') || source.title.includes('—') || source.title.includes('|')) {
      topicClarity += 10;
    }
    if (source.channelTitle && source.channelTitle.length > 2) topicClarity += 5;
    topicClarity = Math.min(100, topicClarity);

    // 4. Content Richness (0 - 100)
    let contentRichness = 60;
    if (source.duration >= 180 && source.duration <= 1200) {
      contentRichness += 25; // 3-20m sweet spot for rich moment extraction
    } else if (source.duration > 1200) {
      contentRichness += 15;
    } else if (source.duration >= 60) {
      contentRichness += 10;
    }
    if ((source.description || '').length > 100) contentRichness += 15;
    contentRichness = Math.min(100, contentRichness);

    // 5. Hook Potential & Indicators
    const hookIndicators = [
      'how to',
      'why',
      'what happens',
      'mistake',
      'secret',
      'guide',
      'best',
      'breakdown',
      'truth',
      'never',
      'always',
      'tested',
      'lesson',
      'step',
      'framework',
      'revealed',
      'rule',
      'vs',
      'stop',
    ];
    let potentialHooksCount = 1;
    for (const kw of hookIndicators) {
      if (titleLower.includes(kw) || descLower.includes(kw)) {
        potentialHooksCount += 1;
      }
    }
    potentialHooksCount = Math.min(8, potentialHooksCount);
    const hookPotentialScore = Math.min(100, Math.round(50 + potentialHooksCount * 6.5));

    // 6. Topic Category Classification
    let topicCategory = 'Actionable Guide';
    if (titleLower.includes('how to') || titleLower.includes('guide') || titleLower.includes('step')) {
      topicCategory = 'Practical Tutorial';
    } else if (titleLower.includes('why') || titleLower.includes('breakdown') || titleLower.includes('explained')) {
      topicCategory = 'Strategic Breakdown';
    } else if (titleLower.includes('vs') || titleLower.includes('review') || titleLower.includes('tested')) {
      topicCategory = 'Comparative Analysis';
    } else if (titleLower.includes('mistake') || titleLower.includes('truth') || titleLower.includes('secret')) {
      topicCategory = 'Critical Insight & Teardown';
    } else if (settings.contentStyle === 'storytelling') {
      topicCategory = 'Narrative Case Study';
    } else if (settings.contentStyle === 'interview') {
      topicCategory = 'Expert Discussion';
    }

    // 7. Standalone Context Score (0 - 100)
    const standaloneContextScore = Math.min(
      96,
      Math.round(topicClarity * 0.5 + relevanceScore * 0.3 + contentRichness * 0.2),
    );

    // 8. Short-Form Potential Score (0 - 100)
    const shortFormPotentialScore = Math.min(
      98,
      Math.round(
        relevanceScore * 0.25 +
          hookPotentialScore * 0.3 +
          topicClarity * 0.2 +
          contentRichness * 0.15 +
          standaloneContextScore * 0.1,
      ),
    );

    // 9. Confidence Score (0 - 100)
    let confidence = 75;
    if (source.title.length > 20) confidence += 10;
    if ((source.description || '').length > 80) confidence += 10;
    if (source.duration > 0) confidence += 5;
    confidence = Math.min(100, confidence);

    // Recommended Angles
    const recommendedAngles: string[] = [];
    if (potentialHooksCount >= 3) {
      recommendedAngles.push('Direct question & misconception reveal');
    }
    recommendedAngles.push(`Actionable ${settings.niche} core takeaway`);
    if (settings.contentStyle === 'breakdown' || settings.contentStyle === 'educational') {
      recommendedAngles.push('Step-by-step tactical insight');
    } else {
      recommendedAngles.push('High-engagement narrative hook');
    }

    const reasoning = `Source exhibits strong keyword affinity for "${settings.niche}" (Relevance: ${relevanceScore}/100) with ${topicCategory} classification. Content duration of ${Math.round(
      source.duration,
    )}s and ${potentialHooksCount} detected hook triggers provide optimal depth for high-retention 15-60s extraction.`;

    return {
      relevance: relevanceScore,
      subtopicMatchScore,
      topicClarity,
      contentRichness,
      potentialHooksCount,
      standaloneContextScore,
      shortFormPotentialScore,
      topicCategory,
      hookPotentialScore,
      confidence,
      reasoning,
      recommendedAngles,
      analyzedAt: new Date().toISOString(),
    };
  }

  // Transparent multi-factor ranking
  static calculateRankScore(source: SourceVideo, analysis: SourceAnalysisResult): number {
    // 1. Niche relevance: 35%
    const nicheFactor = (analysis.relevance / 100) * 35;

    // 2. Subtopic match: 20%
    const subtopicFactor = (analysis.subtopicMatchScore / 100) * 20;

    // 3. Short-form & hook potential: 25%
    const potentialFactor =
      ((analysis.hookPotentialScore * 0.5 + analysis.shortFormPotentialScore * 0.5) / 100) * 25;

    // 4. Freshness: 10% (based on real publishedAt)
    let freshnessScore = 50;
    if (source.publishedAt) {
      const daysOld = (Date.now() - new Date(source.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld <= 30) freshnessScore = 100;
      else if (daysOld <= 90) freshnessScore = 85;
      else if (daysOld <= 180) freshnessScore = 70;
      else if (daysOld <= 365) freshnessScore = 60;
      else freshnessScore = 45;
    }
    const freshnessFactor = (freshnessScore / 100) * 10;

    // 5. Source quality & duration fitness: 10%
    let durationScore = 70;
    if (source.duration >= 180 && source.duration <= 1200) durationScore = 100;
    else if (source.duration >= 60 && source.duration <= 2400) durationScore = 85;
    else if (source.duration > 0) durationScore = 60;
    const qualityFactor = (durationScore / 100) * 10;

    const rank = Math.round(nicheFactor + subtopicFactor + potentialFactor + freshnessFactor + qualityFactor);
    return Math.max(1, Math.min(100, rank));
  }
}

