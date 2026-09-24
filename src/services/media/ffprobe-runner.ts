import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { RawProbeData } from '../rendering/media-validator';

const execFileAsync = promisify(execFile);

export class FFprobeRunner {
  /**
   * Probes an acquired media file using ffprobe.
   * Extracts container format, stream codecs, dimensions, frame counts, and fps.
   */
  static async probe(filePath: string): Promise<RawProbeData> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`FFPROBE_ERROR: File does not exist at "${filePath}".`);
    }

    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=format_name,duration,size,bit_rate:stream=codec_type,codec_name,width,height,nb_frames,r_frame_rate,avg_frame_rate,duration',
      '-of',
      'json',
      filePath,
    ];

    try {
      const { stdout } = await execFileAsync('ffprobe', args);
      const parsed = JSON.parse(stdout);
      return parsed;
    } catch (err: any) {
      throw new Error(`FFPROBE_PROBE_FAILED: ffprobe parsing failed: ${err.message}`);
    }
  }

  /**
   * Inspects frame timestamps to verify real frame progression across the timeline.
   */
  static async verifyFrameProgression(
    filePath: string,
    sampleCount: number = 10,
  ): Promise<{ hasProgression: boolean; timestamps: number[]; details: string }> {
    try {
      const args = [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'frame=pkt_pts_time,pict_type',
        '-read_intervals',
        `%+#${sampleCount}`,
        '-of',
        'json',
        filePath,
      ];

      const { stdout } = await execFileAsync('ffprobe', args);
      const parsed = JSON.parse(stdout);
      const frames = parsed.frames || [];

      if (frames.length <= 1) {
        return {
          hasProgression: false,
          timestamps: [],
          details: `Detected only ${frames.length} frame(s). Static media or zero-frame file.`,
        };
      }

      const timestamps = frames
        .map((f: any) => parseFloat(f.pkt_pts_time || '0'))
        .filter((t: number) => !isNaN(t));

      // Verify that timestamps actually increment and are not all identical (0.000000)
      const uniqueTimestamps = new Set(timestamps);
      const hasProgression = uniqueTimestamps.size > 1;

      return {
        hasProgression,
        timestamps,
        details: hasProgression
          ? `Verified ${frames.length} progressing frames across sampled intervals.`
          : 'All frame timestamps are identical. Suspected static image wrapper.',
      };
    } catch (err: any) {
      return {
        hasProgression: false,
        timestamps: [],
        details: `Frame progression probe error: ${err.message}`,
      };
    }
  }
}
