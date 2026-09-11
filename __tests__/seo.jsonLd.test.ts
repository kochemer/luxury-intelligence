/**
 * Structured-data tests, run against every real digest on disk.
 *
 * The property that matters most here is *entity resolution*: an Article's
 * publisher must be the same `@id` the root graph declares for the
 * Organization. If those drift apart, search engines and answer engines see
 * unrelated anonymous entities that happen to share a name — which is the
 * state this code replaced, and the state it would silently return to if the
 * two halves were edited independently.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import {
  buildRootGraphLd,
  buildNewsArticleLd,
  buildDigestItemListLd,
  buildBreadcrumbLd,
  buildArchiveCollectionLd,
  collectDigestArticles,
  entityId,
} from '../lib/seo/jsonLd';
import { formatDateRange } from '../lib/utils/formatDate';
import { renderedWeekTitle } from '../lib/seo/metaText';
import type { WeeklyDigest } from '../lib/types';

const SITE = 'https://luxury-intel.com';
const DIGESTS_DIR = path.join(process.cwd(), 'data', 'digests');

async function loadDigests(): Promise<{ weekLabel: string; digest: WeeklyDigest }[]> {
  try {
    const files = await fs.readdir(DIGESTS_DIR);
    const labels = files.filter(f => /^\d{4}-W\d{1,2}\.json$/.test(f)).map(f => f.replace('.json', ''));
    return Promise.all(labels.map(async (weekLabel) => ({
      weekLabel,
      digest: JSON.parse(await fs.readFile(path.join(DIGESTS_DIR, `${weekLabel}.json`), 'utf-8')) as WeeklyDigest,
    })));
  } catch {
    return [];
  }
}

/** Collect every @id declared anywhere in a JSON-LD payload. */
function declaredIds(node: unknown, found = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach(n => declaredIds(n, found)); return found; }
  const obj = node as Record<string, unknown>;
  // An @id alongside an @type is a declaration; @id alone is a reference.
  if (typeof obj['@id'] === 'string' && obj['@type']) found.add(obj['@id']);
  Object.values(obj).forEach(v => declaredIds(v, found));
  return found;
}

test('the root graph declares WebSite, Organization and Person with stable @ids', () => {
  const graph = buildRootGraphLd(SITE) as { '@graph': Record<string, unknown>[] };
  const types = graph['@graph'].map(n => n['@type']);

  assert(types.includes('WebSite'));
  assert(types.includes('Organization'));
  assert(types.includes('Person'));

  const ids = declaredIds(graph);
  assert(ids.has(entityId.website(SITE)), 'WebSite must be identifiable');
  assert(ids.has(entityId.organization(SITE)), 'Organization must be identifiable');
  assert(ids.has(entityId.editor(SITE)), 'the editor must be identifiable');
});

test('the Organization carries a logo — required for rich results', () => {
  const graph = buildRootGraphLd(SITE) as { '@graph': Record<string, unknown>[] };
  const org = graph['@graph'].find(n => n['@type'] === 'Organization')!;
  const logo = org.logo as Record<string, unknown> | undefined;

  assert(logo, 'Organization must have a logo');
  assert.equal(logo['@type'], 'ImageObject');
  assert(String(logo.url).startsWith('https://'), 'logo URL must be absolute');
});

test('the Organization declares no fabricated sameAs profiles', () => {
  // No social profiles exist in this codebase. Inventing sameAs URLs would be
  // worse than omitting the property, so its absence is deliberate and tested.
  const graph = buildRootGraphLd(SITE) as { '@graph': Record<string, unknown>[] };
  const org = graph['@graph'].find(n => n['@type'] === 'Organization')!;
  assert.equal(org.sameAs, undefined, 'sameAs must stay absent until real profiles exist');
});

