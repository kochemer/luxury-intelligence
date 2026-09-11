/**
 * Live HTTP checks against the deployed site — verifies what Google actually
 * sees, as opposed to what the repo implies it should see.
 *
 * This is the stage that closes the biggest honesty gap in the Stage 1 report,
 * which could only ever say "nothing in this run fetched a page."
 *
 * Network failures produce findings, never exceptions: an unreachable site is
 * itself the most important thing this audit can report.
 */

import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { analyzeHtml, type PageAnalysis } from './analyzeHtml';
import { getIndexableUrls, type IndexableUrlEntry } from '@/lib/seo/urlInventory';
import {
  TITLE_MAX_RENDERED,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  LIVE_CONCURRENCY,
  LIVE_TIMEOUT_MS,
  LIVE_USER_AGENT,
} from '../config';
import type { Finding, Category } from '../types';

function findingId(code: string, scope: string): string {
  return `${code}:${createHash('sha1').update(scope).digest('hex').slice(0, 8)}`;
}

function makeFinding(
  partial: Omit<Finding, 'id' | 'score' | 'firstSeenWeek' | 'weeksOpen'> & { scope: string }
): Finding {
  const { scope, ...rest } = partial;
  return { ...rest, id: findingId(rest.code, scope), score: 0, firstSeenWeek: '', weeksOpen: 1 };
}

interface FetchResult {
  url: string;
  status: number;
  /** Final URL after any redirect, when the server sent one. */
  location: string | null;
  html: string | null;
  error: string | null;
}

