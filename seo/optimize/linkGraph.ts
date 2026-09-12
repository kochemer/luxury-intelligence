/**
 * Internal link graph analysis.
 *
 * Checks drawn from the `seo-audit` skill's internal-linking section, which
 * names orphan pages, undescriptive anchor text, buried pages and broken
 * internal links as the issues worth finding.
 *
 * This matters more here than it would on most sites: Google reported 25 of 52
 * pages as never crawled. A page with no inbound internal links has no path
 * for a crawler to reach it, so the link graph is the most likely explanation
 * — and unlike the indexing report, it says which pages to fix and how.
 *
 * Unlike an audit for *defects*, these are opportunities: nothing here is
 * broken, it is simply weaker than it could be.
 */

import { isGenericAnchor } from '../audit/analyzeHtml';
import { getIndexableUrls } from '@/lib/seo/urlInventory';
import {
  LIVE_CONCURRENCY,
  WEAK_INBOUND_LINK_THRESHOLD,
  THIN_CONTENT_CHARS,
} from '../config';
import type { Finding, Category } from '../types';
import { makeFinding } from '../shared/finding';
import { fetchAndAnalyse, mapWithConcurrency } from '../shared/fetch';

/** Normalise to the same shape analyzeHtml produces for link targets. */
function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return url;
  }
}

export interface LinkGraphNode {
  url: string;
  inbound: string[];
  outbound: number;
  headingLevels: number[];
  textLength: number;
}

export interface LinkGraphResult {
  findings: Finding[];
  nodes: LinkGraphNode[];
  coveredCategories: Category[];
  pagesAnalysed: number;
}

