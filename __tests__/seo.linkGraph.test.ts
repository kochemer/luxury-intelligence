/**
 * Tests for internal link extraction and the anchor-text check.
 *
 * URL normalisation is where a link graph goes quietly wrong: if /archive and
 * /archive/ count as different pages, every page looks like an orphan and the
 * whole analysis inverts. These pin that behaviour.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeHtml, isGenericAnchor } from '../seo/audit/analyzeHtml';

const PAGE = 'https://example.test/digest/one';

test('internal links are normalised so slashes and fragments collapse', () => {
  const a = analyzeHtml(`
    <html><body>
      <a href="/archive">Archive</a>
      <a href="/archive/">Archive trailing</a>
      <a href="/archive#top">Archive anchor</a>
      <a href="https://example.test/about">About</a>
    </body></html>`, PAGE);

  const targets = new Set(a.internalLinks.map(l => l.href));
  assert(targets.has('https://example.test/archive'), 'relative link should resolve to absolute');
  assert(targets.has('https://example.test/about'), 'absolute same-origin link should be kept');
  assert.equal(
    [...targets].filter(t => t.endsWith('/archive')).length, 1,
    '/archive, /archive/ and /archive#top must collapse to one target'
  );
});

test('external, mailto, tel and fragment links are excluded', () => {
  const a = analyzeHtml(`
    <html><body>
      <a href="https://google.com/x">External</a>
      <a href="mailto:x@y.com">Mail</a>
      <a href="tel:+4512345678">Phone</a>
      <a href="#section">Same page</a>
      <a href="/real">Real</a>
    </body></html>`, PAGE);

  assert.equal(a.internalLinks.length, 1, 'only the same-origin page link should count');
  assert.equal(a.internalLinks[0]!.href, 'https://example.test/real');
});

test('repeated nav links to the same target with the same text count once', () => {
  // Otherwise a link repeated in a header and footer would double a target's
  // inbound count and mask a genuinely weakly-linked page.
  const a = analyzeHtml(`
    <html><body>
      <header><a href="/archive">Archive</a></header>
      <footer><a href="/archive">Archive</a></footer>
    </body></html>`, PAGE);

  assert.equal(a.internalLinks.length, 1);
});

test('heading levels are captured in document order', () => {
  const a = analyzeHtml('<html><body><h1>A</h1><h3>B</h3><h2>C</h2></body></html>', PAGE);
  assert.deepEqual(a.headingLevels, [1, 3, 2], 'order matters — it is how skips are detected');
});

test('generic anchor text is recognised, descriptive text is not', () => {
  for (const generic of ['click here', 'Read more', 'HERE', 'learn more', 'Read more →']) {
    assert.equal(isGenericAnchor(generic), true, `"${generic}" should be generic`);
  }
  for (const good of ['Aug 30 - Sep 6 digest', 'Archive', 'Jewellery Industry news']) {
    assert.equal(isGenericAnchor(good), false, `"${good}" should not be generic`);
  }
});

test('text length reflects visible content', () => {
  const thin = analyzeHtml('<html><body><p>Short.</p></body></html>', PAGE);
  const thick = analyzeHtml(`<html><body><p>${'word '.repeat(500)}</p></body></html>`, PAGE);
  assert(thin.textLength < 50);
  assert(thick.textLength > 1200);
});
