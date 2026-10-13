/**
 * Send weekly email digest using Resend
 * Dry-run by default (set EMAIL_SEND_ENABLED=true to actually send)
 * Uses the unified EmailDigest format (data/weeks/{week}/email-digest.json).
 *
 * Recipient source priority:
 *   1. Neon DB (when DATABASE_URL is set) — reads eligible subscribers via
 *      getEligibleWeeklyDigestRecipients()
 *   2. data/email/recipients.json — legacy fallback for local dev / CI runs
 *      where DATABASE_URL is not available
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import { loadEnv } from '../lib/env';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { renderEmailDigestHtml, renderEmailDigestPlaintext } from '../lib/digest/renderEmailDigestHtml';
import { buildUnsubscribeUrl } from '../lib/utils/unsubscribeToken';
import { getEligibleWeeklyDigestRecipients } from '../lib/db/subscribers';
import { getSiteUrl } from '../lib/utils/siteUrl';
import { isShowable, type WeeklyShort } from '../lib/video/weeklyShort';
import type { EmailDigest, WeeklyDigest } from '../lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (.env.local in dev, GitHub env in CI)
loadEnv();

type Recipient = {
  email: string;
  name?: string;
};

// ── Recipient loading ──────────────────────────────────────────────────────────

/**
 * Load eligible recipients from the Neon database.
 * Returns an array of { email, name? } objects (name is currently unused in schema,
 * but kept for forward compatibility with the shared Recipient type).
 */
async function loadRecipientsFromDb(): Promise<Recipient[]> {
  const rows = await getEligibleWeeklyDigestRecipients();
  return rows
    .filter((r): r is typeof r & { email: string } => typeof r.email === 'string' && r.email.length > 0)
    .map(r => ({ email: r.email }));
}

/**
 * Legacy fallback: load recipients from data/email/recipients.json.
 * This file is written ephemerally by GitHub Actions from EMAIL_RECIPIENTS_JSON secret.
 */
async function loadRecipientsFromFile(): Promise<Recipient[]> {
  const recipientsPath = path.join(process.cwd(), 'data', 'email', 'recipients.json');
  try {
    const raw = await fs.readFile(recipientsPath, 'utf-8');
    const cleaned = raw.replace(/^\uFEFF/, ''); // strip BOM
    const recipients = JSON.parse(cleaned) as Recipient[];
    if (!Array.isArray(recipients)) {
      throw new Error('recipients.json must contain an array');
    }
    return recipients.filter(r => r.email && typeof r.email === 'string');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Recipients file not found: ${recipientsPath}\n` +
        `Either set DATABASE_URL to use DB-driven recipients, or create the file with:\n` +
        `[{"email": "user@example.com", "name": "Optional Name"}]`,
      );
    }
    throw new Error(`Failed to load recipients from file: ${error.message}`);
  }
}

/**
 * Load recipients — DB preferred, file fallback when DATABASE_URL is absent.
 */
async function loadRecipients(): Promise<{ recipients: Recipient[]; source: string }> {
  if (process.env.DATABASE_URL) {
    console.log('[Email] Loading recipients from database...');
    const recipients = await loadRecipientsFromDb();
    return { recipients, source: 'database' };
  }
  console.log('[Email] DATABASE_URL not set — falling back to recipients.json');
  const recipients = await loadRecipientsFromFile();
  return { recipients, source: 'file' };
}

// ── Digest loading ─────────────────────────────────────────────────────────────

async function readJson<T>(...parts: string[]): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), ...parts), 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Attach what isn't in email-digest.json: the week's Short and podcast, read
 * at send time. The Short is rendered by weekly-short.yml *after* this send, so
 * on the scheduled Monday run it is normally absent and the email links to the
 * YouTube channel instead (see renderEmailDigestHtml).
 */
async function attachWeekMedia(digest: EmailDigest): Promise<EmailDigest> {
  const week = digest.week;

  // Emails built before 2026-10-13 have no quote; take it from the web digest.
  if (!digest.weeklyQuote) {
    const web = await readJson<WeeklyDigest>('data', 'digests', `${week}.json`);
    digest.weeklyQuote = web?.oneSentenceSummary?.trim() || undefined;
  }

  // 'production' on purpose: a private upload won't play, so never link one.
  const short = await readJson<WeeklyShort>('data', 'weeks', week, 'video.json');
  if (short?.youtubeId && isShowable(short, 'production')) {
    digest.short = { youtubeId: short.youtubeId, title: short.title, durationS: short.durationS, poster: short.poster };
  }

  const podcast = await readJson<{ audioPath?: string; duration?: number }>('data', 'weeks', week, 'podcast.json');
  if (podcast?.audioPath) {
    digest.podcast = { audioPath: podcast.audioPath, durationS: podcast.duration };
  }

  return digest;
}

async function loadDigest(weekLabel: string): Promise<EmailDigest> {
  const digestPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'email-digest.json');
  try {
    const raw = await fs.readFile(digestPath, 'utf-8');
    return await attachWeekMedia(JSON.parse(raw) as EmailDigest);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Email digest not found: ${digestPath}\n` +
        `Run the weekly pipeline (including email step) for --week=${weekLabel}`,
      );
    }
    throw new Error(`Failed to load email digest: ${error.message}`);
  }
}

