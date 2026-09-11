/**
 * Google Search Console API client.
 *
 * Credentials are optional by design: when they're absent the client returns
 * null and the audit carries on without search data. The SEO agent runs inside
 * the weekly pipeline, and missing GSC credentials must never be able to break
 * a digest build.
 */

import { google, type searchconsole_v1 } from 'googleapis';

export interface GscClient {
  api: searchconsole_v1.Searchconsole;
  siteUrl: string;
}

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

/**
 * Build an authenticated Search Console client, or null when credentials are
 * absent. Never throws for missing config — only for malformed config, which
 * is a real error worth surfacing.
 */
const SCOPE_READ = 'https://www.googleapis.com/auth/webmasters.readonly';
const SCOPE_WRITE = 'https://www.googleapis.com/auth/webmasters';

function buildClient(scopes: string[]): GscClient | null {
  const email = process.env.GSC_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GSC_PRIVATE_KEY_B64?.trim() || process.env.GSC_PRIVATE_KEY?.trim();
  const siteUrl = process.env.GSC_SITE_URL?.trim() || 'sc-domain:luxury-intel.com';

  if (!email || !rawKey) {
    console.warn('[SEO/GSC] ⚠ Credentials absent — skipping Search Console data.');
    return null;
  }

  const auth = new google.auth.JWT({ email, key: normalizePrivateKey(rawKey), scopes });
  return { api: google.searchconsole({ version: 'v1', auth }), siteUrl };
}

/** Read-only client — used by every audit and report path. */
export function getGscClient(): GscClient | null {
  return buildClient([SCOPE_READ]);
}

/**
 * Write-capable client, kept separate so read paths cannot mutate anything by
 * accident. The write scope also permits sitemap *deletion*, which nothing in
 * this codebase does — least privilege is why this is a distinct function
 * rather than a wider default scope.
 */
export function getGscWriteClient(): GscClient | null {
  return buildClient([SCOPE_WRITE]);
}

/**
 * Confirm the credentials work and the service account can actually see the
 * property. A valid key that hasn't been granted access in Search Console
 * looks identical to a broken one until you try to list sites.
 */
export async function verifyGscAccess(client: GscClient): Promise<{ ok: boolean; message: string; availableSites?: string[] }> {
  try {
    const res = await client.api.sites.list();
    const sites = (res.data.siteEntry ?? [])
      .map(s => s.siteUrl)
      .filter((s): s is string => typeof s === 'string');

    if (sites.length === 0) {
      return {
        ok: false,
        message:
          'Authenticated, but the service account has access to no properties. ' +
          'Add it in Search Console → Settings → Users and permissions.',
      };
    }

    if (!sites.includes(client.siteUrl)) {
      return {
        ok: false,
        availableSites: sites,
        message:
          `Authenticated, but GSC_SITE_URL="${client.siteUrl}" is not among the ` +
          `properties this account can see. Available: ${sites.join(', ')}. ` +
          'Domain properties look like "sc-domain:example.com"; URL-prefix ones ' +
          'like "https://example.com/" (trailing slash matters).',
      };
    }

    return { ok: true, message: `Connected to ${client.siteUrl}`, availableSites: sites };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Search Console API call failed: ${message}` };
  }
}
