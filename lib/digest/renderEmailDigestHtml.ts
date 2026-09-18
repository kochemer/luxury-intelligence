/**
 * Shared rendering for the unified email digest (EmailDigest).
 * Used by the weekly email send script and can be used by the web page for consistency.
 */

import type { EmailDigest, EmailDigestItem } from '../types';
import { formatIssueLine } from '../utils/formatDate';
import { weekLabelToSlug } from '../utils/weekSlug';

const CANONICAL_URL = 'https://luxury-intel.com';

/**
 * Append standard email UTM parameters to an internal luxury-intel.com URL.
 * utm_campaign is set to the week label (e.g. 2026-W13) for per-issue segmentation.
 */
function withEmailUtms(url: string, week: string, content?: string): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'newsletter');
  u.searchParams.set('utm_medium', 'email');
  u.searchParams.set('utm_campaign', week);
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
}

const IMPLICATION_PATTERNS = [
  /implication/i,
  /for retailers/i,
  /for brands/i,
  /what this means/i,
  /why it matters/i,
  /takeaway/i,
  /so what/i,
  /bottom line/i,
  /how to respond/i,
  /should consider/i,
  /must adapt/i,
  /should leverage/i,
  /can leverage/i,
  /must reassess/i,
  /strategists should/i,
  /retailers should/i,
  /retailers must/i,
  /retailers can/i,
];

function normalizeBullet(b: string): string {
  let s = b.trim();
  s = s.replace(/^[-•]\s*/, '').replace(/^\d+[.)]\s*/, '');
  return s;
}

/**
 * Extract up to 3 summary bullets for display, filtering implication-style lines.
 */
