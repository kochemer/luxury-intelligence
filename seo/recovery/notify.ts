/**
 * Email for recovery outcomes.
 *
 * Recovery previously reported only into a CI log, which is the one place
 * nobody looks during an incident. It matters more than the monitor's alert,
 * because a rollback changes what production serves *and* stops future pushes
 * going live — an automated action with a consequence that only a human can
 * clear.
 *
 * Healthy runs send nothing: same rule as the daily alert.
 */

import { escapeHtml } from '@/lib/digest/renderEmailDigestHtml';
import { deliverEmail, getEmailConfig, type EmailSender, type DeliveryResult } from '../shared/email';
import type { RecoveryResult } from './runRecovery';

export type RecoverySendResult = DeliveryResult & { skipped?: 'nothing-to-report' | 'no-recipient' | 'no-sender' };

/** Only outcomes a person must act on, or must know happened, are emailed. */
export function shouldNotify(result: RecoveryResult): boolean {
  return result.status !== 'healthy';
}

export function buildRecoverySubject(result: RecoveryResult): string {
  switch (result.status) {
    case 'rolled-back':
      return '⚠ Production rolled back — luxury-intel.com (deploys are paused)';
    case 'rollback-failed':
      return '✗ Site still down after rollback — luxury-intel.com';
    case 'provider-outage':
      return 'ⓘ Vercel incident — luxury-intel.com is affected';
    case 'not-authenticated':
      return '✗ Site down and recovery could not act — luxury-intel.com';
    case 'no-target':
      return '✗ Site down, nothing safe to roll back to — luxury-intel.com';
    case 'would-roll-back':
      return '⚠ Site down, rollback available but not performed — luxury-intel.com';
    default:
      return `Recovery: ${result.status} — luxury-intel.com`;
  }
}

export function buildRecoveryHtml(result: RecoveryResult): string {
  const failing = result.failedUrls.length > 0
    ? `<h3 style="font-size:15px;margin:18px 0 6px">Failing pages (${result.failedUrls.length} of ${result.sampledUrls} sampled)</h3>
       <ul style="padding-left:18px;margin:0;color:#6B7280;font-size:13px">
         ${result.failedUrls.slice(0, 8).map(u => `<li>${escapeHtml(u)}</li>`).join('')}
       </ul>`
    : '';

  // The one thing that must not be missed when it applies.
  const banner = result.status === 'rolled-back'
    ? `<p style="background:#FEF3C7;border:1px solid #F59E0B;padding:12px;margin:0 0 18px;font-weight:600">
         New deployments will not go live until you undo the rollback.
       </p>`
    : '';

  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#FAF9F6;color:#1A1A1A;line-height:1.5">
    <h2 style="font-family:Georgia,serif;margin:0 0 4px">Luxury Intelligence — Recovery</h2>
    <p style="color:#6B7280;margin:0 0 18px;font-size:13px">
      ${escapeHtml(result.checkedAtISO.slice(0, 16).replace('T', ' '))} UTC · status <strong>${escapeHtml(result.status)}</strong>
    </p>
    ${banner}
    <p>${escapeHtml(result.detail)}</p>
    ${result.rolledBackTo ? `<p style="font-size:13px;color:#6B7280">Now serving: <a href="${escapeHtml(result.rolledBackTo.url)}" style="color:#1B2A4A">${escapeHtml(result.rolledBackTo.url)}</a> (${escapeHtml(result.rolledBackTo.age)} old)</p>` : ''}
    ${failing}
    <h3 style="font-size:15px;margin:18px 0 6px">What to do</h3>
    <p style="color:#8B6914">→ ${escapeHtml(result.recommendation)}</p>
    <p style="color:#9CA3AF;font-size:12px;border-top:1px solid #E5E7EB;padding-top:12px;margin-top:24px">
      Sent by the automated recovery step. Healthy checks are silent.
    </p>
  </div>`;
}

export function buildRecoveryText(result: RecoveryResult): string {
  const lines = [
    'Luxury Intelligence — Recovery',
    `${result.checkedAtISO} · status ${result.status}`,
    '',
    result.detail,
  ];

  if (result.rolledBackTo) {
    lines.push('', `Now serving: ${result.rolledBackTo.url} (${result.rolledBackTo.age} old)`);
  }
  if (result.failedUrls.length > 0) {
    lines.push('', `Failing pages (${result.failedUrls.length}/${result.sampledUrls} sampled):`);
    for (const u of result.failedUrls.slice(0, 8)) lines.push(`  - ${u}`);
  }

  lines.push('', 'WHAT TO DO', `  ${result.recommendation}`);
  lines.push('', 'Sent by the automated recovery step. Healthy checks are silent.');
  return lines.join('\n');
}

/** Send the recovery outcome. `send` is injectable for offline tests. */
export async function sendRecoveryEmail(result: RecoveryResult, send?: EmailSender): Promise<RecoverySendResult> {
  if (!shouldNotify(result)) {
    return { delivered: false, skipped: 'nothing-to-report' };
  }

  const config = getEmailConfig();
  if (!config.ok) {
    return { delivered: false, skipped: config.reason, error: config.message };
  }

  return deliverEmail(
    {
      subject: buildRecoverySubject(result),
      html: buildRecoveryHtml(result),
      text: buildRecoveryText(result),
    },
    config.config,
    send
  );
}
