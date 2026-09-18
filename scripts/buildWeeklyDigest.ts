/**
 * Manual digest rebuild for one week.
 *
 *   npx tsx scripts/buildWeeklyDigest.ts --week=2026-W37
 *
 * Thin wrapper around `buildAndSaveWeeklyDigest` — the same function the weekly
 * pipeline (scripts/runWeeklyPipeline.ts) uses. It used to carry its own copy of
 * the build sequence, which drifted from the pipeline's: the insight/themes step
 * existed only here and never ran in CI (W04–W37). Keep exactly one build path.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { buildAndSaveWeeklyDigest } from '../digest/buildWeeklyDigest';
import { loadEnv } from '../lib/env';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { runWeeklyChecks, printHealthCheckResults } from '../pipeline/checks/runChecks';
import { checkDigestContentQuality } from '../pipeline/checks/digestContentQuality';

// Load environment variables (must be before any env var access)
loadEnv();

async function loadPodcastScript(weekLabel: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(process.cwd(), 'data', 'weeks', weekLabel, 'podcast-script.txt'), 'utf-8');
  } catch {
    return undefined;
  }
}

function parseWeekArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--week' && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith('--week=')) return args[i].split('=')[1];
  }
  return null;
}

async function main() {
  const weekLabel = parseWeekArg(process.argv.slice(2)) || getCurrentDigestWeek();
  validateWeekLabel(weekLabel);

  try {
    const digest = await buildAndSaveWeeklyDigest(weekLabel);

    const selectedArticles = [
      ...digest.topics.AI_and_Strategy.top,
      ...digest.topics.Ecommerce_Retail_Tech.top,
      ...digest.topics.Luxury_and_Consumer.top,
      ...digest.topics.Jewellery_Industry.top,
    ];
    const podcastScriptText = await loadPodcastScript(weekLabel);

    printHealthCheckResults(runWeeklyChecks({ digest, selectedArticles, podcastScriptText }));

    const quality = checkDigestContentQuality(digest);
    if (quality.ok) {
      console.log(`[Build Weekly Digest] ✓ Content-quality gate passed`);
    } else {
      console.error(`[Build Weekly Digest] ✗ Content-quality gate FAILED:`);
      quality.errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(`[Build Weekly Digest] ✗ Error:`, error);
    process.exit(1);
  }
}

main();
