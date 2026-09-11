/**
 * Verifies the digest title/description builders (lib/seo/metaText.ts)
 * against every real digest on disk.
 *
 * Title length is asserted warn-only for now: as of Stage 1, the digest
 * title template ("<dateRange> Intelligence Digest – AI, Ecommerce & Luxury
 * | Luxury Intelligence") legitimately exceeds 60 chars on most weeks — this
 * is exactly the STATIC_TITLE_LENGTH finding the SEO auditor already reports
 * (see data/seo/report-*.md). Tighten this to a hard assertion once Stage 4
 * ships a shorter title or a per-week seoTitle override.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWeekTitle, buildWeekMetaDescription, renderedWeekTitle } from '../lib/seo/metaText';
import { formatDateRange } from '../lib/utils/formatDate';
import { DESCRIPTION_MIN, DESCRIPTION_MAX, TITLE_MAX_RENDERED } from '../seo/config';
import type { WeeklyDigest } from '../lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIGESTS_DIR = path.join(__dirname, '..', 'data', 'digests');

async function loadAllDigests(): Promise<{ weekLabel: string; digest: WeeklyDigest }[]> {
  try {
    const files = await fs.readdir(DIGESTS_DIR);
    const weekLabels = files.filter(f => /^\d{4}-W\d{1,2}\.json$/.test(f)).map(f => f.replace('.json', ''));
    const results = await Promise.all(weekLabels.map(async (weekLabel) => {
      const raw = await fs.readFile(path.join(DIGESTS_DIR, `${weekLabel}.json`), 'utf-8');
      return { weekLabel, digest: JSON.parse(raw) as WeeklyDigest };
    }));
    return results;
  } catch {
    return [];
  }
}

test('buildWeekMetaDescription stays within length bounds for every digest', async () => {
  const digests = await loadAllDigests();
  if (digests.length === 0) {
    console.log('Skipping: no digests found in data/digests/');
    return;
  }

  for (const { weekLabel, digest } of digests) {
    const dateRange = formatDateRange(digest.startISO, digest.endISO);
    const description = buildWeekMetaDescription(digest, dateRange);

    assert(description.length > 0, `${weekLabel}: description must not be empty`);
    assert(
      description.length <= DESCRIPTION_MAX,
      `${weekLabel}: description is ${description.length} chars, must be <= ${DESCRIPTION_MAX}: "${description}"`
    );
    if (description.length < DESCRIPTION_MIN) {
      console.log(`[warn] ${weekLabel}: description is only ${description.length} chars (min ${DESCRIPTION_MIN}): "${description}"`);
    }
  }
});

test('buildWeekTitle produces a non-empty title for every digest (length tracked, not enforced yet)', async () => {
  const digests = await loadAllDigests();
  if (digests.length === 0) {
    console.log('Skipping: no digests found in data/digests/');
    return;
  }

  // Now enforced, not merely tracked. Titles were 83-91 chars because the
  // layout template appended " | Luxury Intelligence" to a title that already
  // named the publication; digest titles are emitted with `title.absolute` so
  // that no longer happens. This assertion is what stops the regression.
  for (const { weekLabel, digest } of digests) {
    const dateRange = formatDateRange(digest.startISO, digest.endISO);
    const title = buildWeekTitle(dateRange);
    assert(title.length > 0, `${weekLabel}: title must not be empty`);

    const rendered = renderedWeekTitle(dateRange);
    assert(
      rendered.length <= TITLE_MAX_RENDERED,
      `${weekLabel}: rendered title is ${rendered.length} chars, must be <= ${TITLE_MAX_RENDERED}: "${rendered}"`
    );
    assert(
      rendered.includes(dateRange),
      `${weekLabel}: title must lead with the date range that distinguishes this issue`
    );
  }
});

test('the digest title is not double-branded', () => {
  // The specific defect that made every title overlong: the publication name
  // appearing twice once the layout template ran.
  const rendered = renderedWeekTitle('Aug 30 - Sep 6, 2026');
  const brandOccurrences = rendered.match(/Luxury Intelligence/g)?.length ?? 0;
  assert.equal(brandOccurrences, 1, `brand should appear exactly once, got: "${rendered}"`);
});
