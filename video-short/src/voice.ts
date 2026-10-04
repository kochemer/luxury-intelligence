/**
 * Narration: one TTS clip per scene, so scene timing comes straight from clip
 * durations (no forced alignment needed). Leading/trailing silence is trimmed
 * and a fixed beat inserted between scenes, which gives the hard-cut rhythm.
 *
 * Uses OpenAI gpt-4o-mini-tts because it takes a delivery instruction. The
 * ElevenLabs key in .env.local is an API key *ID*, not a key, so that path
 * currently fails (the podcast silently falls back to tts-1 for the same reason).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import OpenAI from 'openai';
import { Budget, TTS_USD_PER_MINUTE } from './budget';
import type { Scene } from './script';

export const TTS_MODEL = 'gpt-4o-mini-tts';
export const TTS_VOICE = process.env.VIDEO_SHORT_VOICE ?? 'ash';
const INSTRUCTIONS =
  'Dry, deadpan tech-news delivery. Fast and crisp, about 180 words per minute. ' +
  'Confident, slightly sardonic, unimpressed by hype. Land punchlines flat with a tiny pause before them. ' +
  'No radio-announcer warmth, no sing-song, no exaggerated excitement.';

/** Silence after each scene. Short, so it reads as a cut, not a pause. */
const GAP_S = 0.12;
/** Story narration target (outro excluded): ~55s + ~4s outro = about a minute. */
const TARGET_STORY_S = 55;
/** Beyond ~1.3x, atempo starts to sound processed. Past that, the script is too long. */
const MAX_TEMPO = 1.3;

export interface TimedScene extends Scene {
  start: number;
  end: number;
  words: { text: string; start: number; end: number }[];
}

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))));
  });
}

async function duration(file: string) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.trim());
}

/** Word timings within a clip, weighted by length; punctuation earns a little extra time. */
function spreadWords(text: string, start: number, dur: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = (w: string) => w.length + 2 + (/[.,!?;:]$/.test(w) ? 3 : 0);
  const total = words.reduce((s, w) => s + weight(w), 0);
  let t = start;
  return words.map(w => {
    const d = (weight(w) / total) * dur;
    const r = { text: w, start: t, end: t + d };
    t += d;
    return r;
  });
}

export async function buildVoice(scenes: Scene[], budget: Budget, outDir: string): Promise<{ timed: TimedScene[]; audio: string; total: number }> {
  const clipDir = path.join(outDir, 'voice');
  await fs.mkdir(clipDir, { recursive: true });

  const words = scenes.reduce((s, sc) => s + sc.vo.split(/\s+/).length, 0);
  // Worst case: speech twice as slow as planned.
  const worstCase = ((words / 150) * 2) * TTS_USD_PER_MINUTE;

  const clips = await budget.spend('tts', TTS_MODEL, worstCase, async () => {
    const openai = new OpenAI();
    const files: string[] = [];
    const fresh = new Set<string>();
    for (let i = 0; i < scenes.length; i += 4) {
      await Promise.all(scenes.slice(i, i + 4).map(async (sc, j) => {
        const idx = i + j;
        // Keyed by content, so an edited line is re-voiced and an unchanged one is free.
        const key = crypto.createHash('sha256').update(`${TTS_MODEL}|${TTS_VOICE}|${INSTRUCTIONS}|${sc.vo}`).digest('hex').slice(0, 12);
        const raw = path.join(clipDir, `raw-${key}.wav`);
        try { await fs.access(raw); } catch {
          const res = await openai.audio.speech.create({
            model: TTS_MODEL, voice: TTS_VOICE, input: sc.vo, instructions: INSTRUCTIONS, response_format: 'wav',
          });
          await fs.writeFile(raw, Buffer.from(await res.arrayBuffer()));
          fresh.add(raw);
        }
        files[idx] = raw;
      }));
    }
    // Only clips generated in this run cost money; cached ones were paid for before.
    let seconds = 0;
    for (const f of fresh) seconds += await duration(f);
    return { result: files, actualUsd: (seconds / 60) * TTS_USD_PER_MINUTE, detail: { seconds, generated: fresh.size, cached: files.length - fresh.size, voice: TTS_VOICE } };
  });

  // Pass 1: trim both ends and squeeze pauses inside the clip down to ~0.1s.
  // gpt-4o-mini-tts ignores pace instructions and pauses at every full stop,
  // which put the first W39 render at ~105 wpm.
  const squeezed: string[] = [];
  for (const [i, raw] of clips.entries()) {
    const out = path.join(clipDir, `trim-${String(i).padStart(2, '0')}.wav`);
    await run('ffmpeg', ['-y', '-i', raw, '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.15:stop_threshold=-45dB:stop_silence=0.1,' +
      'areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
      '-ar', '48000', '-ac', '1', out]);
    squeezed.push(out);
  }

  // Pass 2: one tempo for the whole video (pitch-preserving), so the story
  // fits TARGET_STORY_S. The outro is the last clip and is excluded from the sum.
  let storyS = 0;
  for (const f of squeezed.slice(0, -1)) storyS += (await duration(f)) + GAP_S;
  const tempo = Math.min(MAX_TEMPO, Math.max(1, storyS / TARGET_STORY_S));
  console.log(`[voice] story speech ${storyS.toFixed(1)}s -> tempo x${tempo.toFixed(2)}`);
  const trimmed: string[] = [];
  for (const [i, f] of squeezed.entries()) {
    const out = path.join(clipDir, `scene-${String(i).padStart(2, '0')}.wav`);
    await run('ffmpeg', ['-y', '-i', f, '-af', `atempo=${tempo.toFixed(4)},apad=pad_dur=${GAP_S}`, '-ar', '48000', '-ac', '1', out]);
    trimmed.push(out);
  }

  const timed: TimedScene[] = [];
  let t = 0;
  for (const [i, f] of trimmed.entries()) {
    const d = await duration(f);
    const speech = Math.max(0.3, d - GAP_S);
    timed.push({ ...scenes[i], start: t, end: t + d, words: spreadWords(scenes[i].vo, t, speech) });
    t += d;
  }

  const list = path.join(clipDir, 'concat.txt');
  await fs.writeFile(list, trimmed.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
  const audio = path.join(outDir, 'voice.wav');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', audio]);
  return { timed, audio, total: t };
}
