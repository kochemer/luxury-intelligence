/**
 * The Sunday summary email. Unlike the daily alert, this always sends.
 *
 * It leads with three plain questions rather than the single score, because
 * the score alone misleads: it is set by the worst severity present, so a week
 * where the site itself is spotless but Google has not crawled half of it reads
 * "25/100" — alarming, and not a description of anything you could fix. Split
 * by where each finding comes from, the same week reads correctly:
 *
 *   Site health        STATIC_* / LIVE_*   is the site built correctly?
 *   Google indexing    GSC_*               what has Google actually done with it?
 *   Improvement ideas  OPT_*               what could be better?
 *
 * Every value that came from a finding is escaped. Findings quote page titles
 * and URLs, and those originate in third-party RSS feeds.
 */

import { escapeHtml } from '@/lib/digest/renderEmailDigestHtml';
import { deliverEmail, getEmailConfig, type EmailSender, type DeliveryResult } from '../shared/email';
import type { Finding, SeoReport } from '../types';

export type FindingGroup = 'health' | 'indexing' | 'ideas';

/** Classified by code prefix: deterministic, and set by the producer that raised it. */
export function groupOf(code: string): FindingGroup {
  if (code.startsWith('GSC_')) return 'indexing';
  if (code.startsWith('OPT_')) return 'ideas';
  return 'health';
}

const ACTIONABLE = new Set(['critical', 'high']);
const MAX_GROUPS_SHOWN = 6;

export interface WeeklyEmailContext {
  report: SeoReport;
  /** Link to the committed markdown report, when running in CI. */
  reportUrl?: string;
  /** Link to the workflow run that produced it. */
  runUrl?: string;
}

interface CodeGroup {
  code: string;
  severity: Finding['severity'];
  title: string;
  recommendation: string;
  count: number;
  examples: string[];
}

