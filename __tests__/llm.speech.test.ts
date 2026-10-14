import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcmToWav, wordEdits, transcriptMatches } from '../lib/llm/speech';

// The Realtime voice (2027-01-06 TTS replacement) is a conversational model,
// so lib/llm/speech.ts checks its transcript against the text. These pin
// what counts as "read verbatim".

test('punctuation, case, curly quotes and thousands separators are not edits', () => {
  assert.deepEqual(
    wordEdits('India’s sales hit 24,000 crore — fast.', "india's sales hit 24000 crore fast"),
    { edits: 0, refWords: 6 },
  );
});

test('a skipped sentence or an added answer fails the check', () => {
  const text = 'What does this mean for retailers? Margins matter more than volume this season. Watch the returns.';
  assert.equal(transcriptMatches(text, 'What does this mean for retailers? Watch the returns.'), false);
  assert.equal(transcriptMatches(text, `${text} Great question, here is my answer for you today.`), false);
  assert.equal(transcriptMatches(text, text), true);
});

test('one changed word is tolerated even on a short line', () => {
  assert.equal(transcriptMatches('Hermes raised prices again this year.', 'Hermes raised its prices again this year.'), true);
  assert.equal(transcriptMatches('Hermes raised prices again this year.', 'Hermes cut its prices this year.'), false);
});

test('pcmToWav writes a 24 kHz mono 16-bit header', () => {
  const wav = pcmToWav(Buffer.alloc(480));
  assert.equal(wav.length, 44 + 480);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 480);
});