async function fetchPage(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'manual', // a sitemap URL should be final; catch redirects as findings
      headers: { 'User-Agent': LIVE_USER_AGENT },
      signal: controller.signal as never,
    });
    const isRedirect = res.status >= 300 && res.status < 400;
    return {
      url,
      status: res.status,
      location: res.headers.get('location'),
      html: isRedirect ? null : await res.text(),
      error: null,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      location: null,
      html: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Simple fixed-size worker pool — avoids hammering the site with 50+ parallel requests. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Which schema.org types we expect to be present, by route class. */
function expectedJsonLdTypes(entry: IndexableUrlEntry): string[] {
  if (entry.kind === 'digest') return ['Article', 'BreadcrumbList'];
  return [];
}

function checkPage(entry: IndexableUrlEntry, result: FetchResult, analysis: PageAnalysis | null): Finding[] {
  const findings: Finding[] = [];
  const url = entry.url;
  const add = (
    code: string,
    severity: Finding['severity'],
    category: Category,
    title: string,
    detail: string,
    recommendation: string,
    evidence?: Record<string, unknown>
  ) => findings.push(makeFinding({ scope: url, code, severity, category, title, detail, url, recommendation, evidence }));

  if (result.error) {
    add('LIVE_FETCH_FAILED', 'critical', 'indexing',
      'Page could not be fetched',
      `Request to ${url} failed: ${result.error}`,
      'Confirm the site is reachable and the URL is correct. If this is a transient network error, re-run the audit.');
    return findings;
  }

  if (result.status >= 300 && result.status < 400) {
    add('LIVE_UNEXPECTED_REDIRECT', 'high', 'indexing',
      'Sitemap URL redirects',
      `${url} returned ${result.status} → ${result.location ?? '(no Location header)'}. Sitemaps should list final URLs only.`,
      'Either list the redirect target in the sitemap instead, or stop redirecting this URL.',
      { status: result.status, location: result.location });
    return findings;
  }

  if (result.status !== 200) {
    add('LIVE_NON_200', 'critical', 'indexing',
      `Sitemap URL returned ${result.status}`,
      `${url} returned HTTP ${result.status}. A URL in the sitemap that doesn't return 200 wastes crawl budget and can be dropped from the index.`,
      'Fix the page or remove it from the sitemap.',
      { status: result.status });
    return findings;
  }

  if (!analysis) return findings;

  // ── Indexability ────────────────────────────────────────────────────────
  if (analysis.noindex) {
    add('LIVE_NOINDEX_ON_INDEXABLE', 'critical', 'indexing',
      'Page is in the sitemap but marked noindex',
      `${url} serves <meta name="robots" content="${analysis.robotsMeta}">, telling Google not to index a page the sitemap asks it to index.`,
      'Remove the noindex, or remove the URL from the sitemap. The two must agree.',
      { robotsMeta: analysis.robotsMeta });
  }

  if (!analysis.canonical) {
    add('LIVE_CANONICAL_MISSING', 'high', 'indexing',
      'No canonical tag',
      `${url} renders no <link rel="canonical">.`,
      'Add an absolute canonical URL via generateMetadata alternates.canonical.');
  } else if (analysis.canonical !== url) {
    // A canonical pointing elsewhere means this URL is asking not to be indexed
    // in its own right — serious when the sitemap lists it.
    add('LIVE_CANONICAL_MISMATCH', 'critical', 'indexing',
      'Canonical points to a different URL',
      `${url} declares canonical "${analysis.canonical}". A sitemap URL whose canonical points elsewhere will usually not be indexed.`,
      'Make the canonical self-referential, or remove this URL from the sitemap.',
      { canonical: analysis.canonical, requested: url });
  }

  // ── Title & description as actually rendered ────────────────────────────
  if (!analysis.title) {
    add('LIVE_TITLE_MISSING', 'critical', 'onpage',
      'No <title>', `${url} renders no title element.`,
      'Add a title via generateMetadata.');
  } else if (analysis.title.length > TITLE_MAX_RENDERED) {
    add('LIVE_TITLE_LENGTH', 'medium', 'onpage',
      'Rendered title is too long',
      `${url} renders a ${analysis.title.length}-char title (max ${TITLE_MAX_RENDERED}): "${analysis.title}"`,
      'Shorten the title so Google does not truncate it in results.',
      { length: analysis.title.length, title: analysis.title });
  }

  if (!analysis.description) {
    add('LIVE_DESC_MISSING', 'high', 'onpage',
      'No meta description', `${url} renders no meta description.`,
      'Add a description via generateMetadata.');
  } else if (analysis.description.length > DESCRIPTION_MAX || analysis.description.length < DESCRIPTION_MIN) {
    add('LIVE_DESC_LENGTH', 'low', 'onpage',
      'Rendered description length out of range',
      `${url} renders a ${analysis.description.length}-char description (want ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}).`,
      'Adjust the description so it reads well in search results without truncation.',
      { length: analysis.description.length });
  }

  // ── Headings ────────────────────────────────────────────────────────────
  if (analysis.h1s.length === 0) {
    add('LIVE_H1_MISSING', 'medium', 'onpage',
      'No <h1>', `${url} renders no h1 heading.`,
      'Add a single descriptive h1 that reflects the page topic.');
  } else if (analysis.h1s.length > 1) {
    add('LIVE_H1_MULTIPLE', 'low', 'onpage',
      `Multiple <h1> elements (${analysis.h1s.length})`,
      `${url} renders ${analysis.h1s.length} h1 elements: ${analysis.h1s.map(h => `"${h}"`).join(', ')}`,
      'Prefer exactly one h1 per page; demote the others to h2.',
      { h1s: analysis.h1s });
  }

  // ── Structured data ─────────────────────────────────────────────────────
  for (const block of analysis.jsonLd) {
    if (block.data === null) {
      add('LIVE_JSONLD_INVALID', 'high', 'structured-data',
        'Invalid JSON-LD block',
        `${url} has a application/ld+json block that fails to parse: ${block.parseError}`,
        'Fix the JSON syntax — an unparseable block is ignored entirely by Google.',
        { parseError: block.parseError });
    }
  }

  const presentTypes = new Set(analysis.jsonLd.flatMap(b => b.types));
  for (const expected of expectedJsonLdTypes(entry)) {
    if (!presentTypes.has(expected)) {
      add(`LIVE_JSONLD_MISSING_${expected.toUpperCase()}`, 'medium', 'structured-data',
        `Missing ${expected} structured data`,
        `${url} renders no ${expected} JSON-LD. Present types: ${[...presentTypes].join(', ') || '(none)'}`,
        `Emit a ${expected} block via the JsonLd component.`,
        { presentTypes: [...presentTypes] });
    }
  }

  // ── Images ──────────────────────────────────────────────────────────────
  if (analysis.imagesMissingAlt.length > 0) {
    add('LIVE_IMG_ALT_MISSING', 'low', 'onpage',
      `${analysis.imagesMissingAlt.length} image(s) missing alt text`,
      `${url} has ${analysis.imagesMissingAlt.length} of ${analysis.imageCount} images without alt text: ${analysis.imagesMissingAlt.slice(0, 3).join(', ')}${analysis.imagesMissingAlt.length > 3 ? '…' : ''}`,
      'Add descriptive alt text, or mark purely decorative images aria-hidden="true".',
      { missing: analysis.imagesMissingAlt.slice(0, 10), total: analysis.imageCount });
  }

  // ── hreflang reciprocity ────────────────────────────────────────────────
  // Only checked where the sitemap declares alternates for this URL.
  if (entry.alternates?.languages) {
    for (const [lang, href] of Object.entries(entry.alternates.languages)) {
      if (!analysis.hreflang[lang]) {
        add('LIVE_HREFLANG_MISSING', 'medium', 'technical',
          `Missing hreflang="${lang}" on page`,
          `The sitemap declares an "${lang}" alternate (${href}) for ${url}, but the page renders no matching hreflang link.`,
          'Emit matching alternates.languages in the page metadata so the sitemap and page agree.',
          { lang, expected: href, rendered: analysis.hreflang });
        break; // one finding per URL is enough; the fix is the same for all langs
      }
    }
  }

  return findings;
}

/** Site-level checks: robots.txt and sitemap.xml must themselves be healthy. */
async function checkSiteFiles(baseUrl: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const robotsRes = await fetchPage(`${baseUrl}/robots.txt`);
  if (robotsRes.error || robotsRes.status !== 200) {
    findings.push(makeFinding({
      scope: `${baseUrl}/robots.txt`,
      code: 'LIVE_ROBOTS_UNREACHABLE', severity: 'critical', category: 'technical',
      title: 'robots.txt is not reachable',
      detail: `${baseUrl}/robots.txt returned ${robotsRes.error ?? `HTTP ${robotsRes.status}`}.`,
      url: `${baseUrl}/robots.txt`,
      recommendation: 'robots.txt must return 200 — without it crawlers fall back to unpredictable defaults.',
    }));
  } else if (!/^\s*Sitemap:\s*http/im.test(robotsRes.html ?? '')) {
    findings.push(makeFinding({
      scope: `${baseUrl}/robots.txt#sitemap`,
      code: 'LIVE_ROBOTS_NO_SITEMAP', severity: 'high', category: 'technical',
      title: 'robots.txt declares no Sitemap',
      detail: `${baseUrl}/robots.txt is served but contains no absolute "Sitemap:" line.`,
      url: `${baseUrl}/robots.txt`,
      recommendation: 'Add the absolute sitemap URL to robots.ts so crawlers can discover it.',
    }));
  }

  const sitemapRes = await fetchPage(`${baseUrl}/sitemap.xml`);
  if (sitemapRes.error || sitemapRes.status !== 200 || !/<urlset|<sitemapindex/i.test(sitemapRes.html ?? '')) {
    findings.push(makeFinding({
      scope: `${baseUrl}/sitemap.xml`,
      code: 'LIVE_SITEMAP_UNPARSEABLE', severity: 'critical', category: 'technical',
      title: 'sitemap.xml is missing or not valid XML',
      detail: `${baseUrl}/sitemap.xml returned ${sitemapRes.error ?? `HTTP ${sitemapRes.status}`} and no <urlset> element was found.`,
      url: `${baseUrl}/sitemap.xml`,
      recommendation: 'The sitemap must return 200 with a valid <urlset> document.',
    }));
  }

  return findings;
}

export interface LiveAuditResult {
  findings: Finding[];
  urlsFetched: number;
  coveredCategories: Category[];
}

export async function runLiveAudit(baseUrl: string): Promise<LiveAuditResult> {
  const entries = await getIndexableUrls(baseUrl);

  const [siteFileFindings, pageResults] = await Promise.all([
    checkSiteFiles(baseUrl),
    mapWithConcurrency(entries, LIVE_CONCURRENCY, async (entry) => {
      const result = await fetchPage(entry.url);
      const analysis = result.html ? analyzeHtml(result.html, entry.url) : null;
      return { entry, result, analysis };
    }),
  ]);

  const findings = [...siteFileFindings];
  for (const { entry, result, analysis } of pageResults) {
    findings.push(...checkPage(entry, result, analysis));
  }

  // Cross-page duplicate detection on what's actually rendered.
  const byTitle = new Map<string, string[]>();
  const byDescription = new Map<string, string[]>();
  for (const { entry, analysis } of pageResults) {
    if (analysis?.title) {
      if (!byTitle.has(analysis.title)) byTitle.set(analysis.title, []);
      byTitle.get(analysis.title)!.push(entry.url);
    }
    if (analysis?.description) {
      if (!byDescription.has(analysis.description)) byDescription.set(analysis.description, []);
      byDescription.get(analysis.description)!.push(entry.url);
    }
  }

  for (const [title, urls] of byTitle) {
    if (urls.length > 1) {
      findings.push(makeFinding({
        scope: `live-dup-title:${title}`,
        code: 'LIVE_TITLE_DUPLICATE', severity: 'high', category: 'onpage',
        title: `Duplicate rendered title across ${urls.length} pages`,
        detail: `"${title}" is served by: ${urls.join(', ')}`,
        evidence: { urls },
        recommendation: 'Give each page a distinct title — duplicates compete with each other in search results.',
      }));
    }
  }
  for (const [description, urls] of byDescription) {
    if (urls.length > 1) {
      findings.push(makeFinding({
        scope: `live-dup-desc:${description}`,
        code: 'LIVE_DESC_DUPLICATE', severity: 'medium', category: 'onpage',
        title: `Duplicate rendered description across ${urls.length} pages`,
        detail: `"${description}" is served by: ${urls.join(', ')}`,
        evidence: { urls },
        recommendation: 'Give each page a distinct description.',
      }));
    }
  }

  return {
    findings,
    urlsFetched: entries.length,
    coveredCategories: ['technical', 'onpage', 'indexing', 'structured-data'],
  };
}
