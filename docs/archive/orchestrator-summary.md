# Weekly Pipeline Orchestrator Summary

## Overview

The `runWeeklyPipeline` orchestrator (`pipeline/runWeeklyPipeline.ts`) runs the complete weekly digest pipeline end-to-end. It coordinates all steps from article ingestion to final publication artifacts.

## What the Orchestrator Runs (8 Steps)

### Step 1: RSS Ingestion ✅
- **Module**: `ingestion/fetchRss.ts`
- **Function**: `runRssIngestion()`
- **What it does**:
  - Fetches articles from configured RSS feeds
  - Parses RSS XML and extracts article metadata
  - Deduplicates articles by URL
  - Merges new articles into `data/articles.json`
  - Updates existing articles with new snippets if available
- **Output**: Articles added to `data/articles.json`
- **Skip flag**: `--skipRss`
- **Yield tracking**: Yes (tracks RSS feed performance)

### Step 2: Page Ingestion ✅
- **Module**: `ingestion/fetchPages.ts`
- **Function**: `runPageIngestion()`
- **What it does**:
  - Fetches static pages from configured sources
  - Extracts articles using CSS selectors
  - Parses article content and metadata
  - Merges into `data/articles.json`
- **Output**: Articles added to `data/articles.json`
- **Skip flag**: `--skipPages`
- **Yield tracking**: Yes (tracks page source performance)

**After Steps 1-2**: Source yield report saved to `data/source_yield.json`

### Step 3: Web Discovery ✅
- **Module**: `discovery/discoverWeekly.ts`
- **Function**: `discoverWeekly()`
- **What it does**:
  - Generates search queries per topic (LLM-based, cached)
  - Searches web via Tavily API
  - Fetches and extracts article content
  - Selects top articles per category (LLM-based selection)
  - Merges into `data/articles.json`
- **Output**: Articles added to `data/articles.json`, discovery report in `data/weeks/{week}/discovery/`
- **Skip flag**: `--skipDiscovery`
- **Week used**: `ingestionWeek` (default: current ingestion week)

### Step 4: Classification ✅
- **Module**: `classification/classifyTopics.ts`
- **Function**: `classifyCurrentWeekArticles()`
- **What it does**:
  - Classifies articles into topics (AI & Strategy, Ecommerce & Retail Tech, Luxury & Consumer, Jewellery Industry)
  - Uses keyword matching + source heuristics
  - Pure function, no caching needed
- **Output**: Articles tagged with topic classifications
- **Skip flag**: `--skipClassification`
- **Week used**: `digestWeek` (default: current digest week)

### Step 5: Digest Build ✅
- **Module**: `digest/buildWeeklyDigest.ts`
- **Function**: `buildAndSaveWeeklyDigest()`
- **What it does**:
  - Filters articles by week date range (CET timezone)
  - Applies relevance scoring (LLM-based reranking)
  - Selects top N per topic (default: 7)
  - Applies diversity constraints (max 3 per source)
  - Generates AI summaries for articles
  - Translates titles/summaries to Danish (DA) and Spanish (ES)
  - Generates weekly intro text
  - Generates cover image scene description
  - Saves digest JSON to `data/digests/{week}.json`
- **Output**: `data/digests/{weekLabel}.json`
- **Skip flag**: `--skipDigest`
- **Week used**: `digestWeek` (default: current digest week)
- **Validation**: Validates digest structure and required fields (warnings for low article counts)

### Step 6: Email Digest Build ✅
- **Module**: `email/buildWeeklyEmailDigest.ts`
- **Function**: `buildWeeklyEmailDigest()`
- **What it does**:
  - Generates email-friendly digest format
  - Creates structured email content
  - Saves to `data/weeks/{week}/email-digest.json`
- **Output**: `data/weeks/{weekLabel}/email-digest.json`
- **Skip flag**: `--skipEmail`
- **Week used**: `digestWeek`

### Step 7: Podcast Build ✅
- **Module**: `podcast/buildWeeklyPodcast.ts`
- **Function**: `buildWeeklyPodcast()`
- **What it does**:
  - Generates podcast script from digest
  - Synthesizes audio using OpenAI TTS (or ElevenLabs if configured)
  - Saves script and audio file
- **Output**: 
  - Script: `data/weeks/{week}/podcast-script.txt`
  - Audio: `public/podcast/{weekLabel}.mp3`
- **Skip flag**: `--skipPodcast`
- **Week used**: `digestWeek`

### Step 8: Cover Regeneration ✅
- **Module**: `digest/regenerateCover.ts`
- **Function**: `regenerateCover()`
- **What it does**:
  - Generates cover image using AI (DALL-E or similar)
  - Updates digest JSON with cover image URL
