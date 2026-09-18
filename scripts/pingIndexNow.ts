/**
 * Ask search engines (via IndexNow: Bing, Yandex, Seznam, Naver — NOT Google) to
 * re-crawl digest pages. Google follows sitemap lastmod instead, which is why
 * regeneration stamps contentUpdatedAtISO on the digest.
 *
 *   npx tsx scripts/pingIndexNow.ts --all --site=https://luxury-intel.com   # homepage + archive + every digest week on disk
 *   npx tsx scripts/pingIndexNow.ts --week=2026-W37  # one week (same as the pipeline's ping)
 *
 * The weekly pipeline pings only the newly published week. Use --all after a
 * bulk change to existing pages (e.g. the 2026-09-18 archive backfill of
 * insights, key themes and summaries).
 */

import path from 'path';
import { loadEnv } from '../lib/env';
import { getSiteUrl } from '../lib/utils/siteUrl';
import { weekLabelToSlug } from '../lib/utils/weekSlug';
import { getAvailableWeekLabels } from '../lib/seo/urlInventory';
import { pingIndexNow, pingIndexNowForWeek } from '../lib/utils/indexNow';

loadEnv();

async function main() {
  const args = process.argv.slice(2);
  const week = args.find(a => a.startsWith('--week='))?.split('=')[1];

  if (week) {
    await pingIndexNowForWeek(week);
    return;
  }
  if (!args.includes('--all')) {
    throw new Error('Pass --all or --week=YYYY-Wnn');
  }

  // getSiteUrl() falls back to http://localhost:3000 outside NODE_ENV=production,
  // and IndexNow silently rejects a host that does not serve the key file.
  const siteUrl = args.find(a => a.startsWith('--site='))?.split('=')[1] || getSiteUrl();
  if (/localhost|127\.0\.0\.1/.test(siteUrl)) {
    throw new Error(`Refusing to submit ${siteUrl}: set NEXT_PUBLIC_SITE_URL or pass --site=https://luxury-intel.com`);
  }
  const weeks = await getAvailableWeekLabels(path.join(process.cwd(), 'data', 'digests'));
  const urls = [
    siteUrl,
    `${siteUrl}/archive`,
    ...weeks.map(w => `${siteUrl}/digest/${weekLabelToSlug(w)}`),
  ];
  console.log(`[IndexNow] Submitting ${urls.length} URLs for ${siteUrl}`);
  await pingIndexNow(urls);
}

main().catch(err => { console.error(err); process.exit(1); });
