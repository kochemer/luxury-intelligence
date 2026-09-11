/**
 * Repo-static SEO checks — no network calls. Reads digest JSON, the sitemap
 * inventory, and robots rules directly, and evaluates the same title/description
 * builders the live pages use (lib/seo/metaText.ts) so findings match reality.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getIndexableUrls, getAvailableWeekLabels, STATIC_PAGE_LAST_MODIFIED } from '@/lib/seo/urlInventory';
import { buildWeekMetaDescription, renderedWeekTitle } from '@/lib/seo/metaText';
import { formatDateRange } from '@/lib/utils/formatDate';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';
import robots from '../../app/robots';
import {
  TITLE_MAX_RENDERED,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  STATIC_PAGE_LAST_MODIFIED_MAX_AGE_MONTHS,
} from '../config';
import type { Finding, Category } from '../types';
import type { IndexableUrlEntry } from '@/lib/seo/urlInventory';
import type { WeeklyDigest } from '@/lib/types';

const REPO_ROOT = path.join(process.cwd());
const DIGESTS_DIR = path.join(REPO_ROOT, 'data', 'digests');

function findingId(code: string, scope: string): string {
  const hash = createHash('sha1').update(scope).digest('hex').slice(0, 8);
  return `${code}:${hash}`;
}

function makeFinding(partial: Omit<Finding, 'id' | 'score' | 'firstSeenWeek' | 'weeksOpen'> & { scope: string }): Finding {
  const { scope, ...rest } = partial;
  return {
    ...rest,
    id: findingId(rest.code, scope),
    score: 0, // filled in by buildReport.ts scoring pass
    firstSeenWeek: '', // filled in by buildReport.ts delta pass
    weeksOpen: 1,
  };
}

async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const raw = await fs.readFile(path.join(DIGESTS_DIR, `${weekLabel}.json`), 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch {
    return null;
  }
}

/** Sitemap ↔ digest-file reconciliation (both directions). */
function checkSitemapReconciliation(baseUrl: string, entries: IndexableUrlEntry[], weekLabels: string[]): Finding[] {
  const findings: Finding[] = [];
  const sitemapDigestUrls = new Set(entries.filter(e => e.kind === 'digest').map(e => e.url));

  for (const weekLabel of weekLabels) {
    const expectedUrl = `${baseUrl}/digest/${weekLabelToSlug(weekLabel)}`;
    if (!sitemapDigestUrls.has(expectedUrl)) {
      findings.push(makeFinding({
        scope: expectedUrl,
        code: 'STATIC_DIGEST_MISSING_FROM_SITEMAP',
        severity: 'critical',
        category: 'indexing',
        title: `Digest ${weekLabel} is not in the sitemap`,
        detail: `data/digests/${weekLabel}.json exists but no sitemap entry was generated for it.`,
        url: expectedUrl,
        recommendation: 'Check that the digest filename matches YYYY-Www.json and weekLabelToSlug() succeeds for it.',
      }));
    }
  }
  return findings;
}

/** Sitemap URLs that fall under a robots.ts disallow prefix. */
function checkRobotsConflicts(baseUrl: string, entries: IndexableUrlEntry[]): Finding[] {
  const findings: Finding[] = [];
  const robotsConfig = robots();
  const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules : [robotsConfig.rules];
  const disallowedPaths = rules
    .flatMap(r => (Array.isArray(r?.disallow) ? r.disallow : r?.disallow ? [r.disallow] : []))
    .filter((p): p is string => typeof p === 'string');

  if (disallowedPaths.length === 0) return findings;

  for (const entry of entries) {
    const urlPath = entry.url.replace(baseUrl, '') || '/';
    // Match on path-segment boundaries only. A bare startsWith() would flag
    // "/searchable-guide" as conflicting with a "/search" disallow rule.
    const conflict = disallowedPaths.find(p => urlPath === p || urlPath.startsWith(`${p}/`));
    if (conflict) {
      findings.push(makeFinding({
        scope: entry.url,
        code: 'STATIC_ROBOTS_DISALLOW_CONFLICT',
        severity: 'high',
        category: 'indexing',
        title: `Sitemap URL is disallowed in robots.txt`,
        detail: `${entry.url} is in the sitemap but matches robots.ts disallow rule "${conflict}".`,
        url: entry.url,
        evidence: { disallowRule: conflict },
        recommendation: 'Remove the URL from the sitemap, or remove the conflicting disallow rule — a page cannot usefully be both.',
      }));
    }
  }
  return findings;
}

