import { promises as fs } from 'fs';
import path from 'path';

/**
 * The week's 60-second Short, as written by the YouTube upload step
 * (video-short/src/upload.ts) to data/weeks/<week>/video.json. The MP4 lives
 * on YouTube only; the site keeps this record and a ~30 KB poster under
 * public/video/shorts/ (Vercel storage limits).
 */
export type WeeklyShort = {
  week: string;
  youtubeId: string | null;
  title: string;
  durationS: number;
  /** Site path of our own poster frame, shown until the reader presses play. */
  poster: string;
  story: { title: string; url: string; source: string };
  uploadedAt: string | null;
  /**
   * True once YouTube serves the video publicly. Uploads stay private until
   * the API project passes YouTube's audit, and a private video won't play in
   * an embed, so the site shows nothing until this is true. Recorded by the
   * upload step (and its --sync mode), never checked at request time.
   */
  public: boolean;
};

/** Whether a record should appear on the site. Dev shows any record so layouts can be mocked. */
export function isShowable(short: WeeklyShort, env = process.env.NODE_ENV): boolean {
  if (env !== 'production') return true;
  return Boolean(short.youtubeId && short.public);
}

export async function loadWeeklyShort(weekLabel: string): Promise<WeeklyShort | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'weeks', weekLabel, 'video.json'), 'utf-8');
    const short = JSON.parse(raw) as WeeklyShort;
    return isShowable(short) ? short : null;
  } catch {
    return null;
  }
}
