/**
 * Narration: one TTS clip per scene, so scene timing comes straight from clip
 * durations. Caption word timing comes from whisper-1 word timestamps aligned
 * to the script. Leading/trailing silence is trimmed and a short breath
 * inserted between scenes. Pauses inside a clip are kept.
 *
 * OpenAI gpt-realtime-2.1-mini over the Realtime API (lib/llm/speech.ts),
 * since 2026-10-14: cheap, and it takes a delivery instruction. It replaces
 * gpt-4o-mini-tts, which OpenAI removes on 2027-01-06; until then a clip that
 * fails falls back to it, same voice and instruction.
 */
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import OpenAI from 'openai';
import { Budget, TTS_USD_PER_MINUTE, WHISPER_USD_PER_MINUTE } from './budget';
import type { Scene } from './script';
import { REALTIME_SPEECH_MODEL, synthesizeSpeech } from '../../lib/llm/speech';

export const TTS_MODEL = REALTIME_SPEECH_MODEL;
/** Speech-endpoint fallback; removed by OpenAI on 2027-01-06, drop it then. */
export const TTS_FALLBACK_MODEL = 'gpt-4o-mini-tts';
export const TTS_VOICE = process.env.VIDEO_SHORT_VOICE ?? 'ash';
const INSTRUCTIONS =
  'Dry, deadpan news delivery at a brisk pace, like a quick tech news recap. Keep the pauses between sentences short. ' +
  'Confident, slightly sardonic, unimpressed by hype. Land punchlines flat. ' +
  'No radio-announcer warmth, no sing-song, no exaggerated excitement.';

/** Silence after each scene: a breath before the next cut. */
const GAP_S = 0.4;
/**
 * Speed relative to NORMAL speech (owner: 1.2x on 2026-10-05, 1.1x on 2026-10-26).
 *
 * Applying atempo=1.2 to whatever the TTS returns isn't enough: told to be
 * "calm", gpt-4o-mini-tts read at ~115 wpm, so 1.2x of that came out at
 * ~140 wpm and sounded like 1x (owner, 2026-10-06). So the voice's actual
 * pace is measured each run and atempo is set to land the story at
 * TEMPO x NORMAL_WPM, pauses included.
 */
export const TEMPO = Number(process.env.VIDEO_SHORT_TEMPO ?? 1.1);
/** Typical conversational/news narration pace, pauses included. */
const NORMAL_WPM = 150;
/**
 * The pace should come from the voice, not from stretching it: W43 at x1.57
 * sounded too fast and processed (owner, 2026-10-26).
 */
const MAX_ATEMPO = Number(process.env.VIDEO_SHORT_MAX_ATEMPO ?? 1.25);

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

type WordTime = { text: string; start: number; end: number };