- **Output**: Cover image URL in digest JSON
- **Skip flag**: `--skipCover`
- **Week used**: `digestWeek`

### After All Steps: Health Checks ✅
- **Module**: `pipeline/checks/runChecks.ts`
- **Function**: `runWeeklyChecks()`
- **What it checks**:
  - Paywall percentage (< 30%)
  - Category minimums (≥ 3 articles per category) - **warning only**
  - Podcast script length (1500-3500 words)
  - Domain concentration (< 40% per category)
- **Output**: Health report saved to `data/weeks/{digestWeek}/health.json`

## What the Orchestrator Does NOT Run

### ❌ Email Sending
- **Why**: Email sending is a separate process with its own safety controls
- **How to run**: `npm run email:weekly` (separate script)
- **Location**: `scripts/sendWeeklyEmailDigest.ts`
- **Note**: Email sending is integrated into GitHub Actions workflow separately

### ❌ Manual Article Curation
- The orchestrator does not provide UI or manual review steps
- All article selection is automated

### ❌ Content Moderation
- Controversial content filtering happens during discovery/selection
- No separate moderation step

### ❌ Analytics/Reporting (beyond health checks)
- No separate analytics aggregation
- Health checks provide basic metrics

## Configuration Options

### Week Overrides
- `--week=YYYY-Www`: Override digest week (default: current digest week)
- `--ingestionWeek=YYYY-Www`: Override ingestion week (default: current ingestion week)

### Skip Flags
- `--skipRss`: Skip RSS ingestion
- `--skipPages`: Skip page ingestion
- `--skipDiscovery`: Skip web discovery
- `--skipClassification`: Skip classification
- `--skipDigest`: Skip digest build
- `--skipEmail`: Skip email digest build
- `--skipPodcast`: Skip podcast build
- `--skipCover`: Skip cover regeneration

### Force Rebuild
- `--forceRebuild`: Force rebuild even if digest already exists
- `FORCE_REBUILD=1`: Environment variable equivalent

### Article Limits
- `--maxTotalArticles=N`: Max total articles across all categories (default: 40)
- `--maxArticlesPerCategory=N`: Max articles per category (default: 10)
- `--minArticlesPerCategory=N`: Min articles per category (default: 3, warning only)

### Environment Variables
- `MAX_TOTAL_ARTICLES`: Max total articles (default: 40)
- `MAX_ARTICLES_PER_CATEGORY`: Max per category (default: 10)
- `MIN_ARTICLES_PER_CATEGORY`: Min per category (default: 3)

## Execution Flow

```
1. RSS Ingestion → data/articles.json
2. Page Ingestion → data/articles.json
   └─> Save yield report
3. Web Discovery → data/articles.json + discovery reports
4. Classification → Articles tagged with topics
5. Digest Build → data/digests/{week}.json
   └─> Validation (warnings for low counts)
6. Email Digest → data/weeks/{week}/email-digest.json
7. Podcast → public/podcast/{week}.mp3
8. Cover → Cover image URL in digest JSON
   └─> Health checks → data/weeks/{week}/health.json
```

## Skip-if-Exists Logic

- **Digest**: If `data/digests/{week}.json` exists and `FORCE_REBUILD` is not set, the entire pipeline is skipped
- **Other steps**: No skip-if-exists logic (always runs if not skipped)

## Exit Codes

- **0**: All steps completed successfully
- **1**: One or more steps failed

## Artifacts Generated

1. `data/articles.json` - All articles (updated by RSS, pages, discovery)
2. `data/source_yield.json` - Source performance metrics
3. `data/weeks/{week}/discovery/` - Discovery reports and artifacts
4. `data/digests/{weekLabel}.json` - Main digest JSON
5. `data/weeks/{week}/email-digest.json` - Email digest format
6. `data/weeks/{week}/podcast-script.txt` - Podcast script
7. `public/podcast/{weekLabel}.mp3` - Podcast audio
8. `data/weeks/{week}/health.json` - Health check report

## Usage

```bash
# Run full pipeline
npm run digest:weekly

# Run with week override
npm run digest:weekly -- --week=2026-W07

# Skip optional steps
npm run digest:weekly -- --skipPodcast --skipCover

# Force rebuild
npm run digest:weekly -- --forceRebuild
```

## Integration Points

- **GitHub Actions**: `.github/workflows/weekly-digest.yml` runs `npm run digest:weekly`
- **Email Sending**: Separate step in GitHub Actions workflow (after digest build)
- **Manual Runs**: Can be run locally or via GitHub Actions manual trigger
