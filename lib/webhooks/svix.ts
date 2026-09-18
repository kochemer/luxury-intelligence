/**
 * Svix webhook signature verification (used by Resend, among others).
 *
 * Signed content is "{svix-id}.{svix-timestamp}.{body}", HMAC-SHA256 with the
 * base64 key that follows "whsec_". The signature header may carry several
 * space-separated "v1,<base64>" entries (key rotation); any match passes.
 * Lives outside the route file because Next only permits HTTP handlers to be
 * exported from a route module, and this needs to be unit-tested.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(args: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
}): { ok: true } | { ok: false; reason: string } {
  const { secret, id, timestamp, signature, body } = args;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing svix headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return { ok: false, reason: 'timestamp outside tolerance' };

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();

  // Header carries one or more "v1,<base64>" entries separated by spaces.
  for (const entry of signature.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    const provided = Buffer.from(sig, 'base64');
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return { ok: true };
  }
  return { ok: false, reason: 'no matching signature' };
}
