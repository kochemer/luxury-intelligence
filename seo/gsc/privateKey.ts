/**
 * Kept apart from client.ts so code that must stay small (the /analytics page
 * on Vercel) can use it without pulling in the whole googleapis package.
 */

/**
 * Normalise a service-account private key into a usable PEM block.
 *
 * This is where GSC integrations usually die on Windows + CI, because the key
 * arrives in one of several mangled forms depending on how it was stored:
 * base64-wrapped, quote-wrapped, with literal "\n" instead of newlines, or
 * with CRLF line endings. Handle all of them rather than guessing.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  // Strip wrapping quotes (a common .env / PowerShell artefact).
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  // Base64 form (what scripts/setupGscCredentials.ts writes) — decode it.
  if (!key.includes('BEGIN')) {
    try {
      key = Buffer.from(key, 'base64').toString('utf-8');
    } catch {
      // Not base64; fall through and let the PEM check below report it.
    }
  }

  key = key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error(
      'GSC private key is not a valid PEM block after normalisation. ' +
      'Re-run: npm run seo:setup-gsc -- <path-to-key.json> --write'
    );
  }

  return key.endsWith('\n') ? key : `${key}\n`;
}