/** Word timings within a span, weighted by length; punctuation earns a little extra time. */
function spread(words: string[], start: number, dur: number): WordTime[] {
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

function spreadWords(text: string, start: number, dur: number) {
  return spread(text.split(/\s+/).filter(Boolean), start, dur);
}

/** Captions show this much before the word is heard; a caption that trails the voice reads as lag. */
const CAPTION_LEAD_S = 0.08;
const TRANSCRIBE_MODEL = 'whisper-1';

/** whisper-1 word timestamps for a clip, in the clip's own time. */
async function transcribeWords(openai: OpenAI, file: string, script: string): Promise<{ word: string; start: number; end: number }[]> {
  const res: any = await openai.audio.transcriptions.create({
    model: TRANSCRIBE_MODEL, file: createReadStream(file), response_format: 'verbose_json',
    timestamp_granularities: ['word'], prompt: script,
  });
  return res.words ?? [];
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Put the script's words on the heard timestamps. The transcript can split,
 * merge or misspell words ("3,345" vs "3345"), so the two sequences are
 * aligned (longest common subsequence on normalized words). Matched words take
 * the heard times; runs in between are spread across their gap. Returns null
 * when too little matched to trust.
 */
function alignWords(text: string, heard: { word: string; start: number; end: number }[], dur: number): WordTime[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const a = words.map(norm), b = heard.map(h => norm(h.word));
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const match: (number | null)[] = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] && a[i] === b[j]) { match[i++] = j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  if (match.filter(x => x !== null).length < n * 0.6) return null;

  const out: WordTime[] = [];
  for (let i = 0; i < n;) {
    const j = match[i];
    if (j !== null) { out.push({ text: words[i], start: heard[j].start, end: heard[j].end }); i++; continue; }
    let k = i;
    while (k < n && match[k] === null) k++;
    const from = out.length ? out[out.length - 1].end : 0;
    const to = k < n ? heard[match[k]!].start : dur;
    out.push(...spread(words.slice(i, k), from, Math.max(0.05, to - from)));
    i = k;
  }
  return out;
}

/** One clip as WAV with `model`: Realtime models via lib/llm/speech.ts, others on the speech endpoint. */
async function speakWith(openai: OpenAI, model: string, text: string): Promise<Buffer> {
  if (model.startsWith('gpt-realtime')) {
    return (await synthesizeSpeech({ text, voice: TTS_VOICE, instructions: INSTRUCTIONS, model }, openai)).wav;
  }
  const res = await openai.audio.speech.create({
    model, voice: TTS_VOICE, input: text, instructions: INSTRUCTIONS, response_format: 'wav',
  });
  return Buffer.from(await res.arrayBuffer());
}

/** One clip as WAV: TTS_MODEL, then TTS_FALLBACK_MODEL if it fails. */
async function speakClip(openai: OpenAI, text: string): Promise<Buffer> {
  try {
    return await speakWith(openai, TTS_MODEL, text);
  } catch (error) {
    console.warn(`[voice] ${TTS_MODEL} failed (${(error as Error).message}); retrying with ${TTS_FALLBACK_MODEL}`);
    return speakWith(openai, TTS_FALLBACK_MODEL, text);
  }
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
        // A clip voiced by the fallback is cached under the same key.
        const key = crypto.createHash('sha256').update(`${TTS_MODEL}|${TTS_VOICE}|${INSTRUCTIONS}|${sc.vo}`).digest('hex').slice(0, 12);
        const raw = path.join(clipDir, `raw-${key}.wav`);
        try { await fs.access(raw); } catch {
          await fs.writeFile(raw, await speakClip(openai, sc.vo));
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

  // Caption timing from what the voice actually says, not an estimate
  // (estimated timings drifted behind the voice, owner 2026-10-26). Transcribed
  // before the speed-up, so a transcript is cached per voice clip and reused
  // whatever the atempo.
  const cutS = await Promise.all(cut.map(duration));
  const heard = await budget.spend('align', TRANSCRIBE_MODEL, ((cutS.reduce((s, d) => s + d, 0) / 60) * 2) * WHISPER_USD_PER_MINUTE, async () => {
    const openai = new OpenAI();
    let seconds = 0;
    const res = await Promise.all(cut.map(async (f, i) => {
      const cache = path.join(clipDir, `words-${path.basename(clips[i], '.wav').replace(/^raw-/, '')}.json`);
      try { return JSON.parse(await fs.readFile(cache, 'utf8')); } catch { /* transcribe */ }
      try {
        const w = await transcribeWords(openai, f, scenes[i].vo);
        seconds += cutS[i];
        await fs.writeFile(cache, JSON.stringify(w));
        return w;
      } catch (error) {
        console.warn(`[voice] scene ${i + 1}: ${TRANSCRIBE_MODEL} failed (${(error as Error).message}); estimating its captions`);
        return null;
      }
    }));
    return { result: res as ({ word: string; start: number; end: number }[] | null)[], actualUsd: (seconds / 60) * WHISPER_USD_PER_MINUTE };
  });

  const timed: TimedScene[] = [];
  let t = 0;
  for (const [i, f] of trimmed.entries()) {
    const d = await duration(f);
    const speech = Math.max(0.3, d - GAP_S);
    const aligned = heard[i] ? alignWords(scenes[i].vo, heard[i]!, cutS[i]) : null;
    if (heard[i] && !aligned) console.warn(`[voice] scene ${i + 1}: transcript didn't match the script; estimating its captions`);
    const words = aligned
      ? aligned.map(w => ({ text: w.text, start: Math.max(t, t + w.start / atempo - CAPTION_LEAD_S), end: t + w.end / atempo - CAPTION_LEAD_S }))
      : spreadWords(scenes[i].vo, t, speech);
    timed.push({ ...scenes[i], start: t, end: t + d, words });
    t += d;
  }

  const list = path.join(clipDir, 'concat.txt');
  await fs.writeFile(list, trimmed.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
  const audio = path.join(outDir, 'voice.wav');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', audio]);
  return { timed, audio, total: t, pace: { rawWpm: Math.round(rawWpm), atempo: Number(atempo.toFixed(3)), finalWpm: Math.round(finalWpm) } };
}
