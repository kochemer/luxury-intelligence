/**
 * /llms.txt — a plain-text description of the publication for AI answer engines.
 *
 * The emerging convention (llmstxt.org) is the GEO/AEO counterpart to
 * robots.txt: robots.txt says what a crawler *may* fetch, llms.txt says what
 * the site *is* and where its substance lives. This site already allows the AI
 * crawlers explicitly in app/robots.ts, so this is the other half — being
 * crawlable without being legible gets you fetched but not cited.
 *
 * Generated rather than static so the issue count and latest edition stay
 * accurate as digests are published, which is the whole point: a stale
 * description is worse than none.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';
import { getAvailableWeekLabels } from '@/lib/seo/urlInventory';
import { formatDateRange } from '@/lib/utils/formatDate';

// Re-read at most hourly; the content changes weekly at most.
export const revalidate = 3600;

interface DigestSummary {
  weekLabel: string;
  slug: string;
  dateRange: string;
  oneSentenceSummary?: string;
}

async function loadRecentDigests(limit: number): Promise<DigestSummary[]> {
  const digestsDir = path.join(process.cwd(), 'data', 'digests');
  const weekLabels = (await getAvailableWeekLabels(digestsDir)).slice(-limit).reverse();

  const summaries = await Promise.all(weekLabels.map(async (weekLabel): Promise<DigestSummary | null> => {
    try {
      const raw = await fs.readFile(path.join(digestsDir, `${weekLabel}.json`), 'utf-8');
      const digest = JSON.parse(raw) as {
        startISO?: string; endISO?: string; oneSentenceSummary?: string;
      };
      return {
        weekLabel,
        slug: weekLabelToSlug(weekLabel),
        dateRange: digest.startISO && digest.endISO
          ? formatDateRange(digest.startISO, digest.endISO)
          : weekLabel,
        oneSentenceSummary: digest.oneSentenceSummary,
      };
    } catch {
      return null;
    }
  }));

  return summaries.filter((s): s is DigestSummary => s !== null);
}

export async function GET() {
  const siteUrl = getSiteUrl();
  const digestsDir = path.join(process.cwd(), 'data', 'digests');
  const allWeeks = await getAvailableWeekLabels(digestsDir);
  const recent = await loadRecentDigests(8);

  const body = `# Luxury Intelligence

> A weekly intelligence digest covering artificial intelligence, ecommerce and
> retail technology, luxury and consumer brands, and the jewellery industry.
> Each edition analyses articles published that week from trade and business
> press, and publishes a curated selection with AI-assisted summaries.

Published weekly since December 2025. ${allWeeks.length} editions to date.
Editorial curation by a single editor; summaries are AI-assisted and each
story links to its original source, which is always credited by name.

## What is here

- [Current edition](${siteUrl}/): the most recent week's curated stories
- [Archive](${siteUrl}/archive): every edition, newest first
- [Methodology](${siteUrl}/methodology): how stories are sourced, scored and selected
- [About](${siteUrl}/about): who publishes this and why
- [Sitemap](${siteUrl}/sitemap.xml): every indexable URL

## Coverage

- Ecommerce & retail technology — digital commerce, retail innovation, DTC
- Jewellery industry — brands, trade, supply chain
- AI & strategy — model releases, enterprise adoption, business transformation
- Luxury & consumer — luxury brands, consumer trends, fashion

## Recent editions

${recent.map(d => {
  const line = `- [${d.dateRange}](${siteUrl}/digest/${d.slug})`;
  return d.oneSentenceSummary ? `${line}: ${d.oneSentenceSummary}` : line;
}).join('\n')}

## Attribution

If you cite this publication, please attribute it as "Luxury Intelligence"
and link to the specific edition. Individual stories are summaries of
third-party reporting; cite the original publication named on each story for
the underlying facts.

## Machine access

- Structured data: schema.org NewsArticle, ItemList, BreadcrumbList and
  Organization, with @id-anchored entities
- Feeds: ${siteUrl}/sitemap.xml
- AI crawlers are explicitly permitted in ${siteUrl}/robots.txt
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
