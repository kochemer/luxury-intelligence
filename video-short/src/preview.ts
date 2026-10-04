/**
 * Free template check: renders a fixture with every visual kind and silent
 * audio. No API calls. Use it when changing template/index.html.
 *
 *   npx tsx video-short/src/preview.ts
 */
import { promises as fs } from 'fs';
import path from 'path';
import { renderVideo } from './render';
import { run } from './voice';
import type { TimedScene } from './voice';
import type { Visual } from './script';

const v = (p: Partial<Visual> & { kind: Visual['kind'] }): Visual => ({ big: '', small: '', items: [], emoji: '', bars: [], ...p });
const fixture: { vo: string; visual: Visual }[] = [
  { vo: 'Luxury just admitted something awkward.', visual: v({ kind: 'title', big: 'Growth was mostly price', small: 'Week 39' }) },
  { vo: 'A new report breaks down where growth came from.', visual: v({ kind: 'headline', big: '80pc of luxury growth came from price hikes', small: 'Luxury Daily' }) },
  { vo: '80 percent of it was price.', visual: v({ kind: 'stat', big: '80%', small: 'of growth came from price hikes' }) },
  { vo: 'Three things happened.', visual: v({ kind: 'list', big: 'Meanwhile', items: ['Prices up', 'Volumes flat', 'Margins fine'] }) },
  { vo: 'What they say versus what it is.', visual: v({ kind: 'versus', items: ['WHAT THEY SAY — Craftsmanship', 'WHAT IT IS — A price hike'] }) },
  { vo: 'Nobody asked.', visual: v({ kind: 'meme', items: ['Nobody:', 'Luxury CFOs: +9% again'] }) },
  { vo: 'The strategy, in code.', visual: v({ kind: 'code', small: 'strategy.js', items: ['if (demand < forecast) {', '  price *= 1.1; // heritage', '}'] }) },
  { vo: 'Compare the two.', visual: v({ kind: 'bars', small: 'Share of growth', bars: [{ label: 'Price', value: 80, display: '80%' }, { label: 'Volume', value: 20, display: '20%' }] }) },
  { vo: 'Which is a lot.', visual: v({ kind: 'emoji', emoji: '💀', big: 'Which is a lot.' }) },
  { vo: 'This has been Luxury Intel in 60 seconds.', visual: v({ kind: 'outro' }) },
];

async function main() {
  const outDir = path.join('data', 'weeks', '_preview', 'video-short');
  await fs.mkdir(outDir, { recursive: true });
  let t = 0;
  const scenes: TimedScene[] = fixture.map(s => {
    const d = 2.2;
    const words = s.vo.split(/\s+/);
    const scene = { ...s, start: t, end: t + d, words: words.map((w, i) => ({ text: w, start: t + (i * 1.9) / words.length, end: t + ((i + 1) * 1.9) / words.length })) };
    t += d;
    return scene;
  });
  const audio = path.join(outDir, 'silence.wav');
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(t), audio]);
  for (const format of ['portrait', 'landscape'] as const) {
    await renderVideo({ scenes, total: t, issue: 'W39 · SEP 2026', format, audio, out: path.join(outDir, `preview-${format}.mp4`), previewEvery: 33 });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
