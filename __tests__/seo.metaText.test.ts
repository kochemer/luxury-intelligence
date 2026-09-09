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
import { buildWeekTitle, buildWeekMetaDescription, DIGEST_TITLE_SUFFIX } from '../lib/seo/metaText';
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

  let overLimit = 0;
  for (const { weekLabel, digest } of digests) {
    const dateRange = formatDateRange(digest.startISO, digest.endISO);
    const title = buildWeekTitle(dateRange);
    assert(title.length > 0, `${weekLabel}: title must not be empty`);

    const rendered = `${title}${DIGEST_TITLE_SUFFIX}`;
    if (rendered.length > TITLE_MAX_RENDERED) overLimit++;
  }

  // Known, tracked issue (STATIC_TITLE_LENGTH in the SEO report) — not a hard
  // failure yet. Remove this console line and assert(overLimit === 0) once
  // Stage 4 ships a fix.
  if (overLimit > 0) {
    console.log(`[known issue] ${overLimit}/${digests.length} digest titles exceed ${TITLE_MAX_RENDERED} chars rendered — tracked as STATIC_TITLE_LENGTH.`);
  }
});
