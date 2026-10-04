/**
 * Weekly pipeline orchestrator
 * Runs the full weekly pipeline end-to-end and persists health report
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getCurrentDigestWeek, getCurrentIngestionWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { discoverWeekly } from '../discovery/discoverWeekly';
import { classifyCurrentWeekArticles } from '../classification/classifyTopics';
import { buildAndSaveWeeklyDigest } from '../digest/buildWeeklyDigest';
import { runWeeklyChecks, type CheckResult } from './checks/runChecks';
import { checkDigestContentQuality, type DigestContentQualityResult } from './checks/digestContentQuality';
import type { WeeklyDigest } from '../lib/types';
import { runRssIngestion } from '../ingestion/fetchRss';
import { runPageIngestion } from '../ingestion/fetchPages';
import { resetYieldStats, saveYieldReport } from '../ingestion/sourceYield';

// Import email, podcast, cover functions (will create these)
import { buildWeeklyEmailDigest } from '../email/buildWeeklyEmailDigest';
import { buildWeeklyPodcast } from '../podcast/buildWeeklyPodcast';
import { regenerateCover } from '../digest/regenerateCover';
import { printModelRouting } from '../lib/llm/models';
import { buildMarkets } from '../markets/buildMarkets';
import { pingIndexNowForWeek } from '../lib/utils/indexNow';

export type RunWeeklyPipelineOptions = {
  week?: string;               // digest week override
  ingestionWeek?: string;      // ingestion week override
  skipRss?: boolean;           // Skip RSS ingestion
  skipPages?: boolean;         // Skip page ingestion
  skipPodcast?: boolean;
  skipCover?: boolean;
  skipDiscovery?: boolean;
  skipClassification?: boolean;
  skipEmail?: boolean;
  skipDigest?: boolean;
  /** Skip the Markets pages build (replaced Competitor Watch on 2026-10-04). */
  skipMarkets?: boolean;
  forceRebuild?: boolean;      // Force rebuild even if digest exists
  maxTotalArticles?: number;   // Max total articles across all categories (default: 40)
  maxArticlesPerCategory?: number; // Max articles per category (default: 10)
  minArticlesPerCategory?: number; // Min articles per category (default: 3)
};

export type PipelineStep = {
  name: string;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  error?: string;
};

export type PipelineResult = {
  digestWeek: string;
  ingestionWeek: string;
  startedAt: string;
  finishedAt: string;
  steps: PipelineStep[];
  health: CheckResult;
  contentQuality?: DigestContentQualityResult;
  versions?: {
    node?: string;
    gitCommit?: string;
  };
};

/**
 * Get git commit hash (guarded, returns undefined if fails)
 */
function getGitCommit(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Run a pipeline step with error handling
 */
async function runStep<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ ok: boolean; result?: T; error?: string; startedAt: string; finishedAt: string }> {
  const startedAt = new Date().toISOString();
  try {
    const result = await fn();
    const finishedAt = new Date().toISOString();
    return { ok: true, result, startedAt, finishedAt };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMessage, startedAt, finishedAt };
  }
}

/**
 * Load digest for health checks
 */
async function loadDigest(weekLabel: string): Promise<WeeklyDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as WeeklyDigest;
  } catch {
    return null;
  }
}

/**
 * Check if digest already exists
 */
