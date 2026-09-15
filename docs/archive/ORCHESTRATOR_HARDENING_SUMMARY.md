# Weekly Digest Orchestrator Hardening Summary

## ✅ Changes Implemented

### 1. Skip-If-Exists Logic
- ✅ Checks if `data/digests/{weekLabel}.json` exists before building
- ✅ Skips build if exists (unless `FORCE_REBUILD=1` or `--forceRebuild`)
- ✅ Validates existing digest if skipped
- ✅ Runs health checks on existing digest

### 2. Configurable Caps (Environment Variables)
- ✅ `MAX_TOTAL_ARTICLES` (default: 40)
- ✅ `MAX_ARTICLES_PER_CATEGORY` (default: 10)
- ✅ `MIN_ARTICLES_PER_CATEGORY` (default: 3)
- ✅ Caps can be overridden via CLI flags or environment variables

### 3. Validation
- ✅ Validates digest JSON structure (weekLabel, topics, totals)
- ✅ Validates every article has required fields: `title`, `url`, `source`, `published_at`, `summary` (or `snippet`/`aiSummary`)
- ✅ Validates minimum articles per category (fails if < MIN_ARTICLES_PER_CATEGORY)
- ✅ Logs warnings for empty categories (non-blocking)
- ✅ Non-zero exit code on hard failures (malformed digest, missing required fields)

### 4. npm Script
- ✅ Added `digest:weekly` to `package.json` pointing to `scripts/runWeeklyPipeline.ts`

---

## 📋 Test Commands

### Normal Run (Current Week)
```bash
npm run digest:weekly
# or
npx tsx scripts/runWeeklyPipeline.ts
```

### Override Week
```bash
npm run digest:weekly -- --week=2026-W06
# or
npx tsx scripts/runWeeklyPipeline.ts --week=2026-W06
```

### Force Rebuild (Skip Skip-If-Exists)
```bash
FORCE_REBUILD=1 npm run digest:weekly
# or
npx tsx scripts/runWeeklyPipeline.ts --forceRebuild
```

### Override Caps
```bash
MAX_TOTAL_ARTICLES=50 MAX_ARTICLES_PER_CATEGORY=12 MIN_ARTICLES_PER_CATEGORY=4 npm run digest:weekly
# or
npx tsx scripts/runWeeklyPipeline.ts --maxTotalArticles=50 --maxArticlesPerCategory=12 --minArticlesPerCategory=4
```

### Skip Steps
```bash
npm run digest:weekly -- --week=2026-W06 --skipPodcast --skipCover
```

---

## 📁 Expected Output Files

For week `2026-W06` (or current week):

1. **Main Digest**: `data/digests/2026-W06.json`
2. **Email Digest**: `data/weeks/2026-W06/email-digest.json`
3. **Podcast Script**: `data/weeks/2026-W06/podcast-script.txt`
4. **Podcast Metadata**: `data/weeks/2026-W06/podcast.json`
5. **Podcast Audio**: `public/podcast/2026-W06.mp3`
6. **Health Report**: `data/weeks/2026-W06/health.json`
7. **Cover Image**: `public/weekly-images/2026-W06.png` (if cover step runs)

---

## 📝 Expected Logs

### Normal Run (First Time)
```
[Pipeline] Starting weekly pipeline
  Digest week: 2026-W06
  Ingestion week: 2026-W06
  Caps: MAX_TOTAL=40, MAX_PER_CATEGORY=10, MIN_PER_CATEGORY=3

[Pipeline] Step 1/6: Discovery (2026-W06)...
[Pipeline] ✓ Discovery complete (added: 15, updated: 2)

[Pipeline] Step 2/6: Classification (2026-W06)...
[Pipeline] ✓ Classification complete (total: 45)

[Pipeline] Step 3/6: Digest build (2026-W06)...
[Pipeline] ✓ Digest build complete
[Pipeline] Validating digest...
[Pipeline] ✓ Digest validation passed

[Pipeline] Step 4/6: Email digest (2026-W06)...
[Pipeline] ✓ Email digest complete

[Pipeline] Step 5/6: Podcast (2026-W06)...
[Pipeline] ✓ Podcast complete

[Pipeline] Step 6/6: Cover (2026-W06)...
[Pipeline] ✓ Cover complete

[Pipeline] Running health checks...
[Pipeline] Health checks complete (2 warnings)

[Pipeline] ✓ Health report saved to: data/weeks/2026-W06/health.json

=== Pipeline Summary ===
All steps completed successfully ✅
Health warnings: 2
Top warnings:
  - Paywall share is 35.0% (threshold: 30%)
  - Category AI_and_Strategy has 2 articles (minimum: 3)
========================

[Pipeline] ✓ Pipeline completed successfully
```

