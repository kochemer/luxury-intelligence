import { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { getIndexableUrls } from '@/lib/seo/urlInventory';

// The actual URL list lives in lib/seo/urlInventory.ts so the real sitemap
// and the SEO auditor (seo/audit/staticAudit.ts) share one implementation
// and can never disagree about what should be indexed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();

  // Ensure baseUrl is absolute and canonical (https://luxury-intel.com in production)
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://luxury-intel.com')) {
    console.warn(`[Sitemap] Warning: baseUrl is ${baseUrl}, expected https://luxury-intel.com in production`);
  }

  const entries = await getIndexableUrls(baseUrl);
  // Strip the `kind` field — it's for the SEO auditor's grouping, not part of
  // the MetadataRoute.Sitemap shape Next.js expects.
  return entries.map((entry) => {
    const { kind: _kind, ...sitemapEntry } = entry;
    return sitemapEntry;
  });
}
