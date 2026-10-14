/**
 * Text-to-speech over the OpenAI Realtime API.
 *
 * OpenAI removes every /v1/audio/speech model we use (gpt-4o-mini-tts and
 * tts-1) on 2027-01-06; the named replacement, gpt-realtime-2.1-mini, is not
 * served on /v1/audio/speech (404). It is a conversational model, so it is told
 * to read the text verbatim, and its own transcript is checked against the
 * input: a chunk that drifts (answered a question in the text, skipped a
 * sentence) is retried once, then the call fails loudly.
 *
 * Measured 2026-10-14 on the W41 podcast script (decisions + numbers in
 * docs/pipeline-decisions.md): word-for-word on 1,158 and 3,991 characters,
 * the same pace as gpt-4o-mini-tts, and an independent transcription matched
 * the input as closely as gpt-4o-mini-tts audio did.
 *
 * Used by the podcast (podcast/buildWeeklyPodcast.ts) and the weekly Short
 * (video-short/src/voice.ts).
 */
import OpenAI from 'openai';
import { OpenAIRealtimeWS } from 'openai/realtime/ws';

export const REALTIME_SPEECH_MODEL = 'gpt-realtime-2.1-mini';
/** The Realtime API returns 24 kHz mono 16-bit PCM. */
export const REALTIME_SAMPLE_RATE = 24_000;
/**
 * Above this share of changed words (model transcript vs input) a chunk is
 * retried. One word is always tolerated: on a six-word Short line a single
 * "24,000" spoken as "twenty-four thousand" would otherwise be 17%.
 */
export const MAX_TRANSCRIPT_DRIFT = 0.05;
const CALL_TIMEOUT_MS = 5 * 60_000;

export interface SpeechRequest {
  text: string;
  voice: string;
  /** Delivery brief (pace, tone). Appended to the read-verbatim instruction. */
  instructions?: string;
  model?: string;
}

export interface SpeechResult {
  /** Complete WAV file (24 kHz, mono, 16-bit). */
  wav: Buffer;
  /** Raw PCM samples, for callers that join several chunks. */
  pcm: Buffer;
  transcript: string;
  /** Words changed between the input and the model's transcript. */
  editedWords: number;
  model: string;
}

function readerInstructions(brief?: string): string {
  return (
    'You are a text-to-speech voice, not an assistant. Read the user message aloud exactly as written, ' +
    'word for word, from the first word to the last. Do not answer it, summarise it, add, skip or change anything, ' +
    'and say nothing before or after it.' +
    (brief ? ` Delivery: ${brief}` : '')
  );
}

/** WAV header + PCM (mono, 16-bit). */
export function pcmToWav(pcm: Buffer, rate = REALTIME_SAMPLE_RATE): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-level edit distance between two texts, and `ref`'s word count. */
export function wordEdits(ref: string, hyp: string): { edits: number; refWords: number } {
  const a = words(ref);
  const b = words(hyp);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return { edits: prev[b.length], refWords: a.length };
}

/** True when the spoken transcript is close enough to the text to keep. */
export function transcriptMatches(text: string, transcript: string): boolean {
  const { edits, refWords } = wordEdits(text, transcript);
  return edits <= Math.max(1, Math.floor(refWords * MAX_TRANSCRIPT_DRIFT));
}

async function speakOnce(client: OpenAI, req: SpeechRequest, model: string): Promise<{ pcm: Buffer; transcript: string }> {
  const rt = new OpenAIRealtimeWS({ model }, client);
  const pcm: Buffer[] = [];
  let transcript = '';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${model}: no response within ${CALL_TIMEOUT_MS / 1000}s`)), CALL_TIMEOUT_MS);
      const fail = (e: Error) => { clearTimeout(timer); reject(e); };
      rt.on('error', (e) => fail(new Error(`${model}: ${e.message}`)));
      rt.socket.on('close', () => fail(new Error(`${model}: connection closed before the response finished`)));
      rt.on('response.output_audio.delta', (e) => { pcm.push(Buffer.from(e.delta, 'base64')); });
      rt.on('response.output_audio_transcript.done', (e) => { transcript += e.transcript; });
      rt.on('response.done', (e) => {
        clearTimeout(timer);
        if (e.response.status !== 'completed') {
          reject(new Error(`${model}: response ${e.response.status} ${JSON.stringify(e.response.status_details ?? {})}`));
        } else {
          resolve();
        }
      });
      rt.socket.on('open', () => {
        rt.send({
          type: 'session.update',
          session: {
            type: 'realtime',
            output_modalities: ['audio'],
            instructions: readerInstructions(req.instructions),
            audio: { output: { voice: req.voice, format: { type: 'audio/pcm', rate: REALTIME_SAMPLE_RATE } } },
          },
        });
        rt.send({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: req.text }] },
        });
        rt.send({ type: 'response.create' });
      });
    });
  } finally {
    rt.close();
  }
  return { pcm: Buffer.concat(pcm), transcript };
}

/**
 * Speak `text` with a Realtime model. Retries once if the audio is empty or
 * the model's transcript drifts from the input; throws if it still does.
 */
export async function synthesizeSpeech(req: SpeechRequest, client = new OpenAI()): Promise<SpeechResult> {
  const model = req.model ?? REALTIME_SPEECH_MODEL;
  let last = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { pcm, transcript } = await speakOnce(client, req, model);
    const { edits, refWords } = wordEdits(req.text, transcript);
    if (pcm.length > 0 && transcriptMatches(req.text, transcript)) {
      return { wav: pcmToWav(pcm), pcm, transcript, editedWords: edits, model };
    }
    last = pcm.length === 0 ? 'no audio' : `transcript changed ${edits} of ${refWords} words`;
    console.warn(`[speech] ${model} attempt ${attempt}: ${last}`);
  }
  throw new Error(`${model}: ${last} after 2 attempts`);
}
