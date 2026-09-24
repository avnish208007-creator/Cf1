import { SubtitlePreferences } from '../../types';
import { SubtitleConfig } from './render-config';

export interface SubtitleCue {
  startTime: number; // In absolute source seconds or relative seconds
  endTime: number;
  text: string;
}

export class SubtitleGenerator {
  /**
   * Converts milliseconds or seconds to standard SRT timestamp format (HH:MM:SS,mmm)
   */
  public static formatSrtTime(seconds: number): string {
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const hrs = Math.floor(totalMs / 3600000);
    const mins = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;

    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms
      .toString()
      .padStart(3, '0')}`;
  }

  /**
   * Word-wraps text to a max character length per line without breaking words
   */
  public static wrapText(text: string, maxCharsPerLine: number = 28): string {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (!currentLine) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
        currentLine += ` ${word}`;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.join('\n');
  }

  /**
   * Converts absolute source cues to clip-relative SRT cues.
   * If a cue occurs at source time 132s for a candidate starting at 125s,
   * it appears at relative time 7s in the rendered clip.
   */
  public static generateRelativeSrt(
    cues: SubtitleCue[],
    candidateStartTime: number,
    candidateEndTime: number,
    prefs?: Partial<SubtitlePreferences>,
  ): string {
    const isUppercase = prefs?.uppercase ?? true;
    const maxChars = prefs?.maxWordsPerLine ? prefs.maxWordsPerLine * 7 : 28;
    const clipDuration = candidateEndTime - candidateStartTime;

    const relativeCues: Array<{ start: number; end: number; text: string }> = [];

    for (const cue of cues) {
      // Check if cue overlaps with the candidate window
      if (cue.endTime <= candidateStartTime || cue.startTime >= candidateEndTime) {
        continue;
      }

      // Convert to clip-relative timestamps
      const relStart = Math.max(0, cue.startTime - candidateStartTime);
      const relEnd = Math.min(clipDuration, cue.endTime - candidateStartTime);

      if (relEnd > relStart) {
        let text = cue.text;
        if (isUppercase) text = text.toUpperCase();
        text = this.wrapText(text, maxChars);

        relativeCues.push({ start: relStart, end: relEnd, text });
      }
    }

    if (relativeCues.length === 0) {
      return '';
    }

    // Build SRT content
    let srt = '';
    relativeCues.forEach((cue, index) => {
      srt += `${index + 1}\n`;
      srt += `${this.formatSrtTime(cue.start)} --> ${this.formatSrtTime(cue.end)}\n`;
      srt += `${cue.text}\n\n`;
    });

    return srt.trim() + '\n';
  }

  /**
   * Generates a single or multi-segment SRT from candidate summary / hook / transcript
   */
  public static generateFromText(
    text: string,
    clipDuration: number,
    prefs?: Partial<SubtitlePreferences>,
  ): string {
    if (!text || !text.trim()) return '';

    const isUppercase = prefs?.uppercase ?? true;
    const maxWords = prefs?.maxWordsPerLine || 3;
    const words = text.trim().split(/\s+/);

    if (words.length <= maxWords * 2) {
      // Single full cue
      let formattedText = isUppercase ? text.toUpperCase() : text;
      formattedText = this.wrapText(formattedText, 28);
      return `1\n00:00:00,500 --> ${this.formatSrtTime(
        Math.max(1, clipDuration - 0.5),
      )}\n${formattedText}\n`;
    }

    // Chunk into timed segments across the clip duration
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += maxWords) {
      chunks.push(words.slice(i, i + maxWords).join(' '));
    }

    const durationPerChunk = clipDuration / chunks.length;
    let srt = '';

    chunks.forEach((chunk, idx) => {
      const start = idx * durationPerChunk;
      const end = (idx + 1) * durationPerChunk;
      let chunkText = isUppercase ? chunk.toUpperCase() : chunk;
      chunkText = this.wrapText(chunkText, 24);

      srt += `${idx + 1}\n`;
      srt += `${this.formatSrtTime(start)} --> ${this.formatSrtTime(end)}\n`;
      srt += `${chunkText}\n\n`;
    });

    return srt.trim() + '\n';
  }

  /**
   * Builds FFmpeg force_style string for ASS/SRT burning filter
   */
  public static buildForceStyle(
    prefs?: Partial<SubtitlePreferences>,
    brandAccent?: string,
  ): string {
    const fontSize = prefs?.fontSize || 26;
    const isCenter = prefs?.position === 'center';
    const marginV = isCenter ? 960 : 180;
    const outline = 3;
    const shadow = 2;

    // Primary text: White (&H00FFFFFF), Outline: Pure Black (&H00000000)
    return `FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=${outline},Shadow=${shadow},MarginV=${marginV},MarginL=60,MarginR=60,Alignment=2`;
  }
}
