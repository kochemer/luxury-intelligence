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