// ── Sending ────────────────────────────────────────────────────────────────────

const UNSUBSCRIBE_PLACEHOLDER = '%%UNSUBSCRIBE_URL%%';

/**
 * Send emails in batches of 50.
 * The `htmlTemplate` and `textTemplate` may contain the %%UNSUBSCRIBE_URL%% placeholder
 * which is replaced with a per-recipient HMAC-signed URL before sending.
 */
async function sendEmails(
  recipients: Recipient[],
  subject: string,
  htmlTemplate: string,
  textTemplate: string,
  fromEmail: string,
  resend: Resend,
  siteUrl: string,
): Promise<{ success: number; failures: Array<{ email: string; error: string }> }> {
  const BATCH_SIZE = 50;
  let success = 0;
  const failures: Array<{ email: string; error: string }> = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(recipients.length / BATCH_SIZE);
    console.log(`[Email] Sending batch ${batchNum}/${totalBatches} (${batch.length} recipients)...`);

    // Send sequentially within each batch — Resend limit is 5 req/sec.
    // 250 ms between sends = ~4/sec, safely under the limit.
    for (let j = 0; j < batch.length; j++) {
      const recipient = batch[j];
      const unsubUrl = buildUnsubscribeUrl(recipient.email, siteUrl);
      const html = htmlTemplate.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubUrl);
      const text = textTemplate.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubUrl);

      try {
        const response = await resend.emails.send({
          from: fromEmail,
          to:   recipient.email,
          subject,
          html,
          text,
        });

        if (response.error) {
          const msg = response.error.message || JSON.stringify(response.error);
          console.error(`[Email] ✗ ${recipient.email} — ${msg}`);
          failures.push({ email: recipient.email, error: msg });
        } else {
          console.log(`[Email] ✓ ${recipient.email} — id: ${response.data?.id ?? 'unknown'}`);
          success++;
        }
      } catch (err: any) {
        const msg = err.message || String(err);
        console.error(`[Email] ✗ ${recipient.email} — ${msg}`);
        failures.push({ email: recipient.email, error: msg });
      }

      // Throttle: 250 ms between sends (stay under Resend's 5 req/sec limit)
      if (j < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
  }

  return { success, failures };
}

// ── Sent summary ───────────────────────────────────────────────────────────────

