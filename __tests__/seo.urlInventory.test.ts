/**
 * Verifies lib/seo/urlInventory.ts (the extracted source of app/sitemap.ts)
 * agrees with the actual digest files on disk — this is the check that
 * catches sitemap/digest drift automatically.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import path from 'path';
import { getIndexableUrls, getAvailableWeekLabels, STATIC_PAGE_LAST_MODIFIED } from '../lib/seo/urlInventory';
import { weekLabelToSlug } from '../lib/utils/weekSlug';

const DIGESTS_DIR = path.join(process.cwd(), 'data', 'digests');
const BASE_URL = 'https://luxury-intel.com';

test('every digest week has exactly one sitemap entry', async () => {
  const weekLabels = await getAvailableWeekLabels(DIGESTS_DIR);
  if (weekLabels.length === 0) {
    console.log('Skipping: no digests found in data/digests/');
    return;
  }

  const entries = await getIndexableUrls(BASE_URL);
  const digestUrls = entries.filter(e => e.kind === 'digest').map(e => e.url);

  assert.equal(digestUrls.length, weekLabels.length, 'sitemap digest-entry count must match digest file count');

  for (const weekLabel of weekLabels) {
    const expected = `${BASE_URL}/digest/${weekLabelToSlug(weekLabel)}`;
    assert(digestUrls.includes(expected), `missing sitemap entry for ${weekLabel}: expected ${expected}`);
  }
});

test('no duplicate URLs in the sitemap inventory', async () => {
  const entries = await getIndexableUrls(BASE_URL);
  const urls = entries.map(e => e.url);
  const unique = new Set(urls);
  assert.equal(unique.size, urls.length, `found duplicate URLs: ${urls.filter((u, i) => urls.indexOf(u) !== i).join(', ')}`);
});

test('all sitemap URLs are absolute and use the given base URL', async () => {
  const entries = await getIndexableUrls(BASE_URL);
  for (const entry of entries) {
    assert(entry.url.startsWith(BASE_URL), `URL ${entry.url} does not start with ${BASE_URL}`);
  }
});

test('static pages use the shared STATIC_PAGE_LAST_MODIFIED constant', async () => {
  // Drift guard. This constant is read by both the sitemap and the SEO
  // auditor's staleness check; they previously each hardcoded the date
  // independently, so bumping one silently desynced the other.
  const entries = await getIndexableUrls(BASE_URL);
  const about = entries.find(e => e.url === `${BASE_URL}/about`);

  assert(about, '/about should be in the sitemap inventory');
  assert.equal(
    about.lastModified.getTime(),
    STATIC_PAGE_LAST_MODIFIED.getTime(),
    'static-page lastModified must come from the exported constant, not a local copy'
  );
});

test('digest lastModified reflects a post-build content regeneration', async () => {
  // scripts/regenerateSummar*.ts stamp contentUpdatedAtISO after rewriting
  // page-visible text. Google uses sitemap lastmod as its re-crawl hint, so
  // that stamp — not the original build time — must win when it is newer.
  const { promises: fs } = await import('fs');
  const weekLabels = await getAvailableWeekLabels(DIGESTS_DIR);
  const entries = await getIndexableUrls(BASE_URL);
  let checked = 0;
  for (const weekLabel of weekLabels) {
    const digest = JSON.parse(await fs.readFile(path.join(DIGESTS_DIR, `${weekLabel}.json`), 'utf-8'));
    if (!digest.contentUpdatedAtISO) continue;
    const entry = entries.find(e => e.url === `${BASE_URL}/digest/${weekLabelToSlug(weekLabel)}`);
    assert(entry, `missing entry for ${weekLabel}`);
    assert(
      entry.lastModified.getTime() >= new Date(digest.contentUpdatedAtISO).getTime(),
      `${weekLabel}: lastModified ${entry.lastModified.toISOString()} is older than contentUpdatedAtISO ${digest.contentUpdatedAtISO}`
    );
    checked++;
  }
  if (checked === 0) console.log('Skipping: no digest carries contentUpdatedAtISO');
});

test('locale pages are not in the sitemap inventory (roadmap F2.3)', async () => {
  // /es and /da serve English content under a translated shell and are
  // robots noindex; listing them would tell Google to index a page that asks
  // not to be indexed (the same LIVE_NOINDEX_ON_INDEXABLE mistake as /feedback).
  const entries = await getIndexableUrls(BASE_URL);
  const locale = entries.filter(e => /\/(es|da)(\/|$)/.test(e.url));
  assert.deepEqual(locale.map(e => e.url), [], 'locale URLs must not be listed');
  for (const entry of entries) {
    assert.equal(entry.alternates, undefined, `${entry.url} still declares hreflang alternates`);
  }
});
