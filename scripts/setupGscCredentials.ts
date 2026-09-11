/**
 * Turns a Google service-account JSON key into the .env.local lines the SEO
 * agent needs.
 *
 * The private key in that file is a multi-line PEM block. Pasting it into
 * .env.local by hand is the single most error-prone step of the Search Console
 * setup — especially here, where .env.local is UTF-16 and dotenv's parser
 * handles embedded newlines poorly. So we base64-encode it instead, which
 * makes it a single safe line, and the GSC client decodes it at load time.
 *
 * Usage:
 *   npx tsx scripts/setupGscCredentials.ts ~/Downloads/my-project-abc123.json
 *
 * Prints the env lines to stdout. It never writes to .env.local itself and
 * never prints the private key in plaintext.
 */

import { promises as fs } from 'fs';
import path from 'path';

interface ServiceAccountKey {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

async function main() {
  const keyPath = process.argv[2];
  if (!keyPath) {
    console.error('Usage: npx tsx scripts/setupGscCredentials.ts <path-to-service-account.json>');
    process.exit(1);
  }

  const resolved = path.resolve(keyPath);
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(await fs.readFile(resolved, 'utf-8')) as ServiceAccountKey;
  } catch (err) {
    console.error(`✗ Could not read or parse ${resolved}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (key.type !== 'service_account') {
    console.error(`✗ ${resolved} is not a service-account key (type: ${key.type ?? 'missing'}).`);
    console.error('  Download it from Google Cloud → IAM & Admin → Service Accounts → Keys → Add key → JSON.');
    process.exit(1);
  }
  if (!key.client_email || !key.private_key) {
    console.error('✗ Key file is missing client_email or private_key.');
    process.exit(1);
  }
  if (!key.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
    console.error('✗ private_key does not look like a PEM block.');
    process.exit(1);
  }

  const b64 = Buffer.from(key.private_key, 'utf-8').toString('base64');

  console.log('');
  console.log('✓ Service-account key looks valid.');
  console.log(`  Project:       ${key.project_id ?? '(unknown)'}`);
  console.log(`  Service email: ${key.client_email}`);
  console.log('');
  console.log('─'.repeat(72));
  console.log('STEP 1 — Grant this service account access in Search Console:');
  console.log('');
  console.log('  https://search.google.com/search-console  →  your property');
  console.log('  →  Settings  →  Users and permissions  →  Add user');
  console.log('');
  console.log(`  Email:      ${key.client_email}`);
  console.log('  Permission: Full');
  console.log('');
  console.log('─'.repeat(72));
  console.log('STEP 2 — Add these lines to .env.local:');
  console.log('');
  console.log(`GSC_CLIENT_EMAIL=${key.client_email}`);
  console.log(`GSC_PRIVATE_KEY_B64=${b64}`);
  console.log('GSC_SITE_URL=sc-domain:luxury-intel.com');
  console.log('');
  console.log('  ⚠ If your Search Console property is a URL-prefix property rather');
  console.log('    than a Domain property, use this instead (trailing slash matters):');
  console.log('    GSC_SITE_URL=https://luxury-intel.com/');
  console.log('');
  console.log('─'.repeat(72));
  console.log('STEP 3 — Add the same three as GitHub repo secrets (for later, when');
  console.log('  the agent runs in CI):  Settings → Secrets and variables → Actions');
  console.log('');
  console.log('Then tell Claude it is done, and the Stage 3 work can be verified.');
  console.log('');
  console.log('⚠ Delete the downloaded JSON key file when finished — it is a credential:');
  console.log(`    rm "${resolved}"`);
  console.log('');
}

main().catch((err) => {
  console.error('[GSC Setup] ✗ Failed:', err);
  process.exit(1);
});
