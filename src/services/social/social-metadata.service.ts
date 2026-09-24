import { ClipCandidate, WorkspaceSettings } from '../../types';

export interface SocialMetadataResult {
  caption: string;
  hashtags: string[];
}

export class SocialMetadataService {
  static generate(candidate: ClipCandidate, settings: WorkspaceSettings): SocialMetadataResult {
    const nicheClean = settings.niche.replace(/\s+/g, '');
    const nicheLower = settings.niche.toLowerCase();

    // High engagement caption format tailored to the candidate hook and payoff
    let caption = '';

    const spokenContent = candidate.transcript || candidate.summary || candidate.context;

    if (settings.captionStyle === 'bold_punchy') {
      caption = `${candidate.hook.toUpperCase()}\n\n${candidate.context}\n\nKey Takeaway: ${candidate.payoff}\n\nThoughts? Drop them below 👇`;
    } else if (settings.captionStyle === 'clean_subtle') {
      caption = `${candidate.hook}\n\n${spokenContent.slice(0, 180)}...\n\nSave this for your ${nicheLower} toolkit.`;
    } else if (settings.captionStyle === 'karaoke_highlight') {
      caption = `⚡ ${candidate.hook}\n\n"${spokenContent.slice(0, 150)}..."\n\nFull breakdown from ${candidate.sourceChannel}.`;
    } else {
      // Minimal
      caption = `${candidate.hook}\n\n${candidate.payoff}`;
    }

    // Hashtags derived organically from niche and subtopics
    const tagsSet = new Set<string>();
    tagsSet.add(`#${nicheClean}`);
    tagsSet.add(`#${nicheClean}Tips`);
    tagsSet.add('#ClipFlow');

    for (const sub of settings.subtopics.slice(0, 3)) {
      const cleanSub = sub.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanSub) {
        tagsSet.add(`#${cleanSub}`);
      }
    }

    tagsSet.add('#ContentCreation');
    tagsSet.add('#ShortForm');

    return {
      caption,
      hashtags: Array.from(tagsSet),
    };
  }
}