### Already Exists (Skip)
```
[Pipeline] Starting weekly pipeline
  Digest week: 2026-W06
  Ingestion week: 2026-W06
  Caps: MAX_TOTAL=40, MAX_PER_CATEGORY=10, MIN_PER_CATEGORY=3

[Pipeline] ⚠ Digest already exists for 2026-W06 (data/digests/2026-W06.json)
[Pipeline] Skipping build (use FORCE_REBUILD=1 or --forceRebuild to rebuild)

[Pipeline] Running health checks...
[Pipeline] Health checks complete (2 warnings)

[Pipeline] ✓ Health report saved to: data/weeks/2026-W06/health.json
[Pipeline] ✓ Pipeline skipped (digest already exists)
```

### Validation Failure
```
[Pipeline] Step 3/6: Digest build (2026-W06)...
[Pipeline] ✓ Digest build complete
[Pipeline] Validating digest...
[Pipeline] ✗ Digest validation failed:
  - Topic AI_and_Strategy: has 2 articles, minimum required is 3
  - Topic Ecommerce_Retail_Tech, article 3: missing required fields: summary (snippet/aiSummary/summary)

[Pipeline] ✗ Digest build failed: Digest validation failed: Topic AI_and_Strategy: has 2 articles, minimum required is 3; Topic Ecommerce_Retail_Tech, article 3: missing required fields: summary (snippet/aiSummary/summary)

[Pipeline] ✗ Pipeline completed with 1 failed step(s)
```

---

## 🔧 Configuration

### Environment Variables
- `FORCE_REBUILD=1` - Force rebuild even if digest exists
- `MAX_TOTAL_ARTICLES=40` - Maximum total articles across all categories
- `MAX_ARTICLES_PER_CATEGORY=10` - Maximum articles per category
- `MIN_ARTICLES_PER_CATEGORY=3` - Minimum articles per category (validation threshold)

### CLI Flags
- `--week=YYYY-Www` - Override digest week
- `--ingestionWeek=YYYY-Www` - Override ingestion week
- `--forceRebuild` - Force rebuild even if digest exists
- `--maxTotalArticles=N` - Override max total articles
- `--maxArticlesPerCategory=N` - Override max per category
- `--minArticlesPerCategory=N` - Override min per category
- `--skipPodcast` - Skip podcast generation
- `--skipCover` - Skip cover image generation
- `--skipDiscovery` - Skip discovery step
- `--skipClassification` - Skip classification step
- `--skipEmail` - Skip email digest generation
- `--skipDigest` - Skip digest build (load existing)

---

## ✅ Verification

1. **Build passes**: `npm run build` ✅
2. **TypeScript compiles**: No errors ✅
3. **Skip-if-exists works**: Test with existing digest ✅
4. **Validation works**: Test with malformed digest ✅
5. **Caps work**: Test with overrides ✅

---

## 📄 Files Changed

1. `pipeline/runWeeklyPipeline.ts` - Added skip-if-exists, validation, caps
2. `scripts/runWeeklyPipeline.ts` - Added CLI flags for new options
3. `package.json` - Added `digest:weekly` npm script
4. `AUDIT_ORCHESTRATOR_REPORT.md` - Audit report (new)
5. `ORCHESTRATOR_HARDENING_SUMMARY.md` - This file (new)
