/**
 * Findings derived from what Google itself reports — not from inspecting our
 * own markup.
 *
 * This is the only audit that can see the problems that matter most, because
 * they are invisible locally: a page whose markup is perfect but which Google
 * declined to index, a canonical Google overrode with a different choice, or a
 * sitemap that serves correctly but which Google has quietly stopped reading.
 */

import { createHash } from 'crypto';
import { getGscClient, type GscClient } from '../gsc/client';
import { inspectUrls, type UrlInspectionResult } from '../gsc/urlInspection';
import { getIndexableUrls } from '@/lib/seo/urlInventory';
import { SITEMAP_STALE_DAYS, SITEMAP_COUNT_DRIFT } from '../config';
import type { Finding, Category } from '../types';

function makeFinding(
  partial: Omit<Finding, 'id' | 'score' | 'firstSeenWeek' | 'weeksOpen'> & { scope: string }
): Finding {
  const { scope, ...rest } = partial;
  const hash = createHash('sha1').update(scope).digest('hex').slice(0, 8);
  return { ...rest, id: `${rest.code}:${hash}`, score: 0, firstSeenWeek: '', weeksOpen: 1 };
}

/** Coverage states that mean "Google has this page indexed". */
function isIndexed(coverageState: string): boolean {
  return /submitted and indexed|indexed, not submitted/i.test(coverageState);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Strip a trailing slash so "https://x.com" and "https://x.com/" compare equal. */
function normaliseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Per-URL findings from Google's own verdict on each page. */
function findingsFromInspection(result: UrlInspectionResult): Finding[] {
  const findings: Finding[] = [];
  const url = result.url;

  if (result.error) {
    // Quota or transient failure — worth knowing, not worth alarming about.
    return [makeFinding({
      scope: url, code: 'GSC_INSPECTION_FAILED', severity: 'info', category: 'indexing',
      title: 'Could not inspect this URL',
      detail: `Google's URL Inspection API returned an error for ${url}: ${result.error}`,
      url, recommendation: 'Usually a quota limit. Re-run later; no action needed if it resolves.',
    })];
  }

  // The highest-value signal here: Google picked a different canonical from the
  // one the page declares. The page then usually will not be indexed in its own
  // right, and nothing in the page's own markup reveals the disagreement.
  //
  // Compared after normalising the trailing slash. Google reports the homepage
  // as "https://luxury-intel.com" while the page declares
  // "https://luxury-intel.com/" — the same URL, and flagging it was a false
  // positive on the first real run.
  if (result.googleCanonical && result.userCanonical &&
      normaliseUrl(result.googleCanonical) !== normaliseUrl(result.userCanonical)) {
    findings.push(makeFinding({
      scope: url, code: 'GSC_CANONICAL_OVERRIDDEN', severity: 'high', category: 'indexing',
      title: 'Google chose a different canonical than the page declares',
      detail: `${url} declares "${result.userCanonical}" but Google selected ` +
              `"${result.googleCanonical}". Google treats this page as a duplicate of that one.`,
      url,
      evidence: { declared: result.userCanonical, googleChose: result.googleCanonical },
      recommendation: 'Either accept Google\'s choice and remove this URL from the sitemap, or ' +
                      'differentiate the page enough that Google indexes it separately.',
    }));
  }

  if (result.robotsTxtState === 'DISALLOWED') {
    findings.push(makeFinding({
      scope: url, code: 'GSC_BLOCKED_BY_ROBOTS', severity: 'critical', category: 'indexing',
      title: 'Google is blocked from crawling this page',
      detail: `Google reports robots.txt DISALLOWED for ${url}, but it is in your sitemap.`,
      url, recommendation: 'Remove the disallow rule, or remove the URL from the sitemap.',
    }));
  }

  if (/BLOCKED_BY/.test(result.indexingState)) {
    findings.push(makeFinding({
      scope: url, code: 'GSC_INDEXING_BLOCKED', severity: 'critical', category: 'indexing',
      title: 'Page explicitly tells Google not to index it',
      detail: `Google reports indexingState "${result.indexingState}" for ${url}.`,
      url, evidence: { indexingState: result.indexingState },
      recommendation: 'Remove the noindex directive, or remove the URL from the sitemap.',
    }));
  }

  // A page Google never fetched reports PAGE_FETCH_STATE_UNSPECIFIED — that is
  // an absence of data, not a fetch failure, and reporting it as a problem
  // double-counted all 25 never-crawled pages on the first real run. Only a
  // genuine, named failure state counts.
  const FETCH_OK = new Set(['SUCCESSFUL', 'UNKNOWN', 'PAGE_FETCH_STATE_UNSPECIFIED']);
  if (result.lastCrawlTime && !FETCH_OK.has(result.pageFetchState)) {
    findings.push(makeFinding({
      scope: url, code: 'GSC_FETCH_PROBLEM', severity: 'high', category: 'indexing',
      title: `Google could not fetch this page cleanly (${result.pageFetchState})`,
      detail: `Google reports pageFetchState "${result.pageFetchState}" for ${url}.`,
      url, evidence: { pageFetchState: result.pageFetchState },
      recommendation: 'A soft 404 or fetch error means Google saw something different from a healthy page.',
    }));
  }

  if (!result.lastCrawlTime) {
    // High, not medium: a sitemap URL Google has never fetched effectively does
    // not exist to Google. That is an indexing failure, not an imperfection.
    findings.push(makeFinding({
      scope: url, code: 'GSC_NEVER_CRAWLED', severity: 'high', category: 'indexing',
      title: 'Google has never crawled this page',
      detail: `${url} is in your sitemap but Google reports no crawl at all, so it cannot be indexed.`,
      url,
      // Note: internal linking has been measured on this site and is healthy
      // (every page has 3+ inbound links, no orphans — see
      // seo/optimize/linkGraph.ts). So the usual "weak internal linking"
      // advice does not apply here; the stale sitemap and crawl budget are the
      // live explanations. Run `npm run seo:optimize` to re-check that premise
      // before acting on linking advice.
      recommendation: 'Check the sitemap is being re-read (npm run seo:indexing) and that the page ' +
                      'has inbound links (npm run seo:optimize). If both are fine, this is crawl ' +
                      'budget — Google deprioritises crawling on low-traffic sites, and it resolves ' +
                      'as authority grows rather than through a code change.',
    }));
  } else if (!isIndexed(result.coverageState)) {
    // Google crawled it and decided not to index it. Its own wording is the
    // most useful thing we can report, so pass it through verbatim.
    findings.push(makeFinding({
      scope: url, code: 'GSC_NOT_INDEXED', severity: 'high', category: 'indexing',
      title: `Google is not indexing this page: "${result.coverageState}"`,
      detail: `${url} was last crawled ${daysSince(result.lastCrawlTime)} days ago, ` +
              `and Google's state for it is "${result.coverageState}" (verdict ${result.verdict}).`,
      url,
      evidence: { coverageState: result.coverageState, verdict: result.verdict, lastCrawl: result.lastCrawlTime },
      recommendation: '"Crawled – currently not indexed" usually means Google judged the page ' +
                      'thin or duplicative. "Discovered – not indexed" usually means crawl budget.',
    }));
  }

  return findings;
}

/**
 * Sitemap health, as Google sees it.
 *
 * A sitemap can serve perfectly and still be useless: Google may have stopped
 * re-fetching it, in which case every page published since the last download
 * has never been announced.
 */
async function sitemapFindings(client: GscClient, liveUrlCount: number): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const res = await client.api.sitemaps.list({ siteUrl: client.siteUrl });
    const sitemaps = res.data.sitemap ?? [];

    if (sitemaps.length === 0) {
      return [makeFinding({
        scope: 'sitemap:none', code: 'GSC_SITEMAP_NOT_SUBMITTED', severity: 'high', category: 'indexing',
        title: 'No sitemap is submitted to Search Console',
        detail: 'Search Console has no sitemap on file for this property.',
        recommendation: 'Submit https://luxury-intel.com/sitemap.xml in Search Console.',
      })];
    }

    for (const sitemap of sitemaps) {
      const path = sitemap.path ?? '(unknown)';
      const age = daysSince(sitemap.lastDownloaded ?? null);

      if (age !== null && age > SITEMAP_STALE_DAYS) {
        findings.push(makeFinding({
          scope: `sitemap-stale:${path}`, code: 'GSC_SITEMAP_STALE', severity: 'high', category: 'indexing',
          title: `Google last read your sitemap ${age} days ago`,
          detail: `${path} was last downloaded by Google on ${sitemap.lastDownloaded}. ` +
                  `Pages published since then have never been announced through it.`,
          evidence: { lastDownloaded: sitemap.lastDownloaded, ageDays: age },
          recommendation: 'Re-submit the sitemap so Google re-reads it, and keep pinging IndexNow on publish.',
        }));
      }

      const submitted = Number(sitemap.contents?.[0]?.submitted ?? 0);
      if (submitted > 0 && liveUrlCount - submitted >= SITEMAP_COUNT_DRIFT) {
        findings.push(makeFinding({
          scope: `sitemap-drift:${path}`, code: 'GSC_SITEMAP_COUNT_DRIFT', severity: 'high', category: 'indexing',
          title: `Google has ${submitted} URLs on record; the sitemap now serves ${liveUrlCount}`,
          detail: `Google's copy of ${path} is out of date by ${liveUrlCount - submitted} URLs — ` +
                  `strong evidence it has not been re-read since those pages were published.`,
          evidence: { googleHas: submitted, actual: liveUrlCount },
          recommendation: 'Re-submit the sitemap to force a re-read.',
        }));
      }

      if (Number(sitemap.errors ?? 0) > 0) {
        findings.push(makeFinding({
          scope: `sitemap-errors:${path}`, code: 'GSC_SITEMAP_ERRORS', severity: 'critical', category: 'indexing',
          title: `Google reports ${sitemap.errors} error(s) in your sitemap`,
          detail: `${path} has ${sitemap.errors} errors and ${sitemap.warnings ?? 0} warnings.`,
          recommendation: 'Open the Sitemaps report in Search Console for the specific errors.',
        }));
      }
    }
  } catch (err) {
    findings.push(makeFinding({
      scope: 'sitemap:error', code: 'GSC_SITEMAP_CHECK_FAILED', severity: 'info', category: 'indexing',
      title: 'Could not read sitemap status from Search Console',
      detail: err instanceof Error ? err.message : String(err),
      recommendation: 'Usually transient. Re-run later.',
    }));
  }

  return findings;
}

export interface IndexingAuditResult {
  findings: Finding[];
  inspected: number;
  coveredCategories: Category[];
  /** Raw results, kept so a snapshot can record what Google said. */
  inspections: UrlInspectionResult[];
}

export async function runIndexingAudit(
  baseUrl: string,
  onProgress?: (done: number, total: number) => void
): Promise<IndexingAuditResult | null> {
  const client = getGscClient();
  if (!client) return null;

  const entries = await getIndexableUrls(baseUrl);
  const urls = entries.map(e => e.url);

  const inspections = await inspectUrls(client, urls, onProgress);
  const findings = [
    ...(await sitemapFindings(client, urls.length)),
    ...inspections.flatMap(findingsFromInspection),
  ];

  return {
    findings,
    inspected: inspections.length,
    coveredCategories: ['indexing'],
    inspections,
  };
}
