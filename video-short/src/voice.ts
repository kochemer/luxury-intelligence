/**
 * Narration: one TTS clip per scene, so scene timing comes straight from clip
 * durations (no forced alignment needed). Leading/trailing silence is trimmed
 * and a short breath inserted between scenes. Pauses inside a clip are kept.
 *
 * OpenAI gpt-4o-mini-tts: cheap, and it takes a delivery instruction.
 * (The project is moving away from ElevenLabs.)
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
  'Dry, deadpan news delivery at a normal conversational pace. Keep short natural pauses between sentences. ' +
  'Confident, slightly sardonic, unimpressed by hype. Land punchlines flat. ' +
  'No radio-announcer warmth, no sing-song, no exaggerated excitement.';

/** Silence after each scene: a breath before the next cut. */
const GAP_S = 0.4;
/**
 * Speed relative to NORMAL speech (owner set 1.2x on 2026-10-05).
 *
 * Applying atempo=1.2 to whatever the TTS returns isn't enough: told to be
 * "calm", gpt-4o-mini-tts read at ~115 wpm, so 1.2x of that came out at
 * ~140 wpm and sounded like 1x (owner, 2026-10-06). So the voice's actual
 * pace is measured each run and atempo is set to land the story at
 * TEMPO x NORMAL_WPM, pauses included.
 */
export const TEMPO = Number(process.env.VIDEO_SHORT_TEMPO ?? 1.2);
/** Typical conversational/news narration pace, pauses included. */
const NORMAL_WPM = 150;
/** atempo far beyond this starts to sound processed. */
const MAX_ATEMPO = 1.6;

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

export async function buildVoice(scenes: Scene[], budget: Budget, outDir: string): Promise<{ timed: TimedScene[]; audio: string; total: number; pace: { rawWpm: number; atempo: number; finalWpm: number } }> {
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

  // Pass 1: trim silence at the clip's ends. Story scenes keep the voice's own
  // inner pauses; the fixed intro/outro are bookends and get them squeezed.
  const cut: string[] = [];
  for (const [i, raw] of clips.entries()) {
    const out = path.join(clipDir, `trim-${String(i).padStart(2, '0')}.wav`);
    const bookend = ['intro', 'outro'].includes(scenes[i].visual.kind);
    const head = bookend
      ? 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.15:stop_threshold=-40dB:stop_silence=0.12'
      : 'silenceremove=start_periods=1:start_threshold=-45dB';
    await run('ffmpeg', ['-y', '-i', raw, '-af',
      `${head},areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse`,
      '-ar', '48000', '-ac', '1', out]);
    cut.push(out);
  }

  // Measure the voice's real pace over the story scenes, then pick one atempo
  // so the story lands at TEMPO x normal speech.
  let storyWords = 0, storyS = 0;
  for (const [i, f] of cut.entries()) {
    if (['intro', 'outro'].includes(scenes[i].visual.kind)) continue;
    storyWords += scenes[i].vo.split(/\s+/).filter(Boolean).length;
    storyS += await duration(f);
  }
  const rawWpm = storyWords / (storyS / 60);
  const atempo = Math.min(MAX_ATEMPO, Math.max(1, (TEMPO * NORMAL_WPM) / rawWpm));
  const finalWpm = rawWpm * atempo;
  console.log(`[voice] raw pace ${rawWpm.toFixed(0)} wpm -> atempo x${atempo.toFixed(2)} -> ${finalWpm.toFixed(0)} wpm (target ${(TEMPO * NORMAL_WPM).toFixed(0)}, i.e. ${TEMPO}x normal)`);

  // Pass 2: speed (pitch kept) and the breath between scenes.
  const trimmed: string[] = [];
  for (const [i, f] of cut.entries()) {
    const out = path.join(clipDir, `scene-${String(i).padStart(2, '0')}.wav`);
    await run('ffmpeg', ['-y', '-i', f, '-af', `atempo=${atempo.toFixed(4)},apad=pad_dur=${GAP_S}`, '-ar', '48000', '-ac', '1', out]);
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
  return { timed, audio, total: t, pace: { rawWpm: Math.round(rawWpm), atempo: Number(atempo.toFixed(3)), finalWpm: Math.round(finalWpm) } };
}
