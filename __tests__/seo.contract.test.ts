/**
 * Contract tests: do the checks still assert what the site actually does?
 *
 * This file exists because the same bug shipped twice. A check is written
 * against the implementation as it is that day, the implementation later
 * moves, and the check quietly becomes wrong — still passing, still green,
 * now measuring nothing:
 *
 *   • The title check re-derived the layout's "%s | Luxury Intelligence"
 *     template. Digest titles switched to `title.absolute`, and the check
 *     carried on adding a suffix the page no longer emitted.
 *   • The JSON-LD check asked for `Article` after the schema was upgraded to
 *     `NewsArticle`. 37 false positives; the pages were correct throughout.
 *
 * Neither was caught by a unit test, because each half was individually
 * correct — only the *relationship* between them was broken. These tests
 * assert that relationship directly, so the next drift fails here rather than
 * in a report someone has to disbelieve.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { expectedJsonLdTypes } from '../seo/audit/liveAudit';
import {
  buildNewsArticleLd,
  buildDigestItemListLd,
  buildBreadcrumbLd,
  buildRootGraphLd,
} from '../lib/seo/jsonLd';
import { renderedWeekTitle, buildWeekMetaDescription } from '../lib/seo/metaText';
import { formatDateRange } from '../lib/utils/formatDate';
import { TITLE_MAX_RENDERED, DESCRIPTION_MAX } from '../seo/config';
import type { IndexableUrlEntry } from '../lib/seo/urlInventory';
import type { WeeklyDigest } from '../lib/types';

const SITE = 'https://luxury-intel.com';
const DIGESTS_DIR = path.join(process.cwd(), 'data', 'digests');

async function loadOneDigest(): Promise<WeeklyDigest | null> {
  try {
    const files = await fs.readdir(DIGESTS_DIR);
    const label = files.filter(f => /^\d{4}-W\d{1,2}\.json$/.test(f)).sort().pop();
    if (!label) return null;
    return JSON.parse(await fs.readFile(path.join(DIGESTS_DIR, label), 'utf-8')) as WeeklyDigest;
  } catch {
    return null;
  }
}

function typesIn(node: unknown, found = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach(n => typesIn(n, found)); return found; }
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  if (typeof t === 'string') found.add(t);
  else if (Array.isArray(t)) t.forEach(x => typeof x === 'string' && found.add(x));
  Object.values(obj).forEach(v => typesIn(v, found));
  return found;
}

const digestEntry: IndexableUrlEntry = {
  url: `${SITE}/digest/example`,
  lastModified: new Date(),
  changeFrequency: 'weekly',
  priority: 0.8,
  kind: 'digest',
};

test('every JSON-LD type the live check demands is one the digest page emits', async () => {
  const digest = await loadOneDigest();
  if (!digest) { console.log('Skipping: no digests on disk'); return; }

  const dateRange = formatDateRange(digest.startISO, digest.endISO);
  const url = digestEntry.url;

  // Exactly the blocks app/digest/[slug]/page.tsx renders.
  const emitted = new Set<string>([
    ...typesIn(buildNewsArticleLd({
      siteUrl: SITE, url, headline: renderedWeekTitle(dateRange), description: 'x', digest,
    })),
    ...typesIn(buildDigestItemListLd({ siteUrl: SITE, url, dateRange, digest })),
    ...typesIn(buildBreadcrumbLd({ siteUrl: SITE, items: [{ name: 'Home', url: `${SITE}/` }] })),
  ]);

  for (const required of expectedJsonLdTypes(digestEntry)) {
    assert(
      emitted.has(required),
      `liveAudit requires "${required}" on digest pages, but the builders in lib/seo/jsonLd.ts ` +
      `emit only: ${[...emitted].sort().join(', ')}. Either the page changed and the check went ` +
      `stale, or the check is asking for something that was never rendered.`
    );
  }
});

test('the live check demands nothing of page types that emit no page-level schema', () => {
  // Static and locale pages carry only the root graph. Demanding a type there
  // would report every one of them as broken.
  for (const kind of ['static', 'locale'] as const) {
    assert.deepEqual(
      expectedJsonLdTypes({ ...digestEntry, kind }), [],
      `${kind} pages emit only the root graph, so nothing should be required of them`
    );
  }
});

test('the root graph is emitted site-wide, so page checks need not require it', () => {
  const rootTypes = typesIn(buildRootGraphLd(SITE));
  for (const expected of ['WebSite', 'Organization', 'Person']) {
    assert(rootTypes.has(expected), `root graph should declare ${expected}`);
  }
});

test('the title the auditor measures is the title the page emits', async () => {
  const digest = await loadOneDigest();
  if (!digest) { console.log('Skipping: no digests on disk'); return; }

  const dateRange = formatDateRange(digest.startISO, digest.endISO);

  // The bug this replaces: the auditor rebuilt the rendered title by appending
  // the layout template's suffix. Both must come from one function, so a change
  // to the title scheme cannot move one without the other.
  const rendered = renderedWeekTitle(dateRange);

  assert(
    rendered.length <= TITLE_MAX_RENDERED,
    `renderedWeekTitle produces ${rendered.length} chars, over the ${TITLE_MAX_RENDERED} the auditor enforces`
  );
  assert(
    !rendered.endsWith(' | Luxury Intelligence') || rendered.split('Luxury Intelligence').length === 2,
    'the brand must not appear twice — that is what made titles 83-91 chars'
  );
});

test('the description the auditor measures is the description the page emits', async () => {
  const digest = await loadOneDigest();
  if (!digest) { console.log('Skipping: no digests on disk'); return; }

  const dateRange = formatDateRange(digest.startISO, digest.endISO);
  const description = buildWeekMetaDescription(digest, dateRange);

  assert(
    description.length <= DESCRIPTION_MAX,
    `buildWeekMetaDescription produces ${description.length} chars, over the ${DESCRIPTION_MAX} enforced`
  );
});

test('config thresholds are internally consistent', () => {
  // A threshold pair that crosses over silently disables a check: if the
  // minimum exceeded the maximum, every description would be "out of range"
  // and the finding would be meaningless.
  const { DESCRIPTION_MIN, DESCRIPTION_MAX: max } = require('../seo/config') as {
    DESCRIPTION_MIN: number; DESCRIPTION_MAX: number;
  };
  assert(DESCRIPTION_MIN < max, 'DESCRIPTION_MIN must be below DESCRIPTION_MAX');
  assert(TITLE_MAX_RENDERED > 20, 'a title limit this low would flag every page');
});
