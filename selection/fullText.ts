/**
 * Stage 5: full text for the shortlisted articles.
 * Spec: docs/superpowers/specs/2026-11-10-selection-funnel-design.md §5
 *
 * Body text is cached in data/cache/selection-fulltext/ (gitignored, one JSON
 * per URL hash). Never commit it.
 */
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetchNode from 'node-fetch';
import { extractText, detectPaywallInText, BROWSER_USER_AGENT } from '../discovery/fetchExtract';
import { scanDisclosures } from './hardFilters';
import type { FullTextResult, PaywallStatus } from './types';

export const FULLTEXT_MAX_CHARS = 12_000;
export const FULLTEXT_TIMEOUT_MS = 15_000;
export const FULLTEXT_CONCURRENCY = 6;
/** Bump to invalidate the on-disk cache. */
export const FULLTEXT_CACHE_VERSION = 1;
/** Below this many words the extraction is treated as a failed/stub page. */
export const FULLTEXT_MIN_WORDS = 80;
/** Text-pattern paywall hits only count on short bodies (a long article quoting "subscribe to" is not gated). */
const PAYWALL_TEXT_MAX_WORDS = 500;

export const FULLTEXT_CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'selection-fulltext');

/** Minimal response shape so tests can inject a fake fetch. */
export interface FetchLikeResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; redirect: 'follow' }
) => Promise<FetchLikeResponse>;

export interface FullTextOptions {
  fetchFn?: FetchLike;
  /** Cache directory; pass null to disable caching. Default data/cache/selection-fulltext. */
  cacheDir?: string | null;
  concurrency?: number;
  timeoutMs?: number;
  maxChars?: number;
}

/** Run `fn` over items with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function urlHash(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 20);
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function snippetResult(url: string, snippet: string, paywall: PaywallStatus, maxChars: number): FullTextResult {
  const text = (snippet || '').slice(0, maxChars);
  return { url, text, wordCount: countWords(text), paywall, status: 'snippet_only', disclosures: scanDisclosures(text) };
}

/** Fetch + extract one URL. Never throws. Exported for tests. */
export async function fetchOne(
  url: string,
  snippet: string,
  opts: FullTextOptions = {}
): Promise<FullTextResult> {
  const maxChars = opts.maxChars ?? FULLTEXT_MAX_CHARS;
  const timeoutMs = opts.timeoutMs ?? FULLTEXT_TIMEOUT_MS;
  const doFetch: FetchLike = opts.fetchFn ?? ((u, init) => fetchNode(u, init as any) as unknown as Promise<FetchLikeResponse>);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      return snippetResult(url, snippet, 'likely_paywalled', maxChars);
    }
    if (!res.ok) return snippetResult(url, snippet, 'unknown', maxChars);

    // Body read is bounded by the same abort timer on real fetches; race for injected ones.
    const html = await Promise.race([
      res.text(),
      new Promise<never>((_, rej) => controller.signal.addEventListener('abort', () => rej(new Error('timeout')))),
    ]);
    const extracted = extractText(html, url).text;
    const words = countWords(extracted);
    const gate = detectPaywallInText(extracted);
    const paywalled = gate.isPaywalled && words < PAYWALL_TEXT_MAX_WORDS;
    if (paywalled) return snippetResult(url, snippet, 'likely_paywalled', maxChars);
    if (words < FULLTEXT_MIN_WORDS) return snippetResult(url, snippet, 'unknown', maxChars);

    const text = extracted.slice(0, maxChars);
    return {
      url,
      text,
      wordCount: countWords(text),
      paywall: 'not_paywalled',
      status: 'fetched',
      disclosures: scanDisclosures(text),
    };
  } catch {
    return snippetResult(url, snippet, 'unknown', maxChars);
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(dir: string, url: string): Promise<FullTextResult | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, `${urlHash(url)}.json`), 'utf-8'));
    if (raw?.v === FULLTEXT_CACHE_VERSION && raw.result?.url === url) return raw.result as FullTextResult;
  } catch {
    /* miss */
  }
  return null;
}

async function writeCache(dir: string, url: string, result: FullTextResult): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${urlHash(url)}.json`),
      JSON.stringify({ v: FULLTEXT_CACHE_VERSION, fetchedAt: new Date().toISOString(), result }),
      'utf-8'
    );
  } catch {
    /* cache is best effort */
  }
}

export async function fetchFullTexts(
  entries: { url: string; snippet: string }[],
  opts: FullTextOptions = {}
): Promise<Map<string, FullTextResult>> {
  const cacheDir = opts.cacheDir === undefined ? FULLTEXT_CACHE_DIR : opts.cacheDir;
  const unique = [...new Map(entries.map(e => [e.url, e])).values()];
  const results = await mapLimit(unique, opts.concurrency ?? FULLTEXT_CONCURRENCY, async e => {
    if (cacheDir) {
      const hit = await readCache(cacheDir, e.url);
      if (hit) return hit;
    }
    const r = await fetchOne(e.url, e.snippet, opts);
    // Only successful fetches are cached; a transient failure must be retried next run.
    if (cacheDir && r.status === 'fetched') await writeCache(cacheDir, e.url, r);
    return r;
  });
  return new Map(results.map(r => [r.url, r]));
}
