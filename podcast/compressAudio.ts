/**
 * Re-encode a podcast MP3 to 64 kbps mono.
 *
 * TTS output is 24 kHz mono speech at 128-160 kbps; 64 kbps sounds the same
 * and halves the file. That matters because every MP3 in public/podcast/
 * ships in every Vercel deployment, and Hobby deployment storage is 10 GB
 * for the whole account (docs/operations.md § Storage).
 */

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';

const run = promisify(execFile);

export const PODCAST_BITRATE = 64_000;

async function probeBitrate(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=bit_rate', '-of', 'csv=p=0', file,
  ]);
  return Number(stdout.trim()) || 0;
}

/**
 * Re-encodes `file` in place. Returns false (and leaves the file alone) when
 * it is already at or below the target, so re-running never re-encodes twice.
 * Throws if ffmpeg/ffprobe are missing or fail; the original is untouched then.
 */
export async function compressPodcastMp3(file: string): Promise<boolean> {
  const bitrate = await probeBitrate(file);
  // VBR/header rounding puts a 64k file at ~64,0xx, hence the margin.
  if (bitrate > 0 && bitrate <= PODCAST_BITRATE * 1.1) return false;

  const tmp = `${file}.tmp.mp3`;
  try {
    await run('ffmpeg', [
      '-v', 'error', '-y', '-i', file,
      '-map', '0:a', '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-ar', '24000',
      tmp,
    ], { maxBuffer: 10 * 1024 * 1024 });
    const { size } = await fs.stat(tmp);
    if (size < 10 * 1024) throw new Error(`ffmpeg output suspiciously small (${size} bytes)`);
    await fs.rename(tmp, file);
    return true;
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}
