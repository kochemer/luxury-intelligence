/**
 * Google's URL Inspection API — what Google itself says about each page.
 *
 * This is the most direct feedback loop available: rather than inferring
 * indexing problems from the page's own markup, it asks Google what it
 * actually did with the URL, and why. It reports things nothing else can —
 * most importantly when Google has chosen a *different* canonical from the one
 * the page declares, which silently prevents indexing and is invisible to any
 * local check.
 *
 * Quota is 2,000 inspections per day and 600 per minute per property. This
 * site has ~50 URLs, so a full sweep is cheap — but results are cached anyway,
 * because indexing state changes over days, not minutes.
 */

import type { GscClient } from './client';

export interface UrlInspectionResult {
  url: string;
  /** PASS | PARTIAL | FAIL | NEUTRAL | VERDICT_UNSPECIFIED */
  verdict: string;
  /** Google's plain-language state, e.g. "Submitted and indexed". */
  coverageState: string;
  robotsTxtState: string;
  indexingState: string;
  pageFetchState: string;
  lastCrawlTime: string | null;
  /** The canonical Google actually selected. */
  googleCanonical: string | null;
  /** The canonical the page declared. */
  userCanonical: string | null;
  /** Whether Google found this URL in a sitemap. */
  sitemaps: string[];
  error?: string;
}

/**
 * Inspect one URL. Never throws — a quota error or a transient failure on one
 * URL must not abandon the sweep.
 */
export async function inspectUrl(client: GscClient, url: string): Promise<UrlInspectionResult> {
  const empty: UrlInspectionResult = {
    url,
    verdict: 'VERDICT_UNSPECIFIED',
    coverageState: 'Unknown',
    robotsTxtState: 'UNKNOWN',
    indexingState: 'UNKNOWN',
    pageFetchState: 'UNKNOWN',
    lastCrawlTime: null,
    googleCanonical: null,
    userCanonical: null,
    sitemaps: [],
  };

  try {
    const res = await client.api.urlInspection.index.inspect({
      requestBody: { inspectionUrl: url, siteUrl: client.siteUrl, languageCode: 'en-GB' },
    });

    const index = res.data.inspectionResult?.indexStatusResult;
    if (!index) return { ...empty, error: 'No indexStatusResult returned.' };

    return {
      url,
      verdict: index.verdict ?? 'VERDICT_UNSPECIFIED',
      coverageState: index.coverageState ?? 'Unknown',
      robotsTxtState: index.robotsTxtState ?? 'UNKNOWN',
      indexingState: index.indexingState ?? 'UNKNOWN',
      pageFetchState: index.pageFetchState ?? 'UNKNOWN',
      lastCrawlTime: index.lastCrawlTime ?? null,
      googleCanonical: index.googleCanonical ?? null,
      userCanonical: index.userCanonical ?? null,
      sitemaps: index.sitemap ?? [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...empty, error: message };
  }
}

/**
 * Inspect many URLs, serially with a small delay.
 *
 * Deliberately not parallel: the per-minute quota is the binding constraint,
 * and a burst that trips it returns errors for every URL rather than data.
 * Slow and complete beats fast and empty.
 */
export async function inspectUrls(
  client: GscClient,
  urls: string[],
  onProgress?: (done: number, total: number) => void
): Promise<UrlInspectionResult[]> {
  const results: UrlInspectionResult[] = [];

  for (const [i, url] of urls.entries()) {
    results.push(await inspectUrl(client, url));
    onProgress?.(i + 1, urls.length);
    if (i < urls.length - 1) await new Promise(r => setTimeout(r, 120));
  }

  return results;
}