export async function analyseLinkGraph(baseUrl: string): Promise<LinkGraphResult> {
  const entries = await getIndexableUrls(baseUrl);
  const urls = entries.map(e => e.url);
  const known = new Set(urls.map(canonicalKey));

  const analyses = await mapWithConcurrency(urls, LIVE_CONCURRENCY, fetchAndAnalyse);

  // Build inbound-link lists. A page linking to itself does not count.
  const inbound = new Map<string, string[]>();
  for (const key of known) inbound.set(key, []);

  const brokenLinks: { from: string; to: string }[] = [];
  const genericAnchors: { from: string; to: string; text: string }[] = [];

  for (const { url, analysis } of analyses) {
    if (!analysis) continue;
    const fromKey = canonicalKey(url);

    for (const link of analysis.internalLinks) {
      const toKey = canonicalKey(link.href);
      if (toKey === fromKey) continue;

      if (known.has(toKey)) {
        inbound.get(toKey)!.push(url);
        if (link.text && isGenericAnchor(link.text)) {
          genericAnchors.push({ from: url, to: link.href, text: link.text });
        }
      } else {
        // Links to a path that is not an indexable page. Could be a utility
        // page (fine) or a dead link (not), so recorded but ranked low.
        brokenLinks.push({ from: url, to: link.href });
      }
    }
  }

  const nodes: LinkGraphNode[] = analyses
    .filter(a => a.analysis)
    .map(({ url, analysis }) => ({
      url,
      inbound: [...new Set(inbound.get(canonicalKey(url)) ?? [])],
      outbound: analysis!.internalLinks.length,
      headingLevels: analysis!.headingLevels,
      textLength: analysis!.textLength,
    }));

  const findings: Finding[] = [];

  // ── Fetch failures invalidate the link graph ────────────────────────────
  //
  // A page that could not be fetched contributes no outbound links, so every
  // page it links to loses an inbound count. With enough failures, perfectly
  // well-linked pages are reported as orphans — a confident, completely wrong
  // finding. Inbound counts are only meaningful when the whole site was read,
  // so on any failure the link-based findings are withheld and the failure is
  // reported instead.
  const failedUrls = analyses.filter(a => !a.analysis).map(a => a.url);

  if (failedUrls.length > 0) {
    findings.push(makeFinding({
      scope: 'linkgraph-incomplete',
      code: 'OPT_LINK_GRAPH_INCOMPLETE',
      severity: 'high',
      category: 'technical',
      title: `Could not fetch ${failedUrls.length} of ${urls.length} pages — link analysis withheld`,
      detail: `Inbound-link counts are only valid when every page has been read, because an ` +
              `unfetched page's outbound links are invisible. Orphan and weak-link findings are ` +
              `suppressed for this run rather than reported wrongly. Failed: ` +
              `${failedUrls.slice(0, 5).join(', ')}${failedUrls.length > 5 ? ` +${failedUrls.length - 5} more` : ''}`,
      evidence: { failed: failedUrls.slice(0, 20), total: urls.length },
      recommendation: 'Usually transient. Re-run; if it persists, those pages are genuinely unreachable ' +
                      'and the live audit will report them as such.',
    }));
  }

  // ── Orphans: the finding most likely to explain "never crawled" ─────────
  // Skipped entirely when the graph is incomplete — see above.
  for (const node of failedUrls.length > 0 ? [] : nodes) {
    if (node.inbound.length === 0) {
      findings.push(makeFinding({
        scope: node.url, code: 'OPT_ORPHAN_PAGE', severity: 'high', category: 'opportunity',
        title: 'No other page links to this one',
        detail: `${node.url} is in the sitemap but nothing on the site links to it. ` +
                `Crawlers reach pages by following links, so an orphan depends entirely on the sitemap ` +
                `being read — and is the usual reason a page is never crawled.`,
        url: node.url,
        recommendation: 'Link to it from a relevant page — the archive, a related digest, or the homepage.',
      }));
    } else if (node.inbound.length <= WEAK_INBOUND_LINK_THRESHOLD) {
      findings.push(makeFinding({
        scope: node.url, code: 'OPT_WEAKLY_LINKED', severity: 'low', category: 'opportunity',
        title: `Only ${node.inbound.length} page links here`,
        detail: `${node.url} has ${node.inbound.length} inbound internal link(s): ${node.inbound.join(', ')}. ` +
                `Few inbound links signals low importance to search engines.`,
        url: node.url,
        evidence: { inboundCount: node.inbound.length, inboundFrom: node.inbound },
        recommendation: 'Add links from related pages so its importance is clearer.',
      }));
    }
  }

  // ── Heading hierarchy ───────────────────────────────────────────────────
  for (const node of nodes) {
    const skips: string[] = [];
    for (let i = 1; i < node.headingLevels.length; i++) {
      const prev = node.headingLevels[i - 1]!;
      const curr = node.headingLevels[i]!;
      if (curr - prev > 1) skips.push(`h${prev} → h${curr}`);
    }
    if (skips.length > 0) {
      findings.push(makeFinding({
        scope: node.url, code: 'OPT_HEADING_SKIP', severity: 'low', category: 'opportunity',
        title: `Heading levels skip (${skips.length} place(s))`,
        detail: `${node.url} jumps heading levels: ${[...new Set(skips)].join(', ')}. ` +
                `A clean hierarchy helps search engines and screen readers follow the structure.`,
        url: node.url,
        evidence: { skips: [...new Set(skips)] },
        recommendation: 'Use the next level down rather than jumping, or restyle instead of re-tagging.',
      }));
    }
  }

  // ── Thin content ────────────────────────────────────────────────────────
  for (const node of nodes) {
    if (node.textLength > 0 && node.textLength < THIN_CONTENT_CHARS) {
      findings.push(makeFinding({
        scope: node.url, code: 'OPT_THIN_CONTENT', severity: 'medium', category: 'opportunity',
        title: `Very little text on the page (${node.textLength} chars)`,
        detail: `${node.url} renders roughly ${node.textLength} characters of visible text. ` +
                `Google's "Crawled – currently not indexed" state is commonly applied to pages it judges thin.`,
        url: node.url,
        evidence: { textLength: node.textLength, threshold: THIN_CONTENT_CHARS },
        recommendation: 'Add substantive unique content, or reconsider whether the page should be indexable.',
      }));
    }
  }

  // ── Anchor text ─────────────────────────────────────────────────────────
  if (genericAnchors.length > 0) {
    const byText = new Map<string, number>();
    for (const a of genericAnchors) byText.set(a.text, (byText.get(a.text) ?? 0) + 1);

    findings.push(makeFinding({
      scope: 'generic-anchors', code: 'OPT_GENERIC_ANCHOR_TEXT', severity: 'low', category: 'opportunity',
      title: `${genericAnchors.length} internal link(s) use generic anchor text`,
      detail: `Anchor text tells search engines what the target page is about. ` +
              `Found: ${[...byText.entries()].map(([t, n]) => `"${t}" ×${n}`).join(', ')}`,
      evidence: { examples: genericAnchors.slice(0, 8) },
      recommendation: 'Replace with text describing the destination, e.g. the digest\'s date range or topic.',
    }));
  }

  // ── Links to non-indexable paths ────────────────────────────────────────
  if (brokenLinks.length > 0) {
    const targets = [...new Set(brokenLinks.map(b => b.to))];
    findings.push(makeFinding({
      scope: 'offsitemap-links', code: 'OPT_LINKS_TO_NON_INDEXABLE', severity: 'info', category: 'opportunity',
      title: `${targets.length} internal link target(s) are not indexable pages`,
      detail: `These are linked internally but are not in the sitemap: ${targets.slice(0, 10).join(', ')}` +
              `${targets.length > 10 ? ` +${targets.length - 10} more` : ''}. ` +
              `Expected for utility pages like /search; worth checking none is a dead link.`,
      evidence: { targets: targets.slice(0, 25) },
      recommendation: 'Confirm each is intentionally non-indexable rather than broken.',
    }));
  }

  return {
    findings,
    nodes,
    coveredCategories: ['opportunity'],
    pagesAnalysed: nodes.length,
  };
}
