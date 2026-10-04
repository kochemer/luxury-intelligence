/**
 * CLI wrapper for weekly pipeline orchestrator
 */

import { loadEnv } from '../lib/env';
import { runWeeklyPipeline, type RunWeeklyPipelineOptions } from '../pipeline/runWeeklyPipeline';
import { validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';

// Load environment variables (must be before any env var access)
loadEnv();

function parseArgs(): RunWeeklyPipelineOptions {
  const args = process.argv.slice(2);
  const options: RunWeeklyPipelineOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--week=')) {
      const week = arg.split('=')[1];
      validateWeekLabel(week);
      options.week = week;
    } else if (arg.startsWith('--ingestionWeek=')) {
      const ingestionWeek = arg.split('=')[1];
      validateWeekLabel(ingestionWeek);
      options.ingestionWeek = ingestionWeek;
    } else if (arg === '--skipRss' || arg === '--skipRss=true') {
      options.skipRss = true;
    } else if (arg === '--skipPages' || arg === '--skipPages=true') {
      options.skipPages = true;
    } else if (arg === '--skipPodcast' || arg === '--skipPodcast=true') {
      options.skipPodcast = true;
    } else if (arg === '--skipCover' || arg === '--skipCover=true') {
      options.skipCover = true;
    } else if (arg === '--skipMarkets' || arg === '--skipMarkets=true') {
      options.skipMarkets = true;
    } else if (arg === '--skipDiscovery' || arg === '--skipDiscovery=true') {
      options.skipDiscovery = true;
    } else if (arg === '--skipClassification' || arg === '--skipClassification=true') {
      options.skipClassification = true;
    } else if (arg === '--skipEmail' || arg === '--skipEmail=true') {
      options.skipEmail = true;
    } else if (arg === '--skipDigest' || arg === '--skipDigest=true') {
      options.skipDigest = true;
    } else if (arg === '--forceRebuild' || arg === '--forceRebuild=true') {
      options.forceRebuild = true;
    } else if (arg.startsWith('--maxTotalArticles=')) {
      options.maxTotalArticles = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--maxArticlesPerCategory=')) {
      options.maxArticlesPerCategory = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--minArticlesPerCategory=')) {
      options.minArticlesPerCategory = parseInt(arg.split('=')[1], 10);
    }
  }

  return options;
}

// Steps whose failure must halt the workflow. Without a digest there is
// nothing to ship, so the run cannot proceed. Every other step is
// best-effort: the website + email + podcast + cover + competitor intel
// can each degrade independently without invalidating the others.
const CRITICAL_STEPS = new Set(['digest']);

async function main() {
  const options = parseArgs();

  try {
    const result = await runWeeklyPipeline(options);

    const failedSteps   = result.steps.filter(s => !s.ok);
    const criticalFails = failedSteps.filter(s => CRITICAL_STEPS.has(s.name));
    const optionalFails = failedSteps.filter(s => !CRITICAL_STEPS.has(s.name));

    if (optionalFails.length > 0) {
      console.warn(`\n[Pipeline] ⚠ ${optionalFails.length} optional step(s) failed (continuing):`);
      optionalFails.forEach(s => console.warn(`  - ${s.name}: ${s.error}`));
    }

    if (criticalFails.length > 0) {
      console.error(`\n[Pipeline] ✗ ${criticalFails.length} critical step(s) failed — halting:`);
      criticalFails.forEach(s => console.error(`  - ${s.name}: ${s.error}`));
      process.exit(1);
    }

    // Content-quality gate is blocking: a digest with no AI summaries or no
    // cover image must not be published, even though every *step* "succeeded".
    // Exiting non-zero here makes the GitHub Actions "Build weekly digest" step
    // fail, which (via its step outcome) prevents the commit-and-push steps from
    // shipping the hollow digest. See .github/workflows/weekly-digest.yml.
    if (result.contentQuality && !result.contentQuality.ok) {
      console.error(`\n[Pipeline] ✗ Content-quality gate failed — halting (digest will not be committed):`);
      result.contentQuality.errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }

    console.log(`\n[Pipeline] ✓ Pipeline completed${optionalFails.length > 0 ? ' (with non-fatal warnings)' : ' successfully'}`);
    process.exit(0);
  } catch (error) {
    console.error(`\n[Pipeline] ✗ Fatal error:`, error);
    process.exit(1);
  }
}

main();
