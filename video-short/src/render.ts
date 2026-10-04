/**
 * Frame-accurate render: headless Chromium seeks the template to each frame's
 * time, screenshots it, and pipes JPEGs straight into ffmpeg (no frame files
 * on disk). Audio is muxed in the same ffmpeg pass.
 */
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { chromium, type Browser } from 'playwright-core';
import type { TimedScene } from './voice';

export const FPS = 30;

/** Vertical for phones (Shorts/Reels/TikTok), horizontal for desktop/YouTube. */
export type Format = 'portrait' | 'landscape';
export const FORMATS: Record<Format, { w: number; h: number; label: string }> = {
  portrait: { w: 1080, h: 1920, label: 'vertical' },
  landscape: { w: 1920, h: 1080, label: 'horizontal' },
};

/** Use an installed Chrome/Edge so nothing is downloaded. CI would use `npx playwright install chromium`. */
async function launch(): Promise<Browser> {
  for (const channel of ['chrome', 'msedge'] as const) {
    try { return await chromium.launch({ channel }); } catch { /* try next */ }
  }
  return chromium.launch();
}

export async function renderVideo(opts: {
  scenes: TimedScene[];
  total: number;
  issue: string;
  format: Format;
  audio: string;
  out: string;
  previewEvery?: number;
}): Promise<void> {
  const { w: W, h: H } = FORMATS[opts.format];
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve('video-short/template/index.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(d => (window as any).__setup(d), { scenes: opts.scenes, total: opts.total, issue: opts.issue, format: opts.format });
  if (errors.length) throw new Error(`template error: ${errors.join('; ')}`);

  // Spill check: every visible piece of text must sit inside the format's safe
  // area. Spilling scenes are scaled down automatically; anything that still
  // doesn't fit stops the render instead of shipping a broken frame.
  const layout: { fixes: string[]; violations: string[] } = await page.evaluate(() => (window as any).__checkLayout());
  for (const f of layout.fixes) console.log(`[layout:${opts.format}] fixed ${f}`);
  if (layout.violations.length) {
    await browser.close();
    throw new Error(`[layout:${opts.format}] text spills outside the safe area:\n  - ${layout.violations.join('\n  - ')}`);
  }
  console.log(`[layout:${opts.format}] all scenes and captions inside the safe area`);

  const frames = Math.ceil(opts.total * FPS);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', opts.audio,
    '-filter_complex', `[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,apad[a]`,
    '-map', '0:v', '-map', '[a]', '-t', opts.total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    opts.out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<void>((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => (window as any).__renderAt(t), f / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    if (opts.previewEvery && f % opts.previewEvery === 0) {
      await page.screenshot({ path: opts.out.replace(/\.mp4$/, `.f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 80 });
    }
    if (f % 150 === 0) console.log(`[render:${opts.format}] frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  if (errors.length) throw new Error(`template error during render: ${errors.join('; ')}`);
  console.log(`[render:${opts.format}] ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${opts.out}`);
}
