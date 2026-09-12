/**
 * Image and asset weight — the Core Web Vitals half of the rubric.
 *
 * From the `seo-audit` skill's Image Optimization and Site Speed sections:
 * compressed file sizes, modern formats, lazy loading, responsive images.
 *
 * This exists because none of the HTML-shaped checks can see weight. A 2.5 MB
 * hero renders identically to a 60 KB one in the markup — the only way to
 * catch it is to ask the server how many bytes it is. On this site that check
 * found 38 cover images averaging 2.5 MB, one loaded on every digest page,
 * which nothing else had noticed.
 *
 * Largest Contentful Paint is a ranking signal, so this is SEO work, not just
 * performance hygiene.
 */

import { createHash } from 'crypto';
import { analyzeHtml, type PageAnalysis } from '../audit/analyzeHtml';
import { getIndexableUrls } from '@/lib/seo/urlInventory';
import {
  LIVE_CONCURRENCY,
  LIVE_TIMEOUT_MS,
  LIVE_USER_AGENT,
  IMAGE_HEAVY_BYTES,
  IMAGE_CRITICAL_BYTES,
} from '../config';
import type { Finding, Category } from '../types';

function makeFinding(
  partial: Omit<Finding, 'id' | 'score' | 'firstSeenWeek' | 'weeksOpen'> & { scope: string }
): Finding {
  const { scope, ...rest } = partial;
  const hash = createHash('sha1').update(scope).digest('hex').slice(0, 8);
  return { ...rest, id: `${rest.code}:${hash}`, score: 0, firstSeenWeek: '', weeksOpen: 1 };
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

/** Ask for an asset's size without downloading it. */
async function measureAsset(url: string): Promise<{ bytes: number; type: string } | null> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': LIVE_USER_AGENT },
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return {
      bytes: Number(res.headers.get('content-length') ?? 0),
      type: res.headers.get('content-type') ?? 'unknown',
    };
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchPage(url: string): Promise<PageAnalysis | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': LIVE_USER_AGENT },
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return analyzeHtml(await res.text(), url);
  } catch {
    return null;
  }
}

export interface AssetAuditResult {
  findings: Finding[];
  pagesAnalysed: number;
  assetsMeasured: number;
  coveredCategories: Category[];
}

