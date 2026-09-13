/**
 * Weekly summary email: content, safety, delivery, and the week-over-week
 * carry-forward it depends on.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import {
  groupOf,
  summarise,
  buildWeeklySubject,
  buildWeeklyEmailHtml,
  buildWeeklyEmailText,
  sendWeeklyEmail,
} from '../seo/report/weeklyEmail';
import { buildReport } from '../seo/report/buildReport';
import type { EmailSender, OutgoingEmail } from '../seo/shared/email';
import type { AuditInputs, Finding, SeoReport } from '../seo/types';

const INPUTS: AuditInputs = {
  gscAvailable: true, liveChecked: true, urlsAudited: 52, urlsMetaChecked: 37,
  urlsFetched: 52, llmUsed: false, coveredCategories: ['technical', 'onpage', 'indexing'],
};

function finding(overrides: Partial<Finding> & Pick<Finding, 'id' | 'code'>): Finding {
  return {
    severity: 'high', category: 'indexing', title: 't', detail: 'd', recommendation: 'r',
    score: 0, firstSeenWeek: '', weeksOpen: 1, ...overrides,
  };
}

function report(overrides: Partial<SeoReport> = {}): SeoReport {
  return {
    version: 1,
    week: '2026-W37',
    generatedAtISO: '2026-09-13T08:00:00.000Z',
    siteUrl: 'https://luxury-intel.com',
    inputs: { ...INPUTS, indexing: { indexed: 23, inspected: 52 } },
    score: { overall: 25, byCategory: { technical: 100, onpage: 100, 'structured-data': null, indexing: 25, performance: null, opportunity: null } },
    findings: [],
    delta: { newFindings: [], resolvedFindings: [], persistingFindings: [], scoreChange: 0 },
    ...overrides,
  };
}

test('findings are grouped by the producer that raised them', () => {
  assert.equal(groupOf('STATIC_TITLE_LENGTH'), 'health');
  assert.equal(groupOf('LIVE_NON_200'), 'health');
  assert.equal(groupOf('GSC_NEVER_CRAWLED'), 'indexing');
  assert.equal(groupOf('OPT_IMAGE_OVERSIZED'), 'ideas');
});

test('a clean site with indexing gaps reads as clean site, not as a failing score', () => {
  // The case that motivated splitting the summary: score 25, yet nothing about
  // the site itself is wrong.
  const r = report({
    findings: Array.from({ length: 25 }, (_, i) =>
      finding({ id: `GSC_NEVER_CRAWLED:${i}`, code: 'GSC_NEVER_CRAWLED', url: `https://luxury-intel.com/p${i}` })),
  });
  const s = summarise(r);

  assert.equal(s.healthIssues, 0, 'no STATIC_/LIVE_ findings means site health is clean');
  assert.equal(s.actionable, 25);
  assert.match(buildWeeklyEmailHtml({ report: r }), /Clean/);
});

test('indexing change is unknown on the first report and computed afterwards', () => {
  assert.equal(summarise(report()).indexing?.change, null);

  const later = report({
    inputs: { ...INPUTS, indexing: { indexed: 31, inspected: 52 } },
    delta: {
      previousWeek: '2026-W36', newFindings: [], resolvedFindings: [], persistingFindings: [],
      scoreChange: 10, previousIndexing: { indexed: 23, inspected: 52 },
    },
  });
  assert.equal(summarise(later).indexing?.change, 8);
  assert.match(buildWeeklyEmailText({ report: later }), /31 of 52 \(\+8 since last week\)/);
});

test('the subject says whether anything needs a look', () => {
  assert.match(buildWeeklySubject(report()), /all clear/);
  assert.match(buildWeeklySubject(report()), /23\/52 pages indexed/);

  const withIssue = report({ findings: [finding({ id: 'LIVE_NON_200:x', code: 'LIVE_NON_200', severity: 'critical' })] });
  assert.match(buildWeeklySubject(withIssue), /1 to look at/);
});

test('repeated findings collapse to one line with a count', () => {
  const r = report({
    findings: Array.from({ length: 25 }, (_, i) =>
      finding({ id: `GSC_NEVER_CRAWLED:${i}`, code: 'GSC_NEVER_CRAWLED', title: 'Google has never crawled this page', url: `https://luxury-intel.com/p${i}` })),
  });
  const html = buildWeeklyEmailHtml({ report: r });

  assert.equal(html.match(/Google has never crawled this page/g)?.length, 1, 'one line, not twenty-five');
  assert.match(html, /×25/);
  assert.match(html, /\+22 more/, 'three examples shown, the rest counted');
});

test('values from findings are escaped, since they quote third-party content', () => {
  const r = report({
    findings: [finding({
      id: 'LIVE_TITLE_LENGTH:x', code: 'LIVE_TITLE_LENGTH',
      title: 'Title <script>alert(1)</script> & "quotes"',
      recommendation: '<img src=x onerror=alert(1)>',
    })],
  });
  const html = buildWeeklyEmailHtml({ report: r });

  assert(!html.includes('<script>'), 'raw markup from a finding must never reach the email');
  assert(!html.includes('<img src=x'), 'raw markup in a recommendation must be escaped too');
  assert.match(html, /&lt;script&gt;/);
});

test('the first report says so instead of showing an empty comparison', () => {
  assert.match(buildWeeklyEmailHtml({ report: report() }), /first weekly report/i);
});

// ── Delivery ──────────────────────────────────────────────────────────────

async function withEnv<T>(fn: () => Promise<T>, recipient: string | null = 'owner@example.test'): Promise<T> {
  const keys = ['SEO_ALERT_EMAIL', 'EMAIL_FROM', 'RESEND_API_KEY'] as const;
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  if (recipient === null) delete process.env.SEO_ALERT_EMAIL; else process.env.SEO_ALERT_EMAIL = recipient;
  process.env.EMAIL_FROM = 'SEO <seo@example.test>';
  process.env.RESEND_API_KEY = 're_test';
  try { return await fn(); } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

function recorder(respond: Awaited<ReturnType<EmailSender>> | Error) {
  const sent: OutgoingEmail[] = [];
  const send: EmailSender = async (email) => {
    sent.push(email);
    if (respond instanceof Error) throw respond;
    return respond;
  };
  return { send, sent };
}

test('the weekly summary is sent and reports its message id', async () => {
  const { send, sent } = recorder({ data: { id: 'weekly-1' }, error: null });
  const result = await withEnv(() => sendWeeklyEmail({ report: report() }, send));

  assert.equal(result.delivered, true);
  assert.equal(result.id, 'weekly-1');
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.subject, /SEO weekly/);
  assert(sent[0]!.text.length > 0, 'a plain-text part must accompany the HTML');
});

test('a rejected weekly summary is not reported as delivered', async () => {
  const { send, sent } = recorder({ data: { id: 'ignored' }, error: { message: 'domain not verified' } });
  const result = await withEnv(() => sendWeeklyEmail({ report: report() }, send));

  assert.equal(sent.length, 1);
  assert.equal(result.delivered, false);
  assert.match(result.error ?? '', /domain not verified/);
});

test('with no recipient configured, nothing is sent and it is marked skipped, not failed', async () => {
  const { send, sent } = recorder({ data: { id: 'x' }, error: null });
  const result = await withEnv(() => sendWeeklyEmail({ report: report() }, send), null);

  assert.equal(sent.length, 0);
  assert.equal(result.delivered, false);
  assert.equal(result.skipped, 'no-recipient');
});

// ── Week-over-week carry-forward ──────────────────────────────────────────

test('buildReport carries last week\'s indexing count forward within the same report family', async () => {
  // Also exercises the prefix-based lookup of the previous report — the code
  // where a template-literal RegExp once silently matched nothing.
  const dir = path.join(process.cwd(), 'data', 'seo');
  const prevPath = path.join(dir, 'weekly-1998-W01.json');
  const otherFamilyPath = path.join(dir, 'report-1998-W01.json');
  await fs.mkdir(dir, { recursive: true });

  const previous = await buildReport('1998-W01', 'https://example.test', [],
    { ...INPUTS, indexing: { indexed: 23, inspected: 52 } }, 'weekly');
  await fs.writeFile(prevPath, JSON.stringify(previous), 'utf-8');

  // A report in the *other* family for the same week, with a different count.
  // It must not be picked up.
  const decoy = await buildReport('1998-W01', 'https://example.test', [],
    { ...INPUTS, indexing: { indexed: 999, inspected: 999 } }, 'report');
  await fs.writeFile(otherFamilyPath, JSON.stringify(decoy), 'utf-8');

  try {
    const current = await buildReport('1998-W02', 'https://example.test', [],
      { ...INPUTS, indexing: { indexed: 31, inspected: 52 } }, 'weekly');

    assert.equal(current.delta.previousWeek, '1998-W01', 'the previous weekly report must be found');
    assert.deepEqual(current.delta.previousIndexing, { indexed: 23, inspected: 52 },
      'the count must come from the same family, not the decoy');
  } finally {
    await fs.rm(prevPath, { force: true });
    await fs.rm(otherFamilyPath, { force: true });
  }
});