async function digestExists(weekLabel: string): Promise<boolean> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
    await fs.access(digestPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate digest structure and required fields
 */
function validateDigest(digest: WeeklyDigest, options: { minArticlesPerCategory: number }): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate top-level structure
  if (!digest.weekLabel) errors.push('Missing weekLabel');
  if (!digest.topics) errors.push('Missing topics');
  if (!digest.totals) errors.push('Missing totals');

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Validate each topic
  const topicKeys: Array<keyof typeof digest.topics> = [
    'AI_and_Strategy',
    'Ecommerce_Retail_Tech',
    'Luxury_and_Consumer',
    'Jewellery_Industry',
  ];

  for (const topicKey of topicKeys) {
    const topic = digest.topics[topicKey];
    if (!topic) {
      errors.push(`Missing topic: ${topicKey}`);
      continue;
    }

    if (!Array.isArray(topic.top)) {
      errors.push(`Topic ${topicKey}: top must be an array`);
      continue;
    }

    // Check minimum articles per category (warning only, not fatal)
    if (topic.top.length < options.minArticlesPerCategory) {
      warnings.push(`Topic ${topicKey}: has ${topic.top.length} articles, minimum recommended is ${options.minArticlesPerCategory}`);
    }

    // Validate each article in the topic
    for (let i = 0; i < topic.top.length; i++) {
      const article = topic.top[i];
      const articleErrors: string[] = [];

      if (!article.title || typeof article.title !== 'string' || article.title.trim().length === 0) {
        articleErrors.push('title');
      }
      if (!article.url || typeof article.url !== 'string' || article.url.trim().length === 0) {
        articleErrors.push('url');
      }
      if (!article.source || typeof article.source !== 'string' || article.source.trim().length === 0) {
        articleErrors.push('source');
      }
      if (!article.published_at || typeof article.published_at !== 'string' || article.published_at.trim().length === 0) {
        articleErrors.push('published_at');
      }
      // Summary can be snippet, aiSummary, or summary
      const hasSummary = (article.snippet && article.snippet.trim().length > 0) ||
                        (article.aiSummary && article.aiSummary.trim().length > 0) ||
                        (article.summary && article.summary.trim().length > 0);
      if (!hasSummary) {
        articleErrors.push('summary (snippet/aiSummary/summary)');
      }

      if (articleErrors.length > 0) {
        errors.push(`Topic ${topicKey}, article ${i + 1}: missing required fields: ${articleErrors.join(', ')}`);
      }
    }

    // Warn if category is empty (but don't fail)
    if (topic.top.length === 0) {
      warnings.push(`Topic ${topicKey}: has no articles`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Load podcast script text if available
 */
async function loadPodcastScript(weekLabel: string): Promise<string | undefined> {
  try {
    const scriptPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'podcast-script.txt');
    return await fs.readFile(scriptPath, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Run the full weekly pipeline
 */
export async function runWeeklyPipeline(options: RunWeeklyPipelineOptions = {}): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();
  const steps: PipelineStep[] = [];

  // Determine weeks
  const digestWeek = options.week || getCurrentDigestWeek();
  const ingestionWeek = options.ingestionWeek || getCurrentIngestionWeek();
  
  validateWeekLabel(digestWeek);
  validateWeekLabel(ingestionWeek);

  // Get configuration from environment or defaults
  const forceRebuild = options.forceRebuild || process.env.FORCE_REBUILD === '1';
  const maxTotalArticles = options.maxTotalArticles || parseInt(process.env.MAX_TOTAL_ARTICLES || '40', 10);
  const maxArticlesPerCategory = options.maxArticlesPerCategory || parseInt(process.env.MAX_ARTICLES_PER_CATEGORY || '10', 10);
  const minArticlesPerCategory = options.minArticlesPerCategory || parseInt(process.env.MIN_ARTICLES_PER_CATEGORY || '3', 10);

  console.log(`[Pipeline] Starting weekly pipeline`);
  console.log(`  Digest week: ${digestWeek}`);
  console.log(`  Ingestion week: ${ingestionWeek}`);
  console.log(`  Caps: MAX_TOTAL=${maxTotalArticles}, MAX_PER_CATEGORY=${maxArticlesPerCategory}, MIN_PER_CATEGORY=${minArticlesPerCategory}`);
  printModelRouting();
  console.log('');

  // Check if digest already exists (skip-if-exists)
  if (!forceRebuild && !options.skipDigest) {
    const exists = await digestExists(digestWeek);
    if (exists) {
      console.log(`[Pipeline] ⚠ Digest already exists for ${digestWeek} (data/digests/${digestWeek}.json)`);
      console.log(`[Pipeline] Skipping build (use FORCE_REBUILD=1 or --forceRebuild to rebuild)`);
      console.log('');

      // Load existing digest for validation and health checks
      const existingDigest = await loadDigest(digestWeek);
      if (existingDigest) {
        // Validate existing digest (warn-only, don't fail workflow)
        const validation = validateDigest(existingDigest, { minArticlesPerCategory });
        if (!validation.valid) {
          console.warn(`[Pipeline] ⚠ Existing digest has validation issues:`);
          validation.errors.forEach(err => console.warn(`  - ${err}`));
          console.warn(`[Pipeline] Consider using FORCE_REBUILD=1 to rebuild if issues need fixing`);
          // Don't throw - just warn, since we're skipping the build anyway
        }
        if (validation.warnings.length > 0) {
          console.warn(`[Pipeline] ⚠ Validation warnings:`);
          validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
        }

        // Run health checks on existing digest
        const allTopArticles = [
          ...existingDigest.topics.AI_and_Strategy.top,
          ...existingDigest.topics.Ecommerce_Retail_Tech.top,
          ...existingDigest.topics.Luxury_and_Consumer.top,
          ...existingDigest.topics.Jewellery_Industry.top,
        ];
        const podcastScriptText = await loadPodcastScript(digestWeek);
        const health = runWeeklyChecks({
          digest: existingDigest,
          selectedArticles: allTopArticles,
          podcastScriptText,
        });

        const contentQuality = checkDigestContentQuality(existingDigest);
        if (!contentQuality.ok) {
          console.warn(`[Pipeline] ⚠ Existing digest fails content-quality gate:`);
          contentQuality.errors.forEach(err => console.warn(`  - ${err}`));
        }

        const result: PipelineResult = {
          digestWeek,
          ingestionWeek,
          startedAt,
          finishedAt: new Date().toISOString(),
          steps: [{ name: 'skip', ok: true, startedAt, finishedAt: new Date().toISOString() }],
          health,
          contentQuality,
          versions: {
            node: process.version,
            gitCommit: getGitCommit(),
          },
        };

        // Save health report
        const healthReportPath = path.join(process.cwd(), 'data', 'weeks', digestWeek, 'health.json');
        await fs.mkdir(path.dirname(healthReportPath), { recursive: true });
        await fs.writeFile(healthReportPath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`[Pipeline] ✓ Health report saved to: ${healthReportPath}`);
        console.log(`[Pipeline] ✓ Pipeline skipped (digest already exists)`);
        return result;
      }
    }
  }

  // Reset yield stats at start of ingestion
  resetYieldStats();

  // Step 1: RSS Ingestion
  if (!options.skipRss) {
    const step = await runStep('rss', async () => {
      console.log(`[Pipeline] Step 1/8: RSS Ingestion...`);
      return await runRssIngestion();
    });
    steps.push({
      name: 'rss',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ RSS ingestion failed: ${step.error}`);
    } else {
      console.log(`[Pipeline] ✓ RSS ingestion complete (added: ${step.result?.added || 0}, updated: ${step.result?.updated || 0})`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping RSS ingestion`);
  }

  // Step 2: Page Ingestion
  if (!options.skipPages) {
    const step = await runStep('pages', async () => {
      console.log(`[Pipeline] Step 2/8: Page Ingestion...`);
      return await runPageIngestion();
    });
    steps.push({
      name: 'pages',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Page ingestion failed: ${step.error}`);
    } else {
      console.log(`[Pipeline] ✓ Page ingestion complete (added: ${step.result?.added || 0})`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping page ingestion`);
  }

  // Save yield report after RSS and page ingestion
  await saveYieldReport();
  console.log(`[Pipeline] ✓ Source yield report saved to data/source_yield.json`);
  console.log('');

  // Step 3: Discovery (ingestion week)
  if (!options.skipDiscovery) {
    const step = await runStep('discovery', async () => {
      console.log(`[Pipeline] Step 3/8: Discovery (${ingestionWeek})...`);
      return await discoverWeekly({ weekLabel: ingestionWeek });
    });
    steps.push({
      name: 'discovery',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Discovery failed: ${step.error}`);
    } else {
      console.log(`[Pipeline] ✓ Discovery complete (added: ${step.result?.added || 0}, updated: ${step.result?.updated || 0})`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping discovery`);
  }

  // Step 4: Classification (digest week)
  if (!options.skipClassification) {
    const step = await runStep('classification', async () => {
      console.log(`[Pipeline] Step 4/8: Classification (${digestWeek})...`);
      const { DateTime } = await import('luxon');
      const weekMatch = digestWeek.match(/^(\d{4})-W(\d{1,2})$/);
      if (!weekMatch) {
        throw new Error(`Invalid week format: ${digestWeek}`);
      }
      const year = parseInt(weekMatch[1], 10);
      const weekNumber = parseInt(weekMatch[2], 10);
      const dt = DateTime.fromObject({ weekYear: year, weekNumber }, { zone: 'Europe/Copenhagen' });
      if (!dt.isValid) {
        throw new Error(`Invalid week: ${digestWeek}`);
      }
      return await classifyCurrentWeekArticles(dt.toJSDate());
    });
    steps.push({
      name: 'classification',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Classification failed: ${step.error}`);
    } else {
      const byTopic = step.result?.byTopic;
      const total = byTopic ? Object.values(byTopic).reduce((sum, arr) => sum + arr.length, 0) : 0;
      console.log(`[Pipeline] ✓ Classification complete (total: ${total})`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping classification`);
  }

  // Step 5: Digest build (digest week)
  let digest: WeeklyDigest | null = null;
  if (!options.skipDigest) {
    const step = await runStep('digest', async () => {
      console.log(`[Pipeline] Step 5/8: Digest build (${digestWeek})...`);
      return await buildAndSaveWeeklyDigest(digestWeek);
    });
    steps.push({
      name: 'digest',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Digest build failed: ${step.error}`);
    } else {
      digest = step.result || null;
      console.log(`[Pipeline] ✓ Digest build complete`);

      // Validate digest after build
      if (digest) {
        console.log(`[Pipeline] Validating digest...`);
        const validation = validateDigest(digest, { minArticlesPerCategory });
        
        if (validation.warnings.length > 0) {
          console.warn(`[Pipeline] ⚠ Validation warnings:`);
          validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
        }

        if (!validation.valid) {
          console.error(`[Pipeline] ✗ Digest validation failed:`);
          validation.errors.forEach(err => console.error(`  - ${err}`));
          // Only fail on structural errors (missing fields, malformed data)
          // Warnings (like minimum articles) are logged but don't fail the pipeline
          if (validation.errors.length > 0) {
            throw new Error(`Digest validation failed: ${validation.errors.join('; ')}`);
          }
        }

        // Check caps
        const totalArticles = [
          ...digest.topics.AI_and_Strategy.top,
          ...digest.topics.Ecommerce_Retail_Tech.top,
          ...digest.topics.Luxury_and_Consumer.top,
          ...digest.topics.Jewellery_Industry.top,
        ].length;

        if (totalArticles > maxTotalArticles) {
          console.warn(`[Pipeline] ⚠ Total articles (${totalArticles}) exceeds MAX_TOTAL_ARTICLES (${maxTotalArticles})`);
        }

        const topicKeys: Array<keyof typeof digest.topics> = [
          'AI_and_Strategy',
          'Ecommerce_Retail_Tech',
          'Luxury_and_Consumer',
          'Jewellery_Industry',
        ];

        for (const topicKey of topicKeys) {
          const topic = digest.topics[topicKey];
          if (topic.top.length > maxArticlesPerCategory) {
            console.warn(`[Pipeline] ⚠ Topic ${topicKey}: ${topic.top.length} articles exceeds MAX_ARTICLES_PER_CATEGORY (${maxArticlesPerCategory})`);
          }
        }

        console.log(`[Pipeline] ✓ Digest validation passed`);
      }
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping digest build`);
    // Try to load existing digest for health checks
    digest = await loadDigest(digestWeek);
    if (digest) {
      // Validate loaded digest
      const validation = validateDigest(digest, { minArticlesPerCategory });
      if (!validation.valid) {
        console.error(`[Pipeline] ✗ Loaded digest is invalid:`);
        validation.errors.forEach(err => console.error(`  - ${err}`));
        throw new Error(`Loaded digest is invalid: ${validation.errors.join('; ')}`);
      }
    }
  }

  // Step 4: Email digest (digest week)
  if (!options.skipEmail) {
    const step = await runStep('email', async () => {
      console.log(`[Pipeline] Step 6/8: Email digest (${digestWeek})...`);
      return await buildWeeklyEmailDigest(digestWeek);
    });
    steps.push({
      name: 'email',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Email digest failed: ${step.error}`);
    } else {
      console.log(`[Pipeline] ✓ Email digest complete`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping email digest`);
  }

  // Step 5: Podcast (digest week)
  if (!options.skipPodcast) {
    const step = await runStep('podcast', async () => {
      console.log(`[Pipeline] Step 7/8: Podcast (${digestWeek})...`);
      return await buildWeeklyPodcast(digestWeek);
    });
    steps.push({
      name: 'podcast',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Podcast failed: ${step.error}`);
    } else {
      console.log(`[Pipeline] ✓ Podcast complete`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping podcast`);
  }

  // Step 6: Cover (digest week)
  if (!options.skipCover) {
    const step = await runStep('cover', async () => {
      console.log(`[Pipeline] Step 8/8: Cover (${digestWeek})...`);
      return await regenerateCover(digestWeek);
    });
    steps.push({
      name: 'cover',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Cover failed: ${step.error}`);
    } else {
      console.log(`[Pipeline] ✓ Cover complete`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping cover`);
  }

  // Step 9: Markets pages (share of voice, moves, prices). Non-critical: a
  // failure here never blocks the digest. Reads the digest built above.
  if (!options.skipMarkets) {
    const step = await runStep('markets', async () => {
      console.log(`[Pipeline] Step 9/9: Markets pages (${digestWeek})...`);
      return await buildMarkets();
    });
    steps.push({
      name: 'markets',
      ok: step.ok,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      error: step.error,
    });
    if (!step.ok) {
      console.error(`[Pipeline] ✗ Markets build failed: ${step.error}`);
    } else {
      console.log(`[Pipeline] ✓ Markets pages built`);
    }
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping markets pages`);
  }

  // Run health checks (if digest is available)
  let health: CheckResult = { warnings: [] };
  if (digest) {
    console.log(`[Pipeline] Running health checks...`);
    const allTopArticles = [
      ...digest.topics.AI_and_Strategy.top,
      ...digest.topics.Ecommerce_Retail_Tech.top,
      ...digest.topics.Luxury_and_Consumer.top,
      ...digest.topics.Jewellery_Industry.top,
    ];
    const podcastScriptText = await loadPodcastScript(digestWeek);
    health = runWeeklyChecks({
      digest,
      selectedArticles: allTopArticles,
      podcastScriptText,
    });
    console.log(`[Pipeline] Health checks complete (${health.warnings.length} warnings)`);
    console.log('');
  } else {
    console.log(`[Pipeline] Skipping health checks (no digest available)`);
    console.log('');
  }

  // Content-quality gate (BLOCKING). Reload the digest from disk so we see the
  // final artifact — the cover step (regenerateCover) writes coverImageUrl back
  // to the JSON after the in-memory `digest` was produced.
  let contentQuality: DigestContentQualityResult | undefined;
  const finalDigest = await loadDigest(digestWeek);
  if (finalDigest) {
    contentQuality = checkDigestContentQuality(finalDigest);
    if (contentQuality.ok) {
      console.log(
        `[Pipeline] ✓ Content-quality gate passed ` +
          `(summaries ${contentQuality.summarizedCount}/${contentQuality.selectedCount}, cover: ${contentQuality.hasCover ? 'yes' : 'no'})`
      );
    } else {
      console.error(`[Pipeline] ✗ Content-quality gate FAILED:`);
      contentQuality.errors.forEach(err => console.error(`  - ${err}`));
    }
    console.log('');
  }

  const finishedAt = new Date().toISOString();

  // Build result
  const result: PipelineResult = {
    digestWeek,
    ingestionWeek,
    startedAt,
    finishedAt,
    steps,
    health,
    contentQuality,
    versions: {
      node: process.version,
      gitCommit: getGitCommit(),
    },
  };

  // Ping IndexNow so search engines crawl the new digest promptly
  await pingIndexNowForWeek(digestWeek);

  // Save health report
  const healthReportPath = path.join(process.cwd(), 'data', 'weeks', digestWeek, 'health.json');
  await fs.mkdir(path.dirname(healthReportPath), { recursive: true });
  await fs.writeFile(healthReportPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[Pipeline] ✓ Health report saved to: ${healthReportPath}`);

  // Print summary
  console.log('');
  console.log('=== Pipeline Summary ===');
  const failedSteps = steps.filter(s => !s.ok);
  if (failedSteps.length === 0) {
    console.log('All steps completed successfully ✅');
  } else {
    console.log(`✗ ${failedSteps.length} step(s) failed:`);
    failedSteps.forEach(step => {
      console.log(`  - ${step.name}: ${step.error}`);
    });
  }
  console.log(`Health warnings: ${health.warnings.length}`);
  if (health.warnings.length > 0) {
    console.log('Top warnings:');
    health.warnings.slice(0, 5).forEach(warn => {
      console.log(`  - ${warn}`);
    });
  }
  console.log('========================');
  console.log('');

  return result;
}
