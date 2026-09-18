/**
 * Ask search engines (via IndexNow) to re-crawl digest pages.
 *
 *   npx tsx scripts/pingIndexNow.ts --all            # homepage + archive + every digest week on disk
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

  const siteUrl = getSiteUrl();
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
