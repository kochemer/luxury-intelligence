/**
 * Luxury Intel in 60 Seconds: build this week's short.
 *
 *   npx tsx video-short/src/run.ts [--week=2026-W39] [--previews]
 *
 * Steps: pick one story (Opus 5.5) -> scene script (Opus 5.5, grounded in the
 * article text) -> narration (gpt-4o-mini-tts) -> frame render (headless
 * Chromium) -> MP4 (ffmpeg). Every paid call is capped by Budget ($2/week).
 *
 * Output goes to data/weeks/<week>/video-short/, which is gitignored: the MP4
 * must never be committed or land in public/ (Vercel storage limits). This
 * script checks that before it finishes. Nothing is published or embedded.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from '../../lib/env';
import { Budget, WEEKLY_CAP_USD } from './budget';
import { selectStory } from './story';
import { writeScript, type Scene } from './script';
import { buildVoice, run, TEMPO } from './voice';
import { renderVideo, FORMATS, type Format } from './render';

const OUTRO: Scene = {
  vo: 'This has been Luxury Intel in 60 seconds. Full digest at luxury-intel dot com.',
  visual: { kind: 'outro', big: '', small: '', items: [], emoji: '', bars: [] },
};
/** Hold the last frame a moment after the narration ends. */
const TAIL_S = 0.8;

async function latestWeek() {
  const files = (await fs.readdir(path.join('data', 'digests'))).filter(f => /^\d{4}-W\d{2}\.json$/.test(f)).sort();
  return files[files.length - 1].replace('.json', '');
}

async function main() {
  loadEnv();
  const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
  const week = arg('week') ?? (await latestWeek());
  const outDir = path.join('data', 'weeks', week, 'video-short');
  await fs.mkdir(outDir, { recursive: true });

  const digest = JSON.parse(await fs.readFile(path.join('data', 'digests', `${week}.json`), 'utf8'));
  const end = new Date(digest.endISO);
  const month = end.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const dateLine = `This digest covers the week ending ${month} ${end.getUTCDate()}, ${end.getUTCFullYear()}.`;
  const issue = `W${week.split('-W')[1]} · ${end.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${end.getUTCFullYear()}`;

  const budget = await Budget.open(outDir, week);
  console.log(`[short] ${week}: $${budget.spentUsd.toFixed(4)} spent so far of $${WEEKLY_CAP_USD} cap`);

  const story = await selectStory(week, budget, outDir);
  const script = await writeScript(story, budget, outDir, dateLine, String(end.getUTCFullYear()));
  const scenes = [...script.scenes, OUTRO];

  const { timed, audio, total: audioTotal } = await buildVoice(scenes, budget, outDir);
  const total = audioTotal + TAIL_S;
  // The last scene (the outro) holds through the tail.
  timed[timed.length - 1].end = total;
  await fs.writeFile(path.join(outDir, 'timeline.json'), JSON.stringify({ total, issue, scenes: timed }, null, 2));
  console.log(`[short] narration ${audioTotal.toFixed(1)}s, ${timed.length} scenes`);

  // Same timeline and audio, two layouts: vertical (mobile) and horizontal (desktop).
  // Each render runs the spill check first and refuses to render if text doesn't fit.
  const outputs: Record<string, { file: string; sizeMB: number }> = {};
  for (const format of ['portrait', 'landscape'] as Format[]) {
    const out = path.join(outDir, `luxury-intel-60s-${week}-${FORMATS[format].label}.mp4`);
    await renderVideo({ scenes: timed, total, issue, format, audio, out, previewEvery: process.argv.includes('--previews') ? 90 : undefined });

    // Vercel guard: refuse to finish if the MP4 isn't gitignored.
    try {
      await run('git', ['check-ignore', '-q', out]);
    } catch {
      throw new Error(`${out} is NOT gitignored. It could be committed and deployed to Vercel. Fix .gitignore before going further.`);
    }
    outputs[FORMATS[format].label] = { file: out, sizeMB: Number(((await fs.stat(out)).size / 1e6).toFixed(1)) };
  }

  const meta = {
    week, title: script.title, story: { title: story.title, url: story.url, source: story.source },
    why: story.selection.why, angle: story.selection.angle,
    durationS: Number(total.toFixed(2)), outputs, voiceTempo: TEMPO,
    spentUsd: Number(budget.spentUsd.toFixed(4)), capUsd: WEEKLY_CAP_USD,
    published: false,
  };
  await fs.writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`[short] done\n${JSON.stringify(meta, null, 2)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
