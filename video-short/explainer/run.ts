/**
 * 2-minute "how Luxury Intel works" explainer. Run from the repo root:
 *   npx tsx video-short/explainer/run.ts [--preview] [--out=path.mp4]
 * --preview: fake timings, one screenshot per scene, no API calls.
 * Reuses the repo's video-short voice + budget modules (gpt-4o-mini-tts).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

const REPO = process.cwd();
const HERE = __dirname;
const { loadEnv } = require(path.join(REPO, 'lib/env'));
const { Budget } = require(path.join(REPO, 'video-short/src/budget'));
const { buildVoice } = require(path.join(REPO, 'video-short/src/voice'));
const { chromium } = require(path.join(REPO, 'video-short/node_modules/playwright-core'));

const FPS = 30;
const TAIL_S = 1.2;

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel }); } catch { /* next */ }
  }
  return chromium.launch();
}

async function main() {
  loadEnv();
  const preview = process.argv.includes('--preview');
  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? path.join(HERE, 'out', 'luxury-intel-how-it-works.mp4');
  const work = path.join(HERE, 'out');
  await fs.mkdir(work, { recursive: true });
  const scenes = JSON.parse(await fs.readFile(path.join(HERE, 'scenes.json'), 'utf8'));

  let timed: any[], audio = '', total: number;
  if (preview) {
    let t = 0;
    timed = scenes.map((sc: any) => {
      const words = sc.vo.split(/\s+/);
      const d = words.length / 3 + 0.4;
      const r = { ...sc, start: t, end: t + d, words: words.map((w: string, k: number) => ({ text: w, start: t + k / 3, end: t + (k + 1) / 3 })) };
      t += d;
      return r;
    });
    total = t;
  } else {
    const budget = await Budget.open(work, 'explainer');
    const v = await buildVoice(scenes, budget, work);
    timed = v.timed; audio = v.audio; total = v.total + TAIL_S;
    timed[timed.length - 1].end = total;
    console.log(`[explainer] narration ${v.total.toFixed(1)}s, pace ${JSON.stringify(v.pace)}, spent $${budget.spentUsd.toFixed(4)}`);
  }

  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e: any) => errors.push(String(e)));
  await page.goto(pathToFileURL(path.join(HERE, 'template.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await (document as any).fonts.ready; });
  await page.evaluate((d: any) => (window as any).__setup(d), { scenes: timed, total });
  const bad: string[] = await page.evaluate(() => (window as any).__checkLayout());
  if (errors.length) throw new Error(errors.join('; '));
  if (bad.length) { console.log('[layout] problems:\n  ' + bad.join('\n  ')); if (!preview) process.exit(1); }

  if (preview) {
    for (const [i, sc] of timed.entries()) {
      await page.evaluate((t: number) => (window as any).__renderAt(t), sc.end - 0.5);
      await page.screenshot({ path: path.join(work, `preview-${String(i).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 80 });
    }
    await browser.close();
    console.log(`[preview] ${timed.length} frames in ${work}, est ${total.toFixed(0)}s`);
    return;
  }

  const frames = Math.ceil(total * FPS);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', audio,
    '-filter_complex', '[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,apad[a]',
    '-map', '0:v', '-map', '[a]', '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<void>((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t: number) => (window as any).__renderAt(t), f / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`[render] frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log(`[explainer] ${total.toFixed(1)}s video -> ${out}`);
}

main().catch(err => { console.error(err); process.exit(1); });