test('every digest produces a valid NewsArticle bound to the root entities', async () => {
  const digests = await loadDigests();
  if (digests.length === 0) { console.log('Skipping: no digests'); return; }

  for (const { weekLabel, digest } of digests) {
    const dateRange = formatDateRange(digest.startISO, digest.endISO);
    const url = `${SITE}/digest/x`;
    const ld = buildNewsArticleLd({
      siteUrl: SITE, url,
      headline: renderedWeekTitle(dateRange),
      description: 'test description',
      digest,
    }) as Record<string, unknown>;

    assert.equal(ld['@type'], 'NewsArticle', `${weekLabel}: should be NewsArticle, not generic Article`);
    assert.equal(ld['@context'], 'https://schema.org');

    const headline = String(ld.headline);
    assert(headline.length > 0 && headline.length <= 110,
      `${weekLabel}: headline must be 1-110 chars (schema.org ignores longer), got ${headline.length}`);

    // The entity-resolution property this whole file exists to protect.
    assert.deepEqual(ld.publisher, { '@id': entityId.organization(SITE) },
      `${weekLabel}: publisher must reference the root Organization by @id`);
    assert.deepEqual(ld.author, { '@id': entityId.editor(SITE) },
      `${weekLabel}: author must reference the root Person by @id`);
    assert.deepEqual(ld.isPartOf, { '@id': entityId.website(SITE) },
      `${weekLabel}: article must be part of the declared WebSite`);

    if (ld.datePublished) {
      assert(!Number.isNaN(new Date(String(ld.datePublished)).getTime()),
        `${weekLabel}: datePublished must parse`);
    }
  }
});

test('every digest ItemList is contiguously positioned and complete', async () => {
  const digests = await loadDigests();
  if (digests.length === 0) { console.log('Skipping: no digests'); return; }

  for (const { weekLabel, digest } of digests) {
    const ld = buildDigestItemListLd({
      siteUrl: SITE, url: `${SITE}/digest/x`, dateRange: 'test range', digest,
    }) as Record<string, unknown>;

    const items = ld.itemListElement as Record<string, unknown>[];
    const expected = collectDigestArticles(digest).length;

    assert.equal(items.length, expected, `${weekLabel}: must list every curated article`);
    assert.equal(ld.numberOfItems, expected, `${weekLabel}: numberOfItems must match the list`);

    // Positions must run 1..n with no gaps, or the ordering is meaningless.
    items.forEach((item, i) => {
      assert.equal(item.position, i + 1, `${weekLabel}: position ${i + 1} out of sequence`);
      assert(String(item.name).length > 0, `${weekLabel}: every item needs a name`);
      assert(String(item.url).startsWith('http'), `${weekLabel}: every item needs an absolute URL`);
    });
  }
});

test('the final breadcrumb carries no item link', () => {
  const ld = buildBreadcrumbLd({
    siteUrl: SITE,
    items: [
      { name: 'Home', url: `${SITE}/` },
      { name: 'Archive', url: `${SITE}/archive` },
      { name: 'This week', url: `${SITE}/digest/x` },
    ],
  }) as Record<string, unknown>;

  const items = ld.itemListElement as Record<string, unknown>[];
  assert.equal(items.length, 3);
  assert.equal(items[0]!.item, `${SITE}/`);
  assert.equal(items[1]!.item, `${SITE}/archive`);
  assert.equal(items[2]!.item, undefined, 'the current page is not a link to itself');
});

test('the archive collection references the root site and lists its entries', () => {
  const ld = buildArchiveCollectionLd({
    siteUrl: SITE,
    url: `${SITE}/archive`,
    name: 'Archive',
    description: 'All editions',
    entries: [
      { url: `${SITE}/digest/a`, name: 'Week A' },
      { url: `${SITE}/digest/b`, name: 'Week B' },
    ],
  }) as Record<string, unknown>;

  assert.equal(ld['@type'], 'CollectionPage');
  assert.deepEqual(ld.isPartOf, { '@id': entityId.website(SITE) });
  assert.deepEqual(ld.publisher, { '@id': entityId.organization(SITE) });

  const main = ld.mainEntity as Record<string, unknown>;
  assert.equal(main['@type'], 'ItemList');
  assert.equal(main.numberOfItems, 2);
});

test('all builders survive JSON serialisation', async () => {
  // JSON-LD is emitted via JSON.stringify; a circular or non-serialisable
  // value would throw at render time and take the page down.
  const digests = await loadDigests();
  const digest = digests[0]?.digest;

  const payloads: unknown[] = [
    buildRootGraphLd(SITE),
    buildBreadcrumbLd({ siteUrl: SITE, items: [{ name: 'Home', url: `${SITE}/` }] }),
    buildArchiveCollectionLd({ siteUrl: SITE, url: `${SITE}/archive`, name: 'a', description: 'b', entries: [] }),
  ];
  if (digest) {
    payloads.push(
      buildNewsArticleLd({ siteUrl: SITE, url: `${SITE}/x`, headline: 'h', description: 'd', digest }),
      buildDigestItemListLd({ siteUrl: SITE, url: `${SITE}/x`, dateRange: 'r', digest }),
    );
  }

  for (const payload of payloads) {
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(payload)));
  }
});
