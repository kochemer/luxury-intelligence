/**
 * Repo-static SEO checks — no network calls. Reads digest JSON, the sitemap
 * inventory, and robots rules directly, and evaluates the same title/description
 * builders the live pages use (lib/seo/metaText.ts) so findings match reality.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getIndexableUrls, getAvailableWeekLabels } from '@/lib/seo/urlInventory';
import { buildWeekTitle, buildWeekMetaDescription, DIGEST_TITLE_SUFFIX } from '@/lib/seo/metaText';
import { formatDateRange } from '@/lib/utils/formatDate';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';
import robots from '../../app/robots';
import {
  TITLE_MAX_RENDERED,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  STATIC_PAGE_LAST_MODIFIED_MAX_AGE_MONTHS,
} from '../config';
import type { Finding } from '../types';
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
async function checkSitemapReconciliation(baseUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const weekLabels = await getAvailableWeekLabels(DIGESTS_DIR);
  const entries = await getIndexableUrls(baseUrl);
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
async function checkRobotsConflicts(baseUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const robotsConfig = robots();
  const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules : [robotsConfig.rules];
  const disallowedPaths = rules
    .flatMap(r => (Array.isArray(r?.disallow) ? r.disallow : r?.disallow ? [r.disallow] : []))
    .filter((p): p is string => typeof p === 'string');

  if (disallowedPaths.length === 0) return findings;

  const entries = await getIndexableUrls(baseUrl);
  for (const entry of entries) {
    const urlPath = entry.url.replace(baseUrl, '') || '/';
    const conflict = disallowedPaths.find(p => urlPath === p || urlPath.startsWith(p));
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
  const hardcoded = new Date('2026-06-02');
  const ageMonths = (Date.now() - hardcoded.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (ageMonths <= STATIC_PAGE_LAST_MODIFIED_MAX_AGE_MONTHS) return [];
  return [makeFinding({
    scope: 'lib/seo/urlInventory.ts:STATIC_PAGE_LAST_MODIFIED',
    code: 'STATIC_SITEMAP_STALE_LASTMOD',
    severity: 'medium',
    category: 'technical',
    title: 'Static-page sitemap lastModified date is stale',
    detail: `STATIC_PAGE_LAST_MODIFIED is ${hardcoded.toISOString().slice(0, 10)}, which is over ${STATIC_PAGE_LAST_MODIFIED_MAX_AGE_MONTHS} months old.`,
    recommendation: 'If /about, /methodology, /subscribe, /feedback, or /support changed recently, bump the constant in lib/seo/urlInventory.ts.',
  })];
}

/** Title/description length and duplicate checks across all digest pages. */
async function checkDigestMetaText(baseUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const weekLabels = await getAvailableWeekLabels(DIGESTS_DIR);

  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();

  for (const weekLabel of weekLabels) {
    const digest = await loadDigest(weekLabel);
    if (!digest) continue;

    const url = `${baseUrl}/digest/${weekLabelToSlug(weekLabel)}`;
    const dateRange = formatDateRange(digest.startISO, digest.endISO);
    const title = buildWeekTitle(dateRange);
    const renderedTitle = `${title}${DIGEST_TITLE_SUFFIX}`;
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
        recommendation: 'Shorten the title template, or add a per-week seoTitle override once Stage 4 ships.',
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

    (titles.get(renderedTitle) ?? titles.set(renderedTitle, []).get(renderedTitle)!).push(url);
    (descriptions.get(description) ?? descriptions.set(description, []).get(description)!).push(url);
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

  return findings;
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

export async function runStaticAudit(baseUrl: string): Promise<Finding[]> {
  const [reconciliation, robotsConflicts, staleDocs, metaText] = await Promise.all([
    checkSitemapReconciliation(baseUrl),
    checkRobotsConflicts(baseUrl),
    checkStaleDocs(),
    checkDigestMetaText(baseUrl),
  ]);

  return [
    ...reconciliation,
    ...robotsConflicts,
    ...checkStaleLastModified(),
    ...staleDocs,
    ...metaText,
  ];
}
