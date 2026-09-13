/**
 * Alert delivery for the daily monitor, via the site's existing Resend account.
 *
 * Sending is opt-in (SEO_ALERT_EMAIL must be set) and failure to send is
 * logged rather than thrown: a mail outage must not make the monitor itself
 * look like a site failure.
 */

import { Resend } from 'resend';
import type { MonitorResult } from './runMonitor';
import type { Finding } from '../types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderProblem(f: Finding): string {
  return `
    <li style="margin-bottom:14px">
      <strong style="color:#B91C1C">[${escapeHtml(f.severity.toUpperCase())}]</strong>
      ${escapeHtml(f.title)}<br>
      ${f.url ? `<a href="${escapeHtml(f.url)}" style="color:#1B2A4A">${escapeHtml(f.url)}</a><br>` : ''}
      <span style="color:#6B7280;font-size:13px">${escapeHtml(f.detail)}</span><br>
      <span style="color:#8B6914;font-size:13px">→ ${escapeHtml(f.recommendation)}</span>
    </li>`;
}

export function renderAlertHtml(result: MonitorResult): string {
  const recovered = result.resolvedProblems.length > 0
    ? `<p style="color:#047857">✓ Recovered since last check: ${result.resolvedProblems.length} issue(s).</p>`
    : '';

  const problems = result.newProblems.length > 0
    ? `<h3 style="color:#B91C1C">New problems (${result.newProblems.length})</h3>
       <ul style="padding-left:18px">${result.newProblems.map(renderProblem).join('')}</ul>`
    : '';

  const ongoing = result.problems.length - result.newProblems.length;
  const ongoingNote = ongoing > 0
    ? `<p style="color:#6B7280;font-size:13px">${ongoing} previously-reported problem(s) still open.</p>`
    : '';

  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#FAF9F6;color:#1A1A1A">
    <h2 style="font-family:Georgia,serif;margin:0 0 4px">Luxury Intelligence — SEO Monitor</h2>
    <p style="color:#6B7280;margin:0 0 20px;font-size:13px">
      ${escapeHtml(result.siteUrl)} · ${escapeHtml(result.checkedAtISO.slice(0, 16).replace('T', ' '))} UTC
    </p>
    ${problems}
    ${ongoingNote}
    ${recovered}
    ${result.trafficNote ? `<p style="color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB;padding-top:12px">Search Console: ${escapeHtml(result.trafficNote)}</p>` : ''}
    <p style="color:#9CA3AF;font-size:12px;border-top:1px solid #E5E7EB;padding-top:12px;margin-top:20px">
      Sent because something changed. Healthy days are silent.
    </p>
  </div>`;
}

export function renderAlertText(result: MonitorResult): string {
  const lines = [
    `Luxury Intelligence — SEO Monitor`,
    `${result.siteUrl} · ${result.checkedAtISO}`,
    '',
  ];

  if (result.newProblems.length > 0) {
    lines.push(`NEW PROBLEMS (${result.newProblems.length}):`, '');
    for (const f of result.newProblems) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.title}`);
      if (f.url) lines.push(`  ${f.url}`);
      lines.push(`  ${f.detail}`, `  -> ${f.recommendation}`, '');
    }
  }

  if (result.resolvedProblems.length > 0) {
    lines.push(`Recovered since last check: ${result.resolvedProblems.length}`, '');
  }
  if (result.trafficNote) lines.push(`Search Console: ${result.trafficNote}`);

  return lines.join('\n');
}

/** The minimal shape of an email send, so delivery can be tested without the network. */
export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResponse {
  data?: { id?: string } | null;
  error?: { message?: string } | null;
}

export type EmailSender = (email: OutgoingEmail) => Promise<SendResponse>;

function resendSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);
  return (email) => resend.emails.send(email) as Promise<SendResponse>;
}

/**
 * `send` is injectable so tests can exercise the real response handling
 * offline. It exists because the first attempt at testing this patched
 * Resend's prototype — and Resend assigns `emails` in its constructor, so the
 * patch made construction throw and three of four tests passed purely because
 * the catch block returned false. Tests that pass for the wrong reason are
 * worse than none.
 */
export async function sendAlert(result: MonitorResult, send?: EmailSender): Promise<boolean> {
  const to = process.env.SEO_ALERT_EMAIL?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!to) {
    console.log('[Monitor] ⓘ SEO_ALERT_EMAIL not set — alert not emailed.');
    return false;
  }
  if (!from || !apiKey) {
    console.warn('[Monitor] ⚠ RESEND_API_KEY or EMAIL_FROM missing — cannot email alert.');
    return false;
  }

  const recovered = result.newProblems.length === 0 && result.resolvedProblems.length > 0;
  const subject = recovered
    ? `✓ Recovered — luxury-intel.com SEO monitor`
    : `⚠ ${result.newProblems.length} new SEO problem(s) — luxury-intel.com`;

  try {
    const deliver = send ?? resendSender(apiKey);
    const response = await deliver({
      from,
      to,
      subject,
      html: renderAlertHtml(result),
      text: renderAlertText(result),
    });

    // Resend v4 does NOT throw when it rejects an email — an unverified sender
    // domain, a bad recipient, an invalid key, a rate limit all come back as
    // `{ error }` on a resolved promise. An earlier version of this function
    // awaited the call, ignored the result, and logged "✓ Alert emailed"
    // regardless. That is the worst failure an alerting system can have: on
    // the day something breaks, it reports that it told you, and didn't.
    // scripts/sendWeeklyEmailDigest.ts already handled this correctly.
    if (response.error) {
      const message = response.error.message || JSON.stringify(response.error);
      console.error(`[Monitor] ✗ Resend rejected the alert: ${message}`);
      return false;
    }
    if (!response.data?.id) {
      console.error('[Monitor] ✗ Resend returned no message id — treating the alert as unsent.');
      return false;
    }

    console.log(`[Monitor] ✓ Alert emailed to ${to} (Resend id ${response.data.id})`);
    return true;
  } catch (err) {
    // Never rethrow: a mail failure is not a site failure.
    console.error('[Monitor] ✗ Failed to send alert:', err instanceof Error ? err.message : err);
    return false;
  }
}
