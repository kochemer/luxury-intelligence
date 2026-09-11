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
 * Usage (run from the project root):
 *   npm run seo:setup-gsc -- "C:/path/to/key.json"            # print the lines
 *   npm run seo:setup-gsc -- "C:/path/to/key.json" --write    # write them for you
 *
 * --write is the safer option: the base64 key is ~2,300 characters, and
 * copy-pasting it by hand is easy to get wrong. It backs .env.local up first
 * and round-trips the file in its existing encoding — rewriting a UTF-16
 * .env.local as UTF-8 would corrupt every other variable in it.
 */

import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { detectEnvEncoding, decodeEnvBuffer, encodeEnvContent } from '../lib/env';

const ENV_PATH = path.join(process.cwd(), '.env.local');

/** Upsert KEY=value lines into .env.local, preserving its original encoding. */
async function writeEnvVars(vars: Record<string, string>): Promise<void> {
  let existing = '';
  let encoding = detectEnvEncoding(Buffer.alloc(0));

  try {
    const buffer = readFileSync(ENV_PATH);
    encoding = detectEnvEncoding(buffer);
    existing = decodeEnvBuffer(buffer, encoding);
    await fs.writeFile(`${ENV_PATH}.backup`, buffer);
    console.log(`  ✓ Backed up existing .env.local → .env.local.backup (${encoding})`);
  } catch {
    console.log('  ⓘ No existing .env.local — creating one.');
  }

  const lines = existing.split(/\r?\n/);
  for (const [key, value] of Object.entries(vars)) {
    const index = lines.findIndex(l => l.trimStart().startsWith(`${key}=`));
    if (index >= 0) {
      lines[index] = `${key}=${value}`;
      console.log(`  ✓ Updated ${key}`);
    } else {
      lines.push(`${key}=${value}`);
      console.log(`  ✓ Added ${key}`);
    }
  }

  const content = lines.join('\n').replace(/\n+$/, '') + '\n';
  await fs.writeFile(ENV_PATH, encodeEnvContent(content, encoding));
}

interface ServiceAccountKey {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes('--write');
  const keyPath = args.find(a => !a.startsWith('--'));

  if (!keyPath) {
    console.error('Usage (from the project root):');
    console.error('  npm run seo:setup-gsc -- "C:/path/to/service-account.json"');
    console.error('  npm run seo:setup-gsc -- "C:/path/to/service-account.json" --write');
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

  if (shouldWrite) {
    console.log('STEP 2 — Writing credentials to .env.local:');
    console.log('');
    await writeEnvVars({
      GSC_CLIENT_EMAIL: key.client_email,
      GSC_PRIVATE_KEY_B64: b64,
      GSC_SITE_URL: 'sc-domain:luxury-intel.com',
    });
    console.log('');
    console.log('  ⚠ GSC_SITE_URL was set for a *Domain* property. If Search Console');
    console.log('    → Settings shows a URL-prefix property instead, change it to:');
    console.log('    GSC_SITE_URL=https://luxury-intel.com/     (trailing slash matters)');
    console.log('');
  } else {
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
    console.log('  Tip: re-run with --write to have this done for you (safer than');
    console.log('  copy-pasting a 2,300-character key by hand).');
    console.log('');
  }

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