/** STATIC_PAGE_LAST_MODIFIED age check. */
function checkStaleLastModified(): Finding[] {
  // Imported, never re-declared — a local copy of this date would silently
  // drift from the sitemap's the moment one of the two was bumped.
  const ageMonths = (Date.now() - STATIC_PAGE_LAST_MODIFIED.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (ageMonths <= STATIC_PAGE_LAST_MODIFIED_MAX_AGE_MONTHS) return [];
  return [makeFinding({
    scope: 'lib/seo/urlInventory.ts:STATIC_PAGE_LAST_MODIFIED',
    code: 'STATIC_SITEMAP_STALE_LASTMOD',
    severity: 'medium',
    category: 'technical',
    title: 'Static-page sitemap lastModified date is stale',
    detail: `STATIC_PAGE_LAST_MODIFIED is ${STATIC_PAGE_LAST_MODIFIED.toISOString().slice(0, 10)} (${Math.floor(ageMonths)} months old), over the ${STATIC_PAGE_LAST_MODIFIED_MAX_AGE_MONTHS}-month threshold.`,
    recommendation: 'If /about, /methodology, /subscribe, /feedback, or /support changed recently, bump the constant in lib/seo/urlInventory.ts.',
  })];
}

/** Title/description length and duplicate checks across all digest pages. */
async function checkDigestMetaText(baseUrl: string, weekLabels: string[]): Promise<{ findings: Finding[]; urlsChecked: number }> {
  const findings: Finding[] = [];
  let urlsChecked = 0;

  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();

  for (const weekLabel of weekLabels) {
    const digest = await loadDigest(weekLabel);
    if (!digest) continue;
    urlsChecked++;

    const url = `${baseUrl}/digest/${weekLabelToSlug(weekLabel)}`;
    const dateRange = formatDateRange(digest.startISO, digest.endISO);
    // renderedWeekTitle() is what the page actually emits. The auditor used to
    // re-derive it by appending the layout's template suffix, which silently
    // became wrong the moment digest titles switched to `title.absolute`.
    const renderedTitle = renderedWeekTitle(dateRange);
    const description = buildWeekMetaDescription(digest, dateRange);

    if (renderedTitle.length > TITLE_MAX_RENDERED) {
      findings.push(makeFinding({
        scope: url,
        code: 'STATIC_TITLE_LENGTH',
        severity: 'medium',
        category: 'onpage',
        title: `Title too long on ${weekLabel}`,
        detail: `Rendered title is ${renderedTitle.length} chars (max ${TITLE_MAX_RENDERED}): "${renderedTitle}"`,
        url,
        evidence: { length: renderedTitle.length, max: TITLE_MAX_RENDERED },
        recommendation: 'Shorten buildWeekTitle() in lib/seo/metaText.ts. Digest titles are emitted ' +
                        'with title.absolute, so the whole 60-character budget belongs to that ' +
                        'function — do not re-add the layout\'s brand suffix, which is what made ' +
                        'these titles 83-91 characters originally.',
      }));
    }

    if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
      findings.push(makeFinding({
        scope: url,
        code: 'STATIC_META_DESC_LENGTH',
        severity: description.length > DESCRIPTION_MAX ? 'medium' : 'low',
        category: 'onpage',
        title: `Description length out of range on ${weekLabel}`,
        detail: `Description is ${description.length} chars (want ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}): "${description}"`,
        url,
        evidence: { length: description.length, min: DESCRIPTION_MIN, max: DESCRIPTION_MAX },
        recommendation: 'Adjust buildWeekMetaDescription() truncation, or the underlying oneSentenceSummary length.',
      }));
    }

    if (digest.coverImageUrl && !digest.coverImageAlt) {
      findings.push(makeFinding({
        scope: url,
        code: 'STATIC_ALT_TEXT_MISSING',
        severity: 'medium',
        category: 'onpage',
        title: `Cover image missing alt text on ${weekLabel}`,
        detail: `digest.coverImageUrl is set but coverImageAlt is empty.`,
        url,
        recommendation: 'Generate coverImageAlt from coverKeywords + the week label.',
      }));
    }

    if (!titles.has(renderedTitle)) titles.set(renderedTitle, []);
    titles.get(renderedTitle)!.push(url);

    if (!descriptions.has(description)) descriptions.set(description, []);
    descriptions.get(description)!.push(url);
  }

  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      findings.push(makeFinding({
        scope: `dup-title:${title}`,
        code: 'STATIC_TITLE_DUPLICATE',
        severity: 'high',
        category: 'onpage',
        title: `Duplicate title across ${urls.length} pages`,
        detail: `"${title}" is used by: ${urls.join(', ')}`,
        evidence: { urls },
        recommendation: 'Each page should have a unique title — check buildWeekTitle() inputs for these weeks.',
      }));
    }
  }
  for (const [description, urls] of descriptions) {
    if (urls.length > 1) {
      findings.push(makeFinding({
        scope: `dup-desc:${description}`,
        code: 'STATIC_DESC_DUPLICATE',
        severity: 'high',
        category: 'onpage',
        title: `Duplicate description across ${urls.length} pages`,
        detail: `"${description}" is used by: ${urls.join(', ')}`,
        evidence: { urls },
        recommendation: 'Each page should have a unique description — likely a missing oneSentenceSummary for one of these weeks.',
      }));
    }
  }

  return { findings, urlsChecked };
}