export function extractSummaryBullets(item: EmailDigestItem): string[] {
  let filtered = item.bullets
    .map(normalizeBullet)
    .filter(b => b.length >= 10 && !IMPLICATION_PATTERNS.some(p => p.test(b)));

  if (filtered.length >= 3) return filtered.slice(0, 3);

  if (item.summary && item.summary.trim().length > 0) {
    const sentences = item.summary
      .split(/[.!?]+\s+/)
      .map(s => s.trim())
      .filter(s => s.length >= 20 && !IMPLICATION_PATTERNS.some(p => p.test(s)));
    for (const sentence of sentences) {
      if (filtered.length >= 3) break;
      const isDup = filtered.some(b => {
        const a = b.toLowerCase().split(/\s+/);
        const c = sentence.toLowerCase().split(/\s+/);
        const overlap = a.filter(w => c.includes(w)).length;
        return overlap > Math.min(a.length, c.length) * 0.5;
      });
      if (!isDup) filtered.push(sentence);
    }
  }

  while (filtered.length < 3) {
    filtered.push('Read the full article for complete details.');
  }
  return filtered.slice(0, 3);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type RenderEmailDigestOptions = {
  mode: 'email';
  /**
   * Per-recipient unsubscribe URL.
   * Pass the literal string `'%%UNSUBSCRIBE_URL%%'` to embed a placeholder
   * that the send script replaces with the real URL for each recipient.
   */
  unsubscribeUrl?: string;
};

// Brand palette — hardcoded for email client compatibility (no CSS variables)
const C = {
  bg:          '#FAF9F6',   // cream background
  surface:     '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecond:  '#6B7280',
  accent:      '#8B6914',   // gold
  accentLight: '#F5F0E6',   // warm cream
  accentMuted: '#B7A26E',   // gold at ~60% on cream bg (rank numbers)
  border:      '#E5E7EB',
  navy:        '#1B2A4A',   // deep navy
  navyText:    '#B7BBC2',   // white at 70% on navy
  navyFaint:   '#697386',   // white at 35% on navy
};

const SERIF  = "Georgia, 'Times New Roman', serif";
const SANS   = "'Helvetica Neue', Arial, Helvetica, sans-serif";

/**
 * Render EmailDigest as HTML. For mode 'email', uses inline styles for email clients.
 * Layout: table-based for maximum email client compatibility.
 */
export function renderEmailDigestHtml(digest: EmailDigest, opts: RenderEmailDigestOptions): string {
  const week = digest.week;
  const issueLine = escapeHtml(formatIssueLine(week));
  const digestUrl = withEmailUtms(`${CANONICAL_URL}/digest/${weekLabelToSlug(week)}`, week, 'read_online_cta');

  // Split into tiers
  const leadItem      = digest.items.find(i => i.rank === 1);
  const secondaryItems = digest.items.filter(i => i.rank >= 2 && i.rank <= 5);
  const tertiaryItems  = digest.items.filter(i => i.rank >= 6);

  // Lead article row
  const leadRow = leadItem ? (() => {
    const bullets = extractSummaryBullets(leadItem);
    return `
          <!-- LEAD STORY -->
          <tr>
            <td class="outer-pad" style="background-color:${C.bg}; padding: 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height: 2px; background-color: ${C.accent};"></td></tr>
                <tr>
                  <td style="border-left: 3px solid ${C.accent}; padding: 28px 0 32px 20px;">
                    <p style="margin: 0 0 12px 0;">
                      <span style="font-family: ${SANS}; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: ${C.accent}; font-weight: 600;">Lead Story</span>
                      <span style="font-family: ${SANS}; font-size: 11px; color: ${C.textSecond}; margin-left: 10px;">${escapeHtml(leadItem.source)}</span>
                    </p>
                    <h2 style="margin: 0 0 14px 0; font-family: ${SERIF}; font-size: 31px; font-weight: normal; line-height: 1.3; letter-spacing: -0.01em;">
                      <a href="${escapeHtml(leadItem.url)}" style="color: ${C.textPrimary}; text-decoration: underline;">${escapeHtml(leadItem.title)}</a>
                    </h2>
                    <p style="margin: 0 0 16px 0; font-family: ${SANS}; font-size: 17px; line-height: 1.7; color: ${C.textSecond};">${escapeHtml(bullets[0] ?? '')}</p>
                    <a href="${escapeHtml(leadItem.url)}" style="font-family: ${SANS}; font-size: 14px; color: ${C.accent}; text-decoration: none;">Read full article &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
  })() : '';

  // Secondary article rows (ranks 2–4)
  const secondaryRows = secondaryItems.length > 0 ? `
          <!-- SECONDARY DIVIDER -->
          <tr>
            <td class="outer-pad" style="background-color:${C.bg}; padding: 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height: 1px; background-color: ${C.border};"></td></tr>
              </table>
            </td>
          </tr>
          ${secondaryItems.map(item => {
            const bullets = extractSummaryBullets(item).slice(0, 2);
            const rankStr = String(item.rank).padStart(2, '0');
            return `
          <!-- Secondary ${rankStr} -->
          <tr>
            <td class="outer-pad" style="background-color:${C.bg}; padding: 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-top: 22px; padding-bottom: 24px;">
                    <p style="margin: 0 0 8px 0;">
                      <span style="font-family: ${SERIF}; font-size: 16px; color: ${C.accentMuted};">${rankStr}</span>
                      <span style="font-family: ${SANS}; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: ${C.textSecond}; margin-left: 8px;">${escapeHtml(item.source)}</span>
                    </p>
                    <h3 style="margin: 0 0 10px 0; font-family: ${SERIF}; font-size: 22px; font-weight: normal; line-height: 1.4;">
                      <a href="${escapeHtml(item.url)}" style="color: ${C.textPrimary}; text-decoration: underline;">${escapeHtml(item.title)}</a>
                    </h3>
                    ${bullets.map(b =>
                      `<p style="margin: 0 0 6px 0; font-family: ${SANS}; font-size: 16px; line-height: 1.6; color: ${C.textSecond};"><span style="color: ${C.accent}; margin-right: 5px;">&mdash;</span>${escapeHtml(b)}</p>`
                    ).join('\n                    ')}
                  </td>
                </tr>
                <tr><td style="height: 1px; background-color: ${C.border};"></td></tr>
              </table>
            </td>
          </tr>`;
          }).join('\n')}` : '';

  // Tertiary rows (ranks 5+) — compact list
  const tertiaryRows = tertiaryItems.length > 0 ? `
          <!-- ALSO THIS WEEK header -->
          <tr>
            <td class="outer-pad" style="background-color:${C.bg}; padding: 20px 32px 8px;">
              <p style="margin: 0; font-family: ${SANS}; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: ${C.textSecond};">Also This Week</p>
            </td>
          </tr>
          ${tertiaryItems.map(item => `
          <!-- Tertiary ${item.rank} -->
          <tr>
            <td class="outer-pad" style="background-color:${C.bg}; padding: 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 10px 0 10px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <a href="${escapeHtml(item.url)}" style="font-family: ${SANS}; font-size: 16px; color: ${C.textPrimary}; text-decoration: none; line-height: 1.4;">${escapeHtml(item.title)}</a>
                        </td>
                        <td width="90" style="text-align: right; vertical-align: middle; padding-left: 12px;">
                          <span style="font-family: ${SANS}; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.textSecond}; white-space: nowrap;">${escapeHtml(item.source)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 1px; background-color: ${C.border};"></td></tr>
              </table>
            </td>
          </tr>`).join('\n')}` : '';

  const articleRows = leadRow + secondaryRows + tertiaryRows;

  const takeBlock = digest.editorialTake ? `
          <!-- Editor's Take -->
          <tr>
            <td class="outer-pad" style="background-color: ${C.bg}; padding: 0 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-left: 2px solid ${C.accent}; padding: 4px 0 4px 20px;">
                    <p style="margin: 0 0 14px 0; font-family: ${SANS}; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: ${C.accent};">Editor&#8217;s Take</p>
                    ${digest.editorialTake.split(/\n\s*\n/).map(p => `<p style="margin: 0 0 14px 0; font-family: ${SERIF}; font-size: 17px; line-height: 1.7; color: ${C.textPrimary};">${escapeHtml(p.trim())}</p>`).join('\n                    ')}
                    <p style="margin: 6px 0 0 0; font-family: ${SANS}; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: ${C.textSecond};">The Editor</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

  const introBlock = digest.intro ? `
          <!-- Intro -->
          <tr>
            <td class="outer-pad" style="background-color: ${C.bg}; padding: 32px 32px 0;">
              <p style="margin: 0 0 28px 0; font-family: ${SERIF}; font-size: 18px; line-height: 1.75; color: ${C.textSecond}; font-style: italic;">${escapeHtml(digest.intro)}</p>
            </td>
          </tr>` : '';


  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Luxury Intelligence &mdash; ${issueLine}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @media screen and (max-width: 600px) {
      .outer-pad { padding-left: 16px !important; padding-right: 16px !important; }
      .masthead-pad { padding: 24px 16px 20px !important; }
      .footer-pad { padding: 22px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #EDE9E1; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #EDE9E1;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table width="780" cellpadding="0" cellspacing="0" border="0" style="max-width: 780px; width: 100%;">

          <!-- ===== MASTHEAD ===== -->
          <tr>
            <td class="masthead-pad" style="background-color: ${C.navy}; padding: 32px 40px 28px;">
              <p style="margin: 0 0 6px 0; font-family: ${SANS}; font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: ${C.accent};">${issueLine}</p>
              <h1 style="margin: 0; font-family: ${SERIF}; font-size: 34px; font-weight: normal; letter-spacing: 0.06em; color: ${C.bg}; text-transform: uppercase; line-height: 1.2;">Luxury Intelligence</h1>
              <p style="margin: 8px 0 0 0; font-family: ${SANS}; font-size: 13px; color: ${C.navyFaint}; letter-spacing: 0.05em;">Weekly Intelligence Digest</p>
            </td>
          </tr>

          <!-- Gold masthead rule -->
          <tr><td style="height: 3px; background-color: ${C.accent};"></td></tr>

          ${introBlock}
          ${takeBlock}

          ${articleRows}

          <!-- Read online CTA -->
          <tr>
            <td class="outer-pad" style="background-color: ${C.bg}; padding: 28px 32px 8px; text-align: center;">
              <p style="margin: 0; font-family: ${SANS}; font-size: 13px; color: ${C.textSecond}; line-height: 1.6;">
                Read the full digest on the website &mdash;
                <a href="${digestUrl}" style="color: ${C.accent}; text-decoration: underline;">luxury-intel.com</a>
              </p>
            </td>
          </tr>

          <!-- Bottom padding -->
          <tr><td style="background-color: ${C.bg}; height: 32px;"></td></tr>

          <!-- ===== FOOTER ===== -->
          <tr><td style="height: 2px; background-color: ${C.accent};"></td></tr>
          <tr>
            <td class="footer-pad" style="background-color: ${C.navy}; padding: 28px 40px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-family: ${SERIF}; font-size: 16px; color: ${C.navyText}; letter-spacing: 0.05em;">Luxury Intelligence</p>
              <p style="margin: 0 0 16px 0; font-family: ${SANS}; font-size: 11px; color: ${C.navyFaint}; letter-spacing: 0.2em; text-transform: uppercase;">${escapeHtml(week)}</p>
              <p style="margin: 0 0 10px 0; font-family: ${SANS}; font-size: 12px; color: ${C.navyFaint}; line-height: 1.7;">You&rsquo;re receiving this because you subscribed to the weekly digest.</p>
              ${opts.unsubscribeUrl
                ? `<p style="margin: 0; font-family: ${SANS}; font-size: 11px; color: ${C.navyFaint};"><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color: ${C.navyFaint}; text-decoration: underline;">Unsubscribe</a></p>`
                : `<p style="margin: 0; font-family: ${SANS}; font-size: 11px; color: ${C.navyFaint};">To unsubscribe, reply with &ldquo;unsubscribe&rdquo; in the subject.</p>`}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Render EmailDigest as plain text for the email text/plain part.
 * Pass `unsubscribeUrl` to embed the unsubscribe link.
 * Pass `'%%UNSUBSCRIBE_URL%%'` as a placeholder to substitute per-recipient.
 */
export function renderEmailDigestPlaintext(digest: EmailDigest, unsubscribeUrl?: string): string {
  const issueLine = formatIssueLine(digest.week);
  const digestUrl = withEmailUtms(`${CANONICAL_URL}/digest/${weekLabelToSlug(digest.week)}`, digest.week, 'read_online_cta');
  let text = `LUXURY INTELLIGENCE\n`;
  text += `${issueLine}\n`;
  text += `${'─'.repeat(50)}\n\n`;

  if (digest.intro) {
    text += `${digest.intro}\n\n`;
    text += `${'─'.repeat(50)}\n\n`;
  }

  if (digest.editorialTake) {
    text += `EDITOR'S TAKE\n\n${digest.editorialTake.trim()}\n\n— The Editor\n\n`;
    text += `${'─'.repeat(50)}\n\n`;
  }

  for (const item of digest.items) {
    const bullets = extractSummaryBullets(item);
    text += `${String(item.rank).padStart(2, '0')}  ${item.title}\n`;
    text += `    ${item.source.toUpperCase()}\n`;
    text += `    ${item.url}\n\n`;
    for (const b of bullets) {
      text += `    — ${b}\n`;
    }
    text += '\n';
  }

  text += `${'─'.repeat(50)}\n`;
  text += `Read the full digest online: ${digestUrl}\n\n`;
  text += `Luxury Intelligence — ${digest.week}\n`;
  text += `You're receiving this because you subscribed to the weekly digest.\n`;
  if (unsubscribeUrl) {
    text += `To unsubscribe: ${unsubscribeUrl}\n`;
  } else {
    text += `To unsubscribe, reply with "unsubscribe" in the subject line.\n`;
  }
  return text;
}