/** Collapse findings sharing a code, so 25 never-crawled pages are one line, not 25. */
function collapseByCode(findings: Finding[]): CodeGroup[] {
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const byCode = new Map<string, CodeGroup>();

  for (const f of findings) {
    const existing = byCode.get(f.code);
    const path = f.url ? f.url.replace(/^https?:\/\/[^/]+/, '') || '/' : null;
    if (existing) {
      existing.count++;
      if (path && existing.examples.length < 3) existing.examples.push(path);
    } else {
      byCode.set(f.code, {
        code: f.code,
        severity: f.severity,
        title: f.title,
        recommendation: f.recommendation,
        count: 1,
        examples: path ? [path] : [],
      });
    }
  }

  return [...byCode.values()].sort((a, b) =>
    order.indexOf(a.severity) - order.indexOf(b.severity) || b.count - a.count
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export interface WeeklySummary {
  healthIssues: number;
  ideas: number;
  actionable: number;
  indexing: { indexed: number; inspected: number; change: number | null } | null;
  isFirstReport: boolean;
}

/** The numbers the email is built from — separated so they can be tested directly. */
export function summarise(report: SeoReport): WeeklySummary {
  const nonInfo = report.findings.filter(f => f.severity !== 'info');
  const current = report.inputs.indexing;
  const previous = report.delta.previousIndexing;

  return {
    healthIssues: nonInfo.filter(f => groupOf(f.code) === 'health').length,
    ideas: nonInfo.filter(f => groupOf(f.code) === 'ideas').length,
    actionable: report.findings.filter(f => ACTIONABLE.has(f.severity)).length,
    indexing: current
      ? { ...current, change: previous ? current.indexed - previous.indexed : null }
      : null,
    isFirstReport: !report.delta.previousWeek,
  };
}

export function buildWeeklySubject(report: SeoReport): string {
  const s = summarise(report);
  const indexed = s.indexing ? ` · ${s.indexing.indexed}/${s.indexing.inspected} pages indexed` : '';
  const verdict = s.actionable > 0 ? `${s.actionable} to look at` : 'all clear';
  return `SEO weekly — ${report.week}: ${verdict}${indexed}`;
}

function tile(label: string, value: string, note: string, tone: 'good' | 'warn' | 'neutral'): string {
  const colour = tone === 'good' ? '#047857' : tone === 'warn' ? '#B45309' : '#1A1A1A';
  return `
    <td style="width:33%;padding:14px 12px;border:1px solid #E5E7EB;background:#FFFFFF;vertical-align:top">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280">${escapeHtml(label)}</div>
      <div style="font-family:Georgia,serif;font-size:22px;color:${colour};margin:4px 0 2px">${escapeHtml(value)}</div>
      <div style="font-size:12px;color:#6B7280">${escapeHtml(note)}</div>
    </td>`;
}

function renderGroup(g: CodeGroup): string {
  const count = g.count > 1 ? ` <span style="color:#6B7280">×${g.count}</span>` : '';
  const examples = g.examples.length > 0
    ? `<div style="font-size:12px;color:#6B7280;margin-top:2px">e.g. ${g.examples.map(escapeHtml).join(', ')}${g.count > g.examples.length ? ` +${g.count - g.examples.length} more` : ''}</div>`
    : '';
  return `
    <li style="margin:0 0 14px">
      <strong>${escapeHtml(g.title)}</strong>${count}
      ${examples}
      <div style="font-size:13px;color:#8B6914;margin-top:3px">→ ${escapeHtml(g.recommendation)}</div>
    </li>`;
}

export function buildWeeklyEmailHtml(ctx: WeeklyEmailContext): string {
  const { report } = ctx;
  const s = summarise(report);

  const healthTile = s.healthIssues === 0
    ? tile('Site health', 'Clean', 'no technical problems', 'good')
    : tile('Site health', String(s.healthIssues), `technical issue${s.healthIssues === 1 ? '' : 's'}`, 'warn');

  const indexingTile = s.indexing
    ? tile(
        'Google indexes',
        `${s.indexing.indexed} of ${s.indexing.inspected}`,
        s.indexing.change === null ? 'first week tracked' : `${signed(s.indexing.change)} since last week`,
        s.indexing.indexed === s.indexing.inspected ? 'good' : 'neutral'
      )
    : tile('Google indexes', '—', 'not checked this week', 'neutral');

  const ideasTile = tile('Improvement ideas', String(s.ideas), s.ideas === 0 ? 'nothing to improve' : 'optional', 'neutral');

  const actionable = collapseByCode(report.findings.filter(f => ACTIONABLE.has(f.severity)));
  const ideas = collapseByCode(report.findings.filter(f => !ACTIONABLE.has(f.severity) && groupOf(f.code) === 'ideas'));

  const needsLook = actionable.length === 0
    ? `<p style="color:#047857">✓ Nothing needs your attention this week.</p>`
    : `<ul style="padding-left:18px;margin:0">${actionable.slice(0, MAX_GROUPS_SHOWN).map(renderGroup).join('')}</ul>
       ${actionable.length > MAX_GROUPS_SHOWN ? `<p style="font-size:13px;color:#6B7280">+${actionable.length - MAX_GROUPS_SHOWN} more kinds in the full report.</p>` : ''}`;

  const changed = s.isFirstReport
    ? `<p style="color:#6B7280">This is the first weekly report, so there is nothing to compare against yet. Next Sunday will show what changed.</p>`
    : `<p>${report.delta.newFindings.length} new · ${report.delta.resolvedFindings.length} resolved since ${escapeHtml(report.delta.previousWeek ?? '')} · score ${report.score.overall} (${signed(report.delta.scoreChange)})</p>`;

  const ideasBlock = ideas.length === 0
    ? ''
    : `<h3 style="font-family:Georgia,serif;font-size:17px;margin:24px 0 8px">Improvement ideas</h3>
       <p style="font-size:13px;color:#6B7280;margin:0 0 10px">Optional — nothing here is broken.</p>
       <ul style="padding-left:18px;margin:0">${ideas.slice(0, MAX_GROUPS_SHOWN).map(renderGroup).join('')}</ul>`;

  const links = [
    ctx.reportUrl && `<a href="${escapeHtml(ctx.reportUrl)}" style="color:#1B2A4A">Full report</a>`,
    ctx.runUrl && `<a href="${escapeHtml(ctx.runUrl)}" style="color:#1B2A4A">This run</a>`,
  ].filter(Boolean).join(' · ');

  return `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#FAF9F6;color:#1A1A1A;line-height:1.5">
    <h2 style="font-family:Georgia,serif;margin:0 0 4px">Luxury Intelligence — SEO weekly</h2>
    <p style="color:#6B7280;margin:0 0 18px;font-size:13px">${escapeHtml(report.siteUrl)} · ${escapeHtml(report.week)}</p>

    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0 0 22px">
      <tr>${healthTile}${indexingTile}${ideasTile}</tr>
    </table>

    <h3 style="font-family:Georgia,serif;font-size:17px;margin:0 0 8px">Needs a look</h3>
    ${needsLook}

    <h3 style="font-family:Georgia,serif;font-size:17px;margin:24px 0 8px">Since last week</h3>
    ${changed}

    ${ideasBlock}

    <p style="color:#9CA3AF;font-size:12px;border-top:1px solid #E5E7EB;padding-top:12px;margin-top:24px">
      ${links ? `${links}<br>` : ''}
      Sent every Sunday. Separate daily alerts arrive only when something breaks.
    </p>
  </div>`;
}

export function buildWeeklyEmailText(ctx: WeeklyEmailContext): string {
  const { report } = ctx;
  const s = summarise(report);
  const lines: string[] = [
    `Luxury Intelligence — SEO weekly`,
    `${report.siteUrl} · ${report.week}`,
    '',
    `Site health:       ${s.healthIssues === 0 ? 'Clean' : `${s.healthIssues} technical issue(s)`}`,
    `Google indexes:    ${s.indexing
      ? `${s.indexing.indexed} of ${s.indexing.inspected}${s.indexing.change === null ? ' (first week tracked)' : ` (${signed(s.indexing.change)} since last week)`}`
      : 'not checked this week'}`,
    `Improvement ideas: ${s.ideas}`,
    '',
    'NEEDS A LOOK',
  ];

  const actionable = collapseByCode(report.findings.filter(f => ACTIONABLE.has(f.severity)));
  if (actionable.length === 0) {
    lines.push('  Nothing needs your attention this week.');
  } else {
    for (const g of actionable.slice(0, MAX_GROUPS_SHOWN)) {
      lines.push(`  - ${g.title}${g.count > 1 ? ` (x${g.count})` : ''}`);
      if (g.examples.length) lines.push(`    e.g. ${g.examples.join(', ')}`);
      lines.push(`    -> ${g.recommendation}`);
    }
  }

  lines.push('', 'SINCE LAST WEEK');
  lines.push(s.isFirstReport
    ? '  First weekly report — next Sunday will show what changed.'
    : `  ${report.delta.newFindings.length} new, ${report.delta.resolvedFindings.length} resolved since ${report.delta.previousWeek}. Score ${report.score.overall} (${signed(report.delta.scoreChange)}).`);

  if (ctx.reportUrl) lines.push('', `Full report: ${ctx.reportUrl}`);
  if (ctx.runUrl) lines.push(`This run: ${ctx.runUrl}`);
  lines.push('', 'Sent every Sunday. Separate daily alerts arrive only when something breaks.');

  return lines.join('\n');
}

export type WeeklySendResult = DeliveryResult & { skipped?: 'no-recipient' | 'no-sender' };

/** Send the weekly summary. `send` is injectable for offline tests. */
export async function sendWeeklyEmail(ctx: WeeklyEmailContext, send?: EmailSender): Promise<WeeklySendResult> {
  const config = getEmailConfig();
  if (!config.ok) {
    return { delivered: false, skipped: config.reason, error: config.message };
  }

  return deliverEmail(
    {
      subject: buildWeeklySubject(ctx.report),
      html: buildWeeklyEmailHtml(ctx),
      text: buildWeeklyEmailText(ctx),
    },
    config.config,
    send
  );
}
