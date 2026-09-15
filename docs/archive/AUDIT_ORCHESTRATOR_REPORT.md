# Weekly Digest Orchestrator Audit Report

## Executive Summary

**Orchestrator EXISTS**: `pipeline/runWeeklyPipeline.ts` (module) + `scripts/runWeeklyPipeline.ts` (CLI wrapper)

**Status**: Functional but missing guardrails (skip-if-exists, caps, validation)

---

## 1. Current Entry Points

### Primary Orchestrator
- **File**: `pipeline/runWeeklyPipeline.ts`
- **CLI Wrapper**: `scripts/runWeeklyPipeline.ts`
- **Command**: `npx tsx scripts/runWeeklyPipeline.ts [--week=YYYY-Www] [--ingestionWeek=YYYY-Www] [--skipPodcast] [--skipCover] [--skipDiscovery] [--skipClassification] [--skipEmail] [--skipDigest]`
- **npm script**: None (not in package.json)

### Alternative Entry Points
- `scripts/buildWeeklyDigest.ts` - Builds digest only (not full pipeline)
- `app/api/build-digest/route.ts` - API endpoint (calls buildWeeklyDigest)

---

## 2. Week Label Computation

- **Method**: `getCurrentDigestWeek()` from `lib/utils/getCurrentDigestWeek.ts`
- **Logic**: Uses Luxon `DateTime.now().setZone('Europe/Copenhagen')` → `formatWeekLabel()`
- **Format**: `YYYY-Www` (e.g., `2026-W06`)
- **Override**: `--week=YYYY-Www` CLI flag

---

## 3. Artifacts Written

The orchestrator writes multiple files:

1. **Main Digest**: `data/digests/{weekLabel}.json`
2. **Email Digest**: `data/weeks/{weekLabel}/email-digest.json`
3. **Podcast Script**: `data/weeks/{weekLabel}/podcast-script.txt`
4. **Podcast Metadata**: `data/weeks/{weekLabel}/podcast.json`
5. **Podcast Audio**: `public/podcast/{weekLabel}.mp3`
6. **Health Report**: `data/weeks/{weekLabel}/health.json`
7. **Cover Image**: `public/weekly-images/{weekLabel}.png` (if cover step runs)

---

## 4. Current Caps & Limits

### Existing Caps (Hardcoded)
- **TOP_N**: 7 articles per category (in `digest/buildWeeklyDigest.ts`)
- **MAX_PER_SOURCE**: 3 articles per source (diversity guard)
- **CANDIDATE_MAX_LLM**: 100 articles for LLM reranking

### Missing Caps
- ❌ **MAX_TOTAL_ARTICLES**: Not enforced
- ❌ **MAX_ARTICLES_PER_CATEGORY**: Not configurable (hardcoded to 7)
- ❌ **MIN_ARTICLES_PER_CATEGORY**: Not validated

---

## 5. Skip-If-Exists Behavior

**Current**: ❌ **NO** - Always runs, overwrites existing digest

**Expected**: Should check if `data/digests/{weekLabel}.json` exists and skip unless `FORCE_REBUILD=1`

---

## 6. Validation

### Existing Validation
- ✅ Week label format validation (`validateWeekLabel()`)
- ✅ Health checks (warn-only, non-blocking):
  - Paywall percent > 30%
  - Category minimums < 3 articles
  - Podcast duration (word count)
  - Domain concentration > 40%

### Missing Validation
- ❌ **Required fields**: No validation that articles have `title`, `url`, `source`, `published_at`, `summary` (or `snippet`/`aiSummary`)
- ❌ **Minimum articles per category**: Health check warns but doesn't fail
- ❌ **Digest structure**: No validation that digest JSON parses correctly and has required keys
- ❌ **Hard failures**: Health checks are warn-only; no non-zero exit code on malformed digests

---

## 7. Issues Found

1. **Bug**: `discoverWeekly()` call in orchestrator uses wrong signature:
   - Current: `discoverWeekly({ weekLabel: ingestionWeek })`
   - Expected: `discoverWeekly({ weekLabel: ingestionWeek, ...options })`
   - Status: Actually correct, but options object is required

2. **Missing npm script**: No `digest:weekly` or similar in package.json

---

## 8. Recommended Hardening

### A. Skip-If-Exists
- Check `data/digests/{weekLabel}.json` exists
- If exists and `FORCE_REBUILD !== '1'`, skip with message
- If `FORCE_REBUILD=1`, proceed with rebuild

### B. Configurable Caps (Environment Variables)
- `MAX_TOTAL_ARTICLES` (default: 40)
- `MAX_ARTICLES_PER_CATEGORY` (default: 10)
- `MIN_ARTICLES_PER_CATEGORY` (default: 3)

### C. Validation
- Validate digest JSON exists and parses
- Validate every article has: `title`, `url`, `source`, `published_at`, `summary` (or `snippet`/`aiSummary`)
- Validate minimum articles per category (fail if < MIN_ARTICLES_PER_CATEGORY)
- Log warnings for empty categories
- Non-zero exit code on hard failures (malformed digest, missing required fields)

---

## 9. Test Commands

### Normal Run (Current Week)
```bash
npx tsx scripts/runWeeklyPipeline.ts
```

### Override Week
```bash
npx tsx scripts/runWeeklyPipeline.ts --week=2026-W06
```

### Skip Steps
```bash
npx tsx scripts/runWeeklyPipeline.ts --week=2026-W06 --skipPodcast --skipCover
```

### Expected Output Path
- `data/digests/2026-W06.json` (or current week)

### Expected Logs (Normal Run)
```
[Pipeline] Starting weekly pipeline
  Digest week: 2026-W06
  Ingestion week: 2026-W06
[Pipeline] Step 1/6: Discovery...
[Pipeline] ✓ Discovery complete
...
[Pipeline] ✓ Pipeline completed successfully
```

### Expected Logs (Already Exists - After Hardening)
```
[Pipeline] Starting weekly pipeline
  Digest week: 2026-W06
[Pipeline] ⚠ Digest already exists for 2026-W06 (data/digests/2026-W06.json)
[Pipeline] Skipping build (use FORCE_REBUILD=1 to rebuild)
[Pipeline] ✓ Pipeline skipped (digest already exists)
```
