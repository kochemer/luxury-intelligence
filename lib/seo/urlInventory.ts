/**
 * Single source of truth for "every indexable URL on the site."
 *
 * This was extracted from app/sitemap.ts so the real sitemap and the SEO
 * auditor can never disagree about what should be indexed — app/sitemap.ts
 * is now a thin wrapper around getIndexableUrls().
 */

import { promises as fs } from 'fs';
import path from 'path';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';

/**
 * Last meaningful content change for purely static pages (about, methodology,
 * subscribe, feedback, support). Bump this when those pages are edited so
 * Google sees a real change signal instead of a fresh timestamp every build.
 *
 * Exported because seo/audit/staticAudit.ts checks its age — keep it a single
 * constant so the sitemap and the auditor can never disagree about the date.
 */
export const STATIC_PAGE_LAST_MODIFIED = new Date('2026-06-02');

export interface IndexableUrlEntry {
  url: string;
  lastModified: Date;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  alternates?: { languages: Record<string, string> };
  /** Internal grouping used by the SEO auditor; not part of the sitemap output. */
  kind: 'static' | 'locale' | 'digest';
}

/**
 * Get all available week labels from digest files.
 * Only includes files matching YYYY-W## format.
 */
export async function getAvailableWeekLabels(digestsDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(digestsDir);
    const weekLabels = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(label => /^\d{4}-W\d{1,2}$/.test(label))
      .sort((a, b) => {
        const [yearA, weekA] = a.split('-W').map(Number);
        const [yearB, weekB] = b.split('-W').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return weekA - weekB;
      });
    return weekLabels;
  } catch {
    return [];
  }
}

/**
 * Get the digest build date from the JSON file itself (builtAtISO field).
 * Uses builtAtISO rather than file mtime because mtime gets reset during
 * git operations and deploys — causing all digests to show the same timestamp.
 * Falls back to startISO (week start), then current date.
 */
async function getDigestBuiltAt(filePath: string): Promise<Date> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const digest = JSON.parse(raw) as { builtAtISO?: string; startISO?: string };
    if (digest.builtAtISO) return new Date(digest.builtAtISO);
    if (digest.startISO) return new Date(digest.startISO);
    return new Date();
  } catch {
    return new Date();
  }
}

/**
 * Build the full list of indexable URLs for the site — the data behind
 * app/sitemap.ts and the checks in seo/audit/staticAudit.ts.
 */
export async function getIndexableUrls(baseUrl: string): Promise<IndexableUrlEntry[]> {
  const digestsDir = path.join(process.cwd(), 'data', 'digests');
  const weekLabels = await getAvailableWeekLabels(digestsDir);

  const latestWeekLabel = weekLabels[weekLabels.length - 1];
  const latestContentChange = latestWeekLabel
    ? await getDigestBuiltAt(path.join(digestsDir, `${latestWeekLabel}.json`))
    : STATIC_PAGE_LAST_MODIFIED;

  // NOTE: no hreflang alternates. The /es and /da locale pages serve English
  // article content under a translated shell, so the hreflang cluster told
  // Google "three language versions" of the same text. They are now
  // `robots: { index: false }` and omitted from the sitemap (roadmap F2.3,
  // 2026-09-18). GSC showed 0 clicks / 0 impressions for every locale URL.
  const staticEntries: IndexableUrlEntry[] = [
    { url: baseUrl, lastModified: latestContentChange, changeFrequency: 'weekly', priority: 1.0, kind: 'static' },
    { url: `${baseUrl}/archive`, lastModified: latestContentChange, changeFrequency: 'weekly', priority: 0.6, kind: 'static' },
    { url: `${baseUrl}/about`, lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5, kind: 'static' },
    { url: `${baseUrl}/methodology`, lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5, kind: 'static' },
    { url: `${baseUrl}/email-digest`, lastModified: latestContentChange, changeFrequency: 'weekly', priority: 0.7, kind: 'static' },
    { url: `${baseUrl}/subscribe`, lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.8, kind: 'static' },
    { url: `${baseUrl}/support`, lastModified: STATIC_PAGE_LAST_MODIFIED, changeFrequency: 'monthly', priority: 0.5, kind: 'static' },
    // NOTE: /feedback is deliberately NOT listed. app/feedback/page.tsx serves
    // `robots: { index: false }`, so listing it told Google to index a page that
    // simultaneously asked not to be indexed. Its /es and /da counterparts were
    // already excluded here and disallowed in robots.ts; the English page was
    // the odd one out. Found by the live HTTP audit (LIVE_NOINDEX_ON_INDEXABLE).
  ];


  const weekEntries: IndexableUrlEntry[] = await Promise.all(
    weekLabels.map(async (weekLabel) => {
      const filePath = path.join(digestsDir, `${weekLabel}.json`);
      const lastModified = await getDigestBuiltAt(filePath);
      return {
        url: `${baseUrl}/digest/${weekLabelToSlug(weekLabel)}`,
        lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
        kind: 'digest' as const,
      };
    })
  );

  return [...staticEntries, ...weekEntries];
}
