/**
 * Emails the owner when posts were dropped or failed, or the Buffer key is
 * about to expire. Reuses the SEO system's sender (seo/shared/email.ts), which
 * reports honestly whether Resend accepted the message, and its recipient
 * (SEO_ALERT_EMAIL).
 */

import { deliverEmail, getEmailConfig } from '../seo/shared/email';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function notifyOwner(subject: string, lines: string[]): Promise<void> {
  const cfg = getEmailConfig();
  if (!cfg.ok) {
    console.warn(`[Social] not emailed (${cfg.message}): ${subject}`);
    return;
  }
  const footer = 'Plan and posts: data/weeks/{week}/social.json. How it works: docs/distribution.md.';
  const result = await deliverEmail(
    {
      subject: `[Luxury Intelligence] ${subject}`,
      text: [subject, '', ...lines.map((l) => `- ${l}`), '', footer].join('\n'),
      html: `<p>${escapeHtml(subject)}</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul><p style="color:#666">${escapeHtml(footer)}</p>`,
    },
    cfg.config
  );
  if (!result.delivered) console.warn(`[Social] owner email failed: ${result.error}`);
}
