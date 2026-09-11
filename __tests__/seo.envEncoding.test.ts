/**
 * Round-trip tests for .env encoding detection.
 *
 * These matter because scripts/setupGscCredentials.ts --write rewrites
 * .env.local in place. Getting the encoding wrong there would corrupt every
 * variable in the file — DB, Stripe, OpenAI — not just the ones being added.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectEnvEncoding, decodeEnvBuffer, encodeEnvContent, type EnvEncoding } from '../lib/env';

const SAMPLE = 'FOO=bar\nGSC_PRIVATE_KEY_B64=abc123==\nBAZ=qux\n';

const ENCODINGS: EnvEncoding[] = ['utf8', 'utf16le', 'utf16le-bom', 'utf16be-bom'];

for (const encoding of ENCODINGS) {
  test(`${encoding}: encode → detect → decode round-trips losslessly`, () => {
    const buffer = encodeEnvContent(SAMPLE, encoding);
    const detected = detectEnvEncoding(buffer);
    assert.equal(detected, encoding, `encoding should be detected as ${encoding}`);
    assert.equal(decodeEnvBuffer(buffer), SAMPLE, 'content should survive the round trip');
  });
}

test('real .env.local (if present) decodes to parseable KEY=value lines', () => {
  // Guards against a corrupted file: if this project's own .env.local ever
  // fails to decode into recognisable lines, every script would break.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    console.log('Skipping: no .env.local present');
    return;
  }

  const buffer = fs.readFileSync(envPath);
  const content = decodeEnvBuffer(buffer);
  const keyLines = content.split(/\r?\n/).filter(l => /^[A-Z_][A-Z0-9_]*=/.test(l.trim()));

  assert(keyLines.length > 0, '.env.local should decode into at least one KEY=value line');
});