export async function runAssetAudit(baseUrl: string): Promise<AssetAuditResult> {
  const entries = await getIndexableUrls(baseUrl);
  const analyses = await mapWithConcurrency(
    entries.map(e => e.url),
    LIVE_CONCURRENCY,
    async (url) => ({ url, analysis: await fetchPage(url) })
  );

  // Collect every distinct asset and which pages carry it, so one oversized
  // shared asset is reported once with its true reach rather than 40 times.
  const assetPages = new Map<string, Set<string>>();
  const unoptimised = new Map<string, Set<string>>();
  const notLazy = new Map<string, Set<string>>();

  for (const { url, analysis } of analyses) {
    if (!analysis) continue;

    const record = (map: Map<string, Set<string>>, key: string) => {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(url);
    };

    for (const image of analysis.images) {
      if (!image.src || image.src.startsWith('data:')) continue;
      const absolute = new URL(image.src, url).href;
      // Next's optimiser already handles format, size and compression, so its
      // URLs are not worth measuring or reporting.
      if (image.optimised) continue;

      record(assetPages, absolute);
      if (!image.hasSrcSet) record(unoptimised, absolute);
      if (!image.lazy) record(notLazy, absolute);
    }

    // Background images never appear in <img> checks but are usually the
    // largest thing on the page — this site's hero is exactly that.
    for (const background of analysis.backgroundImages) {
      record(assetPages, new URL(background, url).href);
    }
  }

  const measured = await mapWithConcurrency(
    [...assetPages.keys()],
    LIVE_CONCURRENCY,
    async (assetUrl) => ({ assetUrl, info: await measureAsset(assetUrl) })
  );

  const findings: Finding[] = [];

  for (const { assetUrl, info } of measured) {
    if (!info || info.bytes === 0) continue;

    const pages = assetPages.get(assetUrl)!;
    const isModern = /webp|avif/i.test(info.type);

    if (info.bytes >= IMAGE_CRITICAL_BYTES) {
      findings.push(makeFinding({
        scope: assetUrl,
        code: 'OPT_IMAGE_OVERSIZED',
        severity: 'high',
        category: 'performance',
        title: `${mb(info.bytes)} image on ${pages.size} page(s)`,
        detail: `${assetUrl} is ${mb(info.bytes)} (${info.type}). It loads on ${pages.size} page(s) ` +
                `and is very likely the Largest Contentful Paint element, which Google uses as a ` +
                `ranking signal. On a mobile connection this alone can cost several seconds.`,
        url: [...pages][0],
        evidence: { bytes: info.bytes, contentType: info.type, pageCount: pages.size },
        recommendation: isModern
          ? 'Reduce the dimensions or compression quality — the format is already modern.'
          : 'Serve it through next/image (WebP/AVIF, responsive sizes, automatic compression) ' +
            'rather than as a raw file. For a CSS background, replace the background-image with ' +
            '<Image fill> so the optimiser applies.',
      }));
    } else if (info.bytes >= IMAGE_HEAVY_BYTES) {
      findings.push(makeFinding({
        scope: assetUrl,
        code: 'OPT_IMAGE_HEAVY',
        severity: 'medium',
        category: 'performance',
        title: `${mb(info.bytes)} image on ${pages.size} page(s)`,
        detail: `${assetUrl} is ${mb(info.bytes)} (${info.type}), above the ${mb(IMAGE_HEAVY_BYTES)} threshold.`,
        url: [...pages][0],
        evidence: { bytes: info.bytes, contentType: info.type, pageCount: pages.size },
        recommendation: 'Compress it, or serve it through next/image.',
      }));
    }
  }

  // Responsive and lazy-loading gaps, reported once each rather than per page.
  const missingSrcSet = [...unoptimised.keys()].filter(u => !u.includes('/_next/image'));
  if (missingSrcSet.length > 0) {
    findings.push(makeFinding({
      scope: 'srcset-gap',
      code: 'OPT_IMAGE_NOT_RESPONSIVE',
      severity: 'low',
      category: 'performance',
      title: `${missingSrcSet.length} image(s) serve one size to every device`,
      detail: `These have no srcset, so phones download the desktop image: ` +
              `${missingSrcSet.slice(0, 5).join(', ')}${missingSrcSet.length > 5 ? ` +${missingSrcSet.length - 5} more` : ''}`,
      evidence: { images: missingSrcSet.slice(0, 20) },
      recommendation: 'next/image generates srcset automatically; raw <img> tags do not.',
    }));
  }

  const missingLazy = [...notLazy.keys()];
  if (missingLazy.length > 0) {
    findings.push(makeFinding({
      scope: 'lazy-gap',
      code: 'OPT_IMAGE_NOT_LAZY',
      severity: 'low',
      category: 'performance',
      title: `${missingLazy.length} image(s) load eagerly`,
      detail: `No loading="lazy": ${missingLazy.slice(0, 5).join(', ')}` +
              `${missingLazy.length > 5 ? ` +${missingLazy.length - 5} more` : ''}. ` +
              `Eager loading is correct for the hero — it should not be deferred — but wrong for ` +
              `anything below the fold.`,
      evidence: { images: missingLazy.slice(0, 20) },
      recommendation: 'Add loading="lazy" to below-the-fold images. Leave the LCP image eager.',
    }));
  }

  return {
    findings,
    pagesAnalysed: analyses.filter(a => a.analysis).length,
    assetsMeasured: measured.filter(m => m.info).length,
    coveredCategories: ['performance'],
  };
}
