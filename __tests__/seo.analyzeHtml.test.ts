/**
 * Tests the live audit's HTML parsing against inline fixtures.
 *
 * Deliberately tests the pure analyzer rather than the fetching layer — these
 * run offline and deterministically, which is what makes them useful as a
 * guard against the parser silently changing behaviour.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeHtml } from '../seo/audit/analyzeHtml';

const URL = 'https://example.test/page';

test('extracts title, description, canonical and og:image', () => {
  const a = analyzeHtml(`
    <html><head>
      <title>My Page | Site</title>
      <meta name="description" content="A description.">
      <link rel="canonical" href="https://example.test/page">
      <meta property="og:image" content="https://example.test/img.png">
    </head><body></body></html>`, URL);

  assert.equal(a.title, 'My Page | Site');
  assert.equal(a.description, 'A description.');
  assert.equal(a.canonical, 'https://example.test/page');
  assert.equal(a.ogImage, 'https://example.test/img.png');
  assert.equal(a.noindex, false);
});

test('detects noindex in a robots meta tag', () => {
  const indexed = analyzeHtml('<html><head><meta name="robots" content="index, follow"></head></html>', URL);
  assert.equal(indexed.noindex, false);

  const noindexed = analyzeHtml('<html><head><meta name="robots" content="noindex, follow"></head></html>', URL);
  assert.equal(noindexed.noindex, true);

  // Case and spacing shouldn't matter.
  const shouty = analyzeHtml('<html><head><meta name="robots" content="NOINDEX"></head></html>', URL);
  assert.equal(shouty.noindex, true);
});

test('empty alt is treated as correct, absent alt as a defect', () => {
  // alt="" is the deliberate marker for a decorative image and must NOT be
  // flagged. Getting this wrong produced 40 false positives against the real
  // site's decorative source favicons.
  const a = analyzeHtml(`
    <html><body>
      <img src="/decorative.png" alt="">
      <img src="/described.png" alt="A described image">
      <img src="/hidden.png" aria-hidden="true">
      <img src="/broken.png">
    </body></html>`, URL);

  assert.equal(a.imageCount, 4);
  assert.deepEqual(a.imagesMissingAlt, ['/broken.png'],
    'only the image with no alt attribute at all should be flagged');
});

test('collects JSON-LD types, including from @graph and arrays', () => {
  const a = analyzeHtml(`
    <html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":"WebSite"}]}</script>
      <script type="application/ld+json">[{"@type":"ItemList"}]</script>
    </head></html>`, URL);

  const types = a.jsonLd.flatMap(b => b.types);
  assert(types.includes('Article'), 'should find Article');
  assert(types.includes('BreadcrumbList'), 'should find BreadcrumbList inside @graph');
  assert(types.includes('WebSite'), 'should find WebSite inside @graph');
  assert(types.includes('ItemList'), 'should find ItemList in a top-level array');
  assert.equal(a.jsonLd.every(b => b.parseError === undefined), true, 'all blocks should parse');
});

test('reports unparseable JSON-LD rather than throwing', () => {
  const a = analyzeHtml(
    '<html><head><script type="application/ld+json">{ not valid json }</script></head></html>', URL);

  assert.equal(a.jsonLd.length, 1);
  assert.equal(a.jsonLd[0]!.data, null);
  assert(a.jsonLd[0]!.parseError, 'should record the parse error');
  assert.deepEqual(a.jsonLd[0]!.types, []);
});

test('collects h1s and hreflang alternates', () => {
  const a = analyzeHtml(`
    <html><head>
      <link rel="alternate" hreflang="en" href="https://example.test/">
      <link rel="alternate" hreflang="es" href="https://example.test/es">
    </head><body><h1>First</h1><h1>Second</h1></body></html>`, URL);

  assert.deepEqual(a.h1s, ['First', 'Second']);
  assert.equal(a.hreflang.en, 'https://example.test/');
  assert.equal(a.hreflang.es, 'https://example.test/es');
});

test('missing elements yield nulls rather than throwing', () => {
  const a = analyzeHtml('<html><head></head><body></body></html>', URL);
  assert.equal(a.title, null);
  assert.equal(a.description, null);
  assert.equal(a.canonical, null);
  assert.equal(a.ogImage, null);
  assert.equal(a.noindex, false);
  assert.deepEqual(a.h1s, []);
  assert.deepEqual(a.jsonLd, []);
});
