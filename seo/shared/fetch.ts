/**
 * Page fetching and bounded concurrency — one implementation.
 *
 * Three copies of this existed, and they had already diverged in the way that
 * mattered most: liveAudit's returned the failure so it could be reported,
 * while linkGraph's and assetAudit's returned null and let the caller skip the
 * page silently. That difference produced a real bug — an unfetched page
 * contributes no outbound links, so its link targets looked like orphans.
 *
 * So `fetchPage` here always reports *why* it failed. Callers may choose to
 * ignore that, but they cannot fail to be told.
 */

import fetch from 'node-fetch';
import { analyzeHtml, type PageAnalysis } from '../audit/analyzeHtml';
import { LIVE_TIMEOUT_MS, LIVE_USER_AGENT } from '../config';

export interface FetchOutcome {
  url: string;
  /** 0 when the request never completed. */
  status: number;
  /** Present only on a 3xx, from the Location header. */
  location: string | null;
  html: string | null;
  /** Null on success. Always populated when html is null and status is 0. */
  error: string | null;
}

export interface AnalysedPage {
  url: string;
  /** Null when the page could not be fetched or parsed — check `error`. */
  analysis: PageAnalysis | null;
  error: string | null;
  status: number;
}

/**
 * Fetch one page.
 *
 * `redirect: 'manual'` because a URL in the sitemap should be final; a
 * redirect is itself a finding, not something to follow silently.
 */
export async function fetchPage(url: string): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: 'manual',
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

/** Fetch and parse a page, keeping the reason on failure rather than dropping it. */
export async function fetchAndAnalyse(url: string): Promise<AnalysedPage> {
  const outcome = await fetchPage(url);

  if (outcome.error) {
    return { url, analysis: null, error: outcome.error, status: outcome.status };
  }
  if (outcome.status !== 200 || !outcome.html) {
    return { url, analysis: null, error: `HTTP ${outcome.status}`, status: outcome.status };
  }

  try {
    return { url, analysis: analyzeHtml(outcome.html, url), error: null, status: outcome.status };
  } catch (err) {
    return {
      url,
      analysis: null,
      error: `parse failed: ${err instanceof Error ? err.message : String(err)}`,
      status: outcome.status,
    };
  }
}

/**
 * Fixed-size worker pool.
 *
 * Deliberately not Promise.all over everything: these audits point at
 * production, and 50+ simultaneous requests from a monitoring tool is
 * indistinguishable from a small denial of service.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
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