async function saveSentSummary(
  weekLabel: string,
  timestamp: string,
  recipientCount: number,
  successCount: number,
  failures: Array<{ email: string; error: string }>,
): Promise<void> {
  const sentDir = path.join(process.cwd(), 'data', 'email', 'sent');
  await fs.mkdir(sentDir, { recursive: true });
  const summary = { weekLabel, timestamp, recipientCount, successCount, failureCount: failures.length, failures };
  const summaryPath = path.join(sentDir, `${weekLabel}.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`[Email] Sent summary saved: ${summaryPath}`);
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let weekLabel: string | null = null;
  for (const arg of args) {
    if (arg.startsWith('--week=')) { weekLabel = arg.split('=')[1]; break; }
  }
  if (!weekLabel) weekLabel = getCurrentDigestWeek();
  validateWeekLabel(weekLabel);

  console.log(`[Email] Preparing weekly digest email for ${weekLabel}...`);

  const digest = await loadDigest(weekLabel);

  // Load recipients (DB preferred, file fallback)
  const { recipients, source } = await loadRecipients();
  console.log(`[Email] Recipients: ${recipients.length} (source: ${source})`);

  if (recipients.length === 0) {
    console.error('[Email] No eligible recipients found. Exiting.');
    process.exit(1);
  }

  const subject = `Luxury Intelligence — Weekly Digest ${weekLabel}`;

  // Render once using the placeholder; substitution happens per-recipient in sendEmails
  const htmlTemplate = renderEmailDigestHtml(digest, {
    mode: 'email',
    unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER,
  });
  const textTemplate = renderEmailDigestPlaintext(digest, UNSUBSCRIBE_PLACEHOLDER);

  // Dry-run check
  const sendEnabled = process.env.EMAIL_SEND_ENABLED === 'true';
  if (!sendEnabled) {
    console.log('\n=== DRY RUN MODE ===');
    console.log(`Recipients : ${recipients.length} (source: ${source})`);
    console.log(`Subject    : ${subject}`);
    console.log(`HTML (first 300 chars):\n${htmlTemplate.substring(0, 300)}...`);
    console.log('\nTo send, set: EMAIL_SEND_ENABLED=true');
    console.log('Also required: RESEND_API_KEY, EMAIL_FROM, UNSUBSCRIBE_SECRET');
    process.exit(0);
  }

  // Validate required env vars
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('[Email] ❌ RESEND_API_KEY required when EMAIL_SEND_ENABLED=true');
    process.exit(1);
  }
  let fromEmail = process.env.EMAIL_FROM;
  if (!fromEmail) {
    console.error('[Email] ❌ EMAIL_FROM required when EMAIL_SEND_ENABLED=true');
    process.exit(1);
  }
  fromEmail = fromEmail.trim().replace(/^["']|["']$/g, '');
  const emailPattern = /^(.+?)\s*<([^>]+@[^>]+)>$|^([^\s<]+@[^\s>]+)$/;
  if (!emailPattern.test(fromEmail)) {
    console.error('[Email] ❌ Invalid EMAIL_FROM format — expected "email@domain" or "Name <email@domain>"');
    process.exit(1);
  }

  // Warn if UNSUBSCRIBE_SECRET is missing (unsubscribe links won't work)
  if (!process.env.UNSUBSCRIBE_SECRET) {
    console.warn('[Email] ⚠️  UNSUBSCRIBE_SECRET is not set — unsubscribe links will be broken');
  }

  const siteUrl = getSiteUrl();
  console.log(`[Email] Sending to ${recipients.length} recipients...`);
  console.log(`[Email] From: ${fromEmail}`);
  console.log(`[Email] Subject: ${subject}`);

  const resend = new Resend(resendApiKey);
  const timestamp = new Date().toISOString();
  const { success, failures } = await sendEmails(
    recipients, subject, htmlTemplate, textTemplate, fromEmail, resend, siteUrl,
  );

  console.log(`[Email] ✓ Sent: ${success}/${recipients.length}`);
  if (failures.length > 0) {
    console.error(`[Email] ✗ Failed: ${failures.length}/${recipients.length}`);
    failures.forEach(f => console.error(`  - ${f.email}: ${f.error}`));
  }

  await saveSentSummary(weekLabel, timestamp, recipients.length, success, failures);

  // Exit 1 only when no emails were sent at all. Partial failures (e.g. a single
  // bounced address) must not block the downstream commit step — the digest
  // still needs to land on the site for the recipients who did receive it.
  if (success === 0 && failures.length > 0) {
    console.error('[Email] ✗ All sends failed — exiting 1');
    process.exit(1);
  }
  if (failures.length > 0) {
    console.warn(`[Email] ⚠ Continuing despite ${failures.length} failure(s) — see sent summary`);
  } else {
    console.log('[Email] ✓ All emails sent successfully');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('[Email] Fatal error:', error);
  process.exit(1);
});