/** Root markdown docs that still describe the old /week/* + vercel.app world. */
async function checkStaleDocs(): Promise<Finding[]> {
  const findings: Finding[] = [];
  const candidates = ['SEO_ROUTES.md', 'SEO_METADATA.md'];
  for (const doc of candidates) {
    try {
      const raw = await fs.readFile(path.join(REPO_ROOT, doc), 'utf-8');
      const hasStaleUrl = /\/week\/\d{4}-W|luxury-intelligence\.vercel\.app/.test(raw);
      if (hasStaleUrl) {
        findings.push(makeFinding({
          scope: doc,
          code: 'STATIC_DOC_STALE',
          severity: 'low',
          category: 'technical',
          title: `${doc} references stale URLs`,
          detail: `${doc} still mentions /week/* paths or the vercel.app fallback domain, both retired.`,
          recommendation: `Update ${doc} to describe /digest/{slug} URLs and the luxury-intel.com canonical domain.`,
        }));
      }
    } catch {
      // doc doesn't exist — nothing to flag
    }
  }
  return findings;
}

export interface StaticAuditResult {
  findings: Finding[];
  /** Distinct URLs examined by at least one check. */
  urlsAudited: number;
  /** URLs that got title/description checks — Stage 1 only covers digest pages. */
  urlsMetaChecked: number;
  coveredCategories: Category[];
}

export async function runStaticAudit(baseUrl: string): Promise<StaticAuditResult> {
  // Read the inventory and week list once and share them — each of these used
  // to re-read all ~40 digest files independently.
  const [entries, weekLabels] = await Promise.all([
    getIndexableUrls(baseUrl),
    getAvailableWeekLabels(DIGESTS_DIR),
  ]);

  const [staleDocs, metaText] = await Promise.all([
    checkStaleDocs(),
    checkDigestMetaText(baseUrl, weekLabels),
  ]);

  const findings = [
    ...checkSitemapReconciliation(baseUrl, entries, weekLabels),
    ...checkRobotsConflicts(baseUrl, entries),
    ...checkStaleLastModified(),
    ...staleDocs,
    ...metaText.findings,
  ];

  return {
    findings,
    urlsAudited: entries.length,
    urlsMetaChecked: metaText.urlsChecked,
    // Stage 1 checks these three only. structured-data, performance, and
    // opportunity need the live-HTTP and GSC stages before they can be claimed.
    coveredCategories: ['technical', 'onpage', 'indexing'],
  };
}
