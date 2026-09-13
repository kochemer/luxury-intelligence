/**
 * Daily alert email — sent only when the monitor finds a new problem, or when
 * a previously-reported one clears.
 *
 * Healthy days are silent on purpose: an alert channel that also sends "all
 * fine" gets filtered, and is then worthless on the day it matters. The weekly
 * summary (seo/report/weeklyEmail.ts) is the always-sends email; this is the
 * interruption.
 *
 * Delivery and its error handling live in seo/shared/email.ts.
 */

import { escapeHtml } from '@/lib/digest/renderEmailDigestHtml';
import { deliverEmail, getEmailConfig, type EmailSender } from '../shared/email';
import type { MonitorResult } from './runMonitor';
import type { Finding } from '../types';

export type { EmailSender, OutgoingEmail, SendResponse } from '../shared/email';

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
      Sent because something changed. Healthy days are silent — the weekly summary arrives on Sundays.
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

/**
 * Send the daily alert. Returns true only when Resend accepted the message.
 *
 * `send` is injectable for tests. The first attempt at testing this patched
 * Resend's prototype; Resend assigns `emails` in its constructor, so the patch
 * made construction throw and three of four tests passed purely because the
 * catch returned false.
 */
export async function sendAlert(result: MonitorResult, send?: EmailSender): Promise<boolean> {
  const config = getEmailConfig();
  if (!config.ok) {
    if (config.reason === 'no-recipient') console.log(`[Monitor] ⓘ ${config.message}`);
    else console.warn(`[Monitor] ⚠ ${config.message}`);
    return false;
  }

  const recovered = result.newProblems.length === 0 && result.resolvedProblems.length > 0;
  const subject = recovered
    ? `✓ Recovered — luxury-intel.com SEO monitor`
    : `⚠ ${result.newProblems.length} new SEO problem(s) — luxury-intel.com`;

  const outcome = await deliverEmail(
    { subject, html: renderAlertHtml(result), text: renderAlertText(result) },
    config.config,
    send
  );

  if (!outcome.delivered) {
    console.error(`[Monitor] ✗ Alert not delivered: ${outcome.error}`);
    return false;
  }

  console.log(`[Monitor] ✓ Alert emailed to ${config.config.to} (Resend id ${outcome.id})`);
  return true;
}
