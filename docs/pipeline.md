# Pipeline Documentation

## Overview

The Luxury Intelligence pipeline produces a weekly digest of curated articles across four topics:
- **AI & Strategy**: AI/ML research, industry strategy, technology trends
- **Ecommerce & Retail Tech**: E-commerce platforms, retail technology, payment systems
- **Luxury & Consumer**: Consumer behavior, luxury brands, fashion trends
- **Jewellery Industry**: Jewelry news, gemstones, luxury watches, industry updates

The system ingests articles from RSS feeds and web discovery, classifies them by topic, selects and reranks the most relevant articles, generates AI summaries and translations, and produces:
- Weekly digest JSON (`data/digests/{week}.json`)
- Email digest JSON (`data/weeks/{week}/email-digest.json`)
- Podcast script and audio (`data/weeks/{week}/podcast-script.txt`, `public/podcast/{week}.mp3`)
- Cover image metadata (stored in digest JSON)

---

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   INGEST    │────▶│  DISCOVER   │────▶│  CLASSIFY   │────▶│   SELECT    │
│             │     │             │     │             │     │   & RERANK  │
│ RSS + Pages │     │ Web Search  │     │  Keywords   │     │  LLM + det. │
│             │     │  (Tavily)   │     │  + Source   │     │  fallback   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                                       │                       │
      ▼                                       ▼                       ▼
data/articles.json          data/weeks/{week}/          data/digests/{week}.json
                           discoveryArticles.json

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  PUBLISH    │────▶│   PODCAST   │────▶│    EMAIL    │
│             │     │             │     │             │
│ Cover Image │     │ Script + TTS│     │ Email Digest│
└─────────────┘     └─────────────┘     └─────────────┘
      │                       │                       │
      ▼                       ▼                       ▼
digest.coverImageUrl    public/podcast/      data/weeks/{week}/
                        {week}.mp3           email-digest.json
```

### Step-by-Step Flow

1. **Ingestion** (`ingestion/`)
   - Fetch RSS feeds → parse articles → save to `data/articles.json`
   - Fetch static pages → extract articles → merge into `data/articles.json`
   - Articles include: `id`, `title`, `url`, `source`, `published_at`, `ingested_at`, `snippet`

2. **Discovery** (`discovery/`)
   - Generate search queries per topic (LLM-based, cached)
   - Search web via Tavily API
   - Fetch and extract article content
   - Select top articles per category (LLM-based selection)
   - Merge into `data/articles.json`

3. **Classification** (`classification/`)
   - Classify each article into one of four topics
   - Uses keyword matching + source heuristics
   - Pure function, no caching needed

4. **Selection & Reranking** (`digest/`)
   - Filter articles by week date range (CET timezone)
   - Apply relevance scoring (LLM-based reranking with deterministic fallback)
   - Select top N per topic (default: 7)
   - Apply diversity constraints (max 3 per source)

5. **Publishing** (`digest/`, `podcast/`, `email/`)
   - Generate AI summaries for selected articles
   - Translate titles/summaries to Danish (DA) and Spanish (ES)
   - Generate weekly intro text
   - Generate cover image scene description
   - Build email digest format
   - Generate podcast script
   - Synthesize podcast audio (OpenAI TTS)

6. **Health Checks** (`pipeline/checks/`)
   - Validate paywall percentage (< 30%)
   - Check category minimums (≥ 3 articles per category)
   - Validate podcast script length (1500-3500 words)
   - Check domain concentration (< 40% per category)

---

## Key Modules and Responsibilities

### `ingestion/`
**Purpose**: Collect articles from RSS feeds and static pages

- `runIngestion.ts`: Main entry point, orchestrates RSS + page + discovery ingestion
- `fetchRss.ts`: Parse RSS feeds, extract articles, merge into `data/articles.json`
- `fetchPages.ts`: Fetch static pages, extract articles using CSS selectors
- `sources.ts`: RSS feed and page source definitions

**Key Functions**:
- `runRssIngestion()`: Fetch all RSS feeds, parse, deduplicate, save
- `runPageIngestion()`: Fetch static pages, extract articles, save
- `runWebDiscovery()`: Wrapper around discovery pipeline (see `discovery/`)

---

### `discovery/`
**Purpose**: Discover additional articles via web search (Tavily API)

- `queryDirector.ts`: Generate search queries per topic (LLM-based, cached)
- `queryDelta.ts`: Generate delta queries based on last week's themes
- `searchProvider.ts`: Tavily API integration, search execution
- `fetchExtract.ts`: Fetch HTML, extract article content
- `selectTop.ts`: LLM-based selection of top articles per category
- `mergeArticles.ts`: Merge selected articles into `data/articles.json`

**Key Functions**:
- `generateSearchQueries(weekLabel, discoveryDir)`: Generate queries (cached)
- `searchWithTavily(queries, maxCandidates, discoveryDir)`: Execute searches
- `fetchAndExtractArticles(searchResults, discoveryDir)`: Extract content
- `selectTopArticles(articles, topN, weekLabel, discoveryDir)`: Select top N
- `mergeDiscoveryArticles(selected, weekLabel)`: Merge into main articles.json

**Artifacts** (in `data/weeks/{week}/discovery/`):
- `queries.json`: Generated queries per topic
- `serp-results.json`: Raw search results
- `candidates.json`: Normalized candidates
- `fetch/{hash}.html`: Cached HTML
- `extracted/{hash}.json`: Extracted article content
- `selected-top20.json`: Final selected articles

---

### `classification/`
**Purpose**: Classify articles into topics

- `classifyTopics.ts`: Keyword-based classification with source heuristics

**Key Functions**:
- `classifyTopic(article)`: Returns one of: `AI_and_Strategy`, `Ecommerce_Retail_Tech`, `Luxury_and_Consumer`, `Jewellery_Industry`

**Classification Rules**:
- Source-based overrides (jewellery sources → Jewellery_Industry, etc.)
- Keyword matching in title + summary (Ecommerce) or title + source (others)
- Priority order: AI_and_Strategy > Ecommerce_Retail_Tech > Luxury_and_Consumer > Jewellery_Industry
- Fallback: Luxury_and_Consumer (if consumer-ish) or Ecommerce_Retail_Tech (default)

---

### `digest/`
**Purpose**: Build weekly digest, select top articles, generate summaries/translations

- `buildWeeklyDigest.ts`: Main digest builder, orchestrates selection, reranking, summaries, translations
- `rerankArticles.ts`: LLM-based reranking with deterministic fallback (cached)
- `generateSummaries.ts`: Generate AI summaries for articles (cached)
- `generateIntro.ts`: Generate weekly intro text (cached)
- `sceneDirector.ts`: Generate cover image scene descriptions (cached)
- `themes.ts`: Generate weekly themes (cached)

**Key Functions**:
- `buildWeeklyDigest(weekLabel)`: Build digest structure (no summaries/translations)
- `buildAndSaveWeeklyDigest(weekLabel, options?)`: Full build + save (includes summaries/translations)
- `rerankArticles(articles, topic, weekStart, weekEnd, weekLabel)`: Rerank articles (cached)
- `generateSummariesForDigest(digest)`: Generate summaries for all top articles (cached)
- `translateDigestArticles(articles)`: Translate titles/summaries to DA/ES (cached)

**Artifacts**:
- `data/digests/{week}.json`: Final weekly digest JSON

---

### `podcast/`
**Purpose**: Generate podcast script and audio

- `buildWeeklyPodcast.ts`: Main podcast builder (script + audio generation)

**Key Functions**:
- `generatePodcastScript(digest, weekLabel)`: Generate script text
- `generateAudioWithOpenAI(text, outputPath)`: Synthesize audio via OpenAI TTS

**Artifacts**:
- `data/weeks/{week}/podcast-script.txt`: Podcast script
- `data/weeks/{week}/podcast.json`: Podcast metadata
- `public/podcast/{week}.mp3`: Audio file

---

### `email/`
**Purpose**: Build email digest format

- `buildWeeklyEmailDigest.ts`: Build email digest JSON

**Key Functions**:
- `buildWeeklyEmailDigest(weekLabel)`: Build email digest structure

**Artifacts**:
- `data/weeks/{week}/email-digest.json`: Email digest JSON

---

### `pipeline/checks/`
**Purpose**: Health checks (warn-only, non-blocking)

- `paywallPercent.ts`: Warn if paywalled share > 30%
- `categoryMinimums.ts`: Warn if any category has < 3 articles
- `podcastDuration.ts`: Warn if podcast script word count < 1500 or > 3500
- `domainConcentration.ts`: Warn if any single domain is > 40% of a category
- `runChecks.ts`: Aggregate all checks, print results

**Key Functions**:
- `runWeeklyChecks({ digest, selectedArticles, podcastScriptText? })`: Run all checks
- `printHealthCheckResults(result)`: Print health check summary

**Integration**: Called automatically by the pipeline (`scripts/runWeeklyPipeline.ts`) after the digest step, and by the manual rebuild script `scripts/buildWeeklyDigest.ts` (a thin wrapper around `buildAndSaveWeeklyDigest`).

---

### `lib/`
**Purpose**: Shared utilities, types, configuration

**Subdirectories**:
- `types/`: Centralized type definitions (`Article`, `WeeklyDigest`, `Topic`, etc.)
- `utils/`:
  - `cachePaths.ts`: Unified cache path management (`data/cache/`)
  - `siteUrl.ts`: Site URL utility (production/development)
  - `weekCET.ts`: Week date range utilities (CET timezone)
  - `getCurrentDigestWeek.ts`: Get current digest week (scans `data/digests/`)
  - `formatDate.ts`: Date formatting utilities
- `env/`: Environment variable loading (`loadEnv()`)
- `i18n/`: Translation utilities (`translateDigestArticles()`)

---

### `app/` (Next.js Routes)
**Purpose**: Web UI and API routes

**Key Routes**:
- `page.tsx`: Homepage (shows latest digest)
- `week/[weekLabel]/page.tsx`: Week-specific digest page
- `email-digest/page.tsx`: Email digest preview page
- `methodology/page.tsx`: Methodology explanation
- `archive/page.tsx`: Archive of past digests
- `subscribe/page.tsx`: Support/donation page
- `api/build-digest/route.ts`: API endpoint to trigger digest build

**Components**:
- `DigestClientView.tsx`: Client-side digest rendering
- `TopNSelector.tsx`: Article count selector
- `SubscribePricing.tsx`: Support tiers component

---

## Artifacts and Where They Live

### Core Data Files

- **`data/articles.json`**: Master article database (all ingested articles)
- **`data/digests/{week}.json`**: Weekly digest JSON (final output)
  - Example: `data/digests/2026-W05.json`
  - Contains: week metadata, topics, selected articles, summaries, translations, cover image

### Week-Specific Artifacts (`data/weeks/{week}/`)

- **`discoveryArticles.json`**: Articles discovered via web search
- **`discovery/`**: Discovery pipeline artifacts
  - `queries.json`: Generated search queries
  - `serp-results.json`: Raw search results
  - `candidates.json`: Normalized candidates
  - `fetch/{hash}.html`: Cached HTML
  - `extracted/{hash}.json`: Extracted article content
  - `selected-top20.json`: Final selected articles
- **`email-digest.json`**: Email digest format
- **`podcast-script.txt`**: Podcast script text
- **`podcast.json`**: Podcast metadata
- **`cover-input.json`**: Cover image input metadata
- **`cover-scene.json`**: Cover image scene description
- **`ingestion-report.json`**: Ingestion statistics

### Cache Files (`data/cache/`)

All caches are centralized in `data/cache/` (managed by `lib/utils/cachePaths.ts`):

- **`rerank.json`**: LLM reranking results (keyed by week+category+fingerprint)
- **`intro.json`**: Weekly intro text cache
- **`themes.json`**: Weekly themes cache
- **`scene_director.json`**: Cover image scene descriptions cache
- **`classification.json`**: Classification results cache (if used)
- **`query_director.json`**: Discovery query generation cache
- **`article-translations.json`**: Article translation cache (DA/ES)

**Backward Compatibility**: Code reads from new paths first, falls back to old paths (e.g., `data/rerank_cache.json` → `data/cache/rerank.json`).

### Public Assets

- **`public/podcast/{week}.mp3`**: Podcast audio files
- **`public/`**: Static assets (images, icons, etc.)

---

## Caching Strategy

### What is Cached and Why

1. **LLM Reranking** (`rerank.json`): Expensive LLM calls, cached by week+category+article fingerprint
2. **AI Summaries** (`article-translations.json`): Expensive LLM calls, cached by article title
3. **Translations** (`article-translations.json`): Expensive LLM calls, cached by article title
4. **Intro Generation** (`intro.json`): Expensive LLM calls, cached by week
5. **Themes Generation** (`themes.json`): Expensive LLM calls, cached by week
6. **Scene Director** (`scene_director.json`): Expensive LLM calls, cached by week
7. **Query Generation** (`query_director.json`): Expensive LLM calls, cached by week
8. **Discovery HTML** (`data/weeks/{week}/discovery/fetch/{hash}.html`): Network calls, cached by URL hash

### How to Reset Caches Safely

**Option 1: Delete specific cache file**
```bash
rm data/cache/rerank.json  # Reset reranking cache
rm data/cache/intro.json   # Reset intro cache
```

**Option 2: Delete all caches**
```bash
rm -rf data/cache/*.json
```

**Option 3: Reset week-specific discovery cache**
```bash
rm -rf data/weeks/2026-W05/discovery/
```

**Option 4: Reset all week artifacts (nuclear option)**
```bash
rm -rf data/weeks/2026-W05/
```

**Important**: Caches are read-only during normal operation. They are automatically created/updated when needed. Deleting a cache will force regeneration on next run (may incur LLM/API costs).

---

## Health Checks

Health checks run automatically after the digest build (pipeline and `scripts/buildWeeklyDigest.ts`) and print warnings (never fail the pipeline). The separate content-quality gate (`pipeline/checks/digestContentQuality.ts`) *is* blocking: it requires AI-summary coverage, a cover image, and — since 2026-09-18 — a non-empty `oneSentenceSummary` and `keyThemes`.

### Checks Implemented

1. **Paywall Percentage** (`pipeline/checks/paywallPercent.ts`)
   - Warns if paywalled article share > 30%
   - Treats missing `paywall` field as not paywalled

2. **Category Minimums** (`pipeline/checks/categoryMinimums.ts`)
   - Warns if any category has < 3 articles
   - Checks all four topics: AI_and_Strategy, Ecommerce_Retail_Tech, Luxury_and_Consumer, Jewellery_Industry

3. **Podcast Duration** (`pipeline/checks/podcastDuration.ts`)
   - Warns if podcast script word count < 1500 or > 3500
   - Optional (only runs if podcast script is available)

4. **Domain Concentration** (`pipeline/checks/domainConcentration.ts`)
   - For each category, warns if any single domain is > 40% of that category
   - Uses robust domain extraction (URL parsing with fallback)

### Example Output

```
=== Weekly Health Checks ===
WARN: Paywalled article share exceeds 30%: 35.7% (10/28)
WARN: Jewellery_Industry: only 2 articles (minimum: 3)
WARN: Podcast script word count: 1200 words (minimum: 1500)
WARN: AI_and_Strategy: example.com represents 45.2% (5/11) - exceeds 40% threshold
Metrics: Paywall share: 35.7%
Metrics: Podcast words: 1200
============================
```

Or if all checks pass:

```
=== Weekly Health Checks ===
All checks passed ✅
Metrics: Paywall share: 15.2%
Metrics: Podcast words: 2100
============================
```

---

## Common Change Recipes

### Add a New RSS Feed

1. Edit `ingestion/sources.ts`
2. Add feed to `SOURCE_FEEDS` array:
   ```typescript
   {
     name: 'Source Name',
     url: 'https://example.com/feed.xml',
     categoryHint: 'AI_and_Strategy' // optional
   }
   ```
3. Run ingestion: `npm run ingest`

### Add a New Static Page Source

1. Edit `ingestion/sources.ts`
2. Add page to `SOURCE_PAGES` array:
   ```typescript
   {
     name: 'Source Name',
     url: 'https://example.com/articles',
     selectors: {
       item: '.article-item',
       title: 'h2 a',
       url: 'h2 a',
       date: '.date'
     }
   }
   ```
3. Run ingestion: `npm run ingest`

### Change Topic Classification Rules

1. Edit `classification/classifyTopics.ts`
2. Modify keyword lists or source heuristics
3. No rebuild needed (pure function)

### Adjust Digest Selection (Top N per Topic)

1. Edit `digest/buildWeeklyDigest.ts`
2. Change `TOP_N` constant (default: 7)
3. Rebuild digest: `npx tsx scripts/buildWeeklyDigest.ts --week=2026-W05`

### Change Reranking Logic

1. Edit `digest/rerankArticles.ts`
2. Modify `calculateRelevanceScore()` or LLM prompt
3. Clear rerank cache: `rm data/cache/rerank.json`
4. Rebuild digest: `npx tsx scripts/buildWeeklyDigest.ts --week=2026-W05`

### Regenerate Summaries/Translations

1. Clear translation cache: `rm data/cache/article-translations.json`
2. Rebuild digest: `npx tsx scripts/buildWeeklyDigest.ts --week=2026-W05`

### Force Regenerate Discovery Queries

1. Delete discovery queries: `rm data/weeks/2026-W05/discovery/queries.json`
2. Or delete entire discovery dir: `rm -rf data/weeks/2026-W05/discovery/`
3. Run discovery: `npx tsx scripts/discoverWeekly.ts --week=2026-W05`

### Change Podcast Script Length

1. Edit `podcast/buildWeeklyPodcast.ts` or `digest/sceneDirector.ts`
2. Modify script generation logic
3. Regenerate: `npx tsx scripts/buildWeeklyPodcast.ts --week=2026-W05`

### Update Health Check Thresholds

1. Edit individual check files in `pipeline/checks/`
2. Change threshold constants (e.g., `MAX_DOMAIN_SHARE_PERCENT = 40`)
3. No rebuild needed (checks run automatically)

### Debug Classification Issues

1. Run classification script: `npx tsx scripts/classifyWeek.ts --week=2026-W05`
2. Check output for misclassified articles
3. Adjust keywords in `classification/classifyTopics.ts`

### Debug Discovery Issues

1. Check discovery artifacts: `data/weeks/2026-W05/discovery/`
2. Review `queries.json` for generated queries
3. Review `serp-results.json` for search results
4. Review `selected-top20.json` for final selection
5. Re-run with debug: `DISCOVERY_DEBUG=1 npx tsx scripts/discoverWeekly.ts --week=2026-W05`

### Test Changes Locally

1. Use a past week for testing: `--week=2026-W05`
2. Run full pipeline:
   ```bash
   npm run ingest -- --week=2026-W05
   npx tsx scripts/discoverWeekly.ts --week=2026-W05
   npx tsx scripts/buildWeeklyDigest.ts --week=2026-W05
   ```
3. Verify output: `data/digests/2026-W05.json`
4. Check health checks in console output

---

## Running the Pipeline

### Full Weekly Pipeline

```bash
# 1. Ingest articles (RSS + pages + discovery)
npm run ingest -- --mode=both --week=2026-W05

# 2. Build weekly digest (includes summaries, translations, health checks)
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W05

# 3. Build email digest
npx tsx scripts/buildWeeklyEmailDigest.ts --week=2026-W05

# 4. Build podcast
npx tsx scripts/buildWeeklyPodcast.ts --week=2026-W05

# 5. Generate cover image (optional)
npx tsx scripts/regenerateCover.ts --week=2026-W05
```

### Individual Steps

```bash
# RSS ingestion only
npm run ingest -- --mode=rss

# Discovery only
npm run ingest -- --mode=webDiscovery --week=2026-W05

# Standalone discovery
npx tsx scripts/discoverWeekly.ts --week=2026-W05

# Build digest only (no ingestion)
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W05
```

### Testing

```bash
# Run smoke tests
npm test

# Build TypeScript
npm run build
```

---

## Environment Variables

Required:
- `OPENAI_API_KEY`: For LLM calls (summaries, translations, reranking, etc.)
- `TAVILY_API_KEY`: For web discovery search

Optional:
- `NEXT_PUBLIC_SITE_URL`: Site URL override (defaults to luxury-intel.com in production)
- `NODE_ENV`: `production` or `development` (affects site URL fallback)

---

## Troubleshooting

### Digest build fails with "No articles found"

- Check `data/articles.json` exists and has articles
- Verify week date range matches article `published_at` dates
- Check CET timezone calculation: `lib/utils/weekCET.ts`

### Health checks show warnings

- Warnings are non-blocking (pipeline still succeeds)
- Review warnings and adjust selection/classification if needed
- Check `pipeline/checks/` for threshold values

### Translations missing or identical

- Check `data/cache/article-translations.json` exists
- Clear cache and rebuild: `rm data/cache/article-translations.json`
- Verify `OPENAI_API_KEY` is set

### Discovery returns no results

- Check `TAVILY_API_KEY` is set
- Review `data/weeks/{week}/discovery/queries.json` for generated queries
- Check `data/weeks/{week}/discovery/serp-results.json` for search results
- Verify Tavily API quota/limits

### Cache not updating

- Caches are keyed by content fingerprint
- To force update, delete the cache file and rebuild
- Check cache file permissions

---

## Additional Resources

- `DISCOVERY_USAGE.md`: Detailed discovery pipeline documentation
- `RANKING_METHODOLOGY.md`: Reranking algorithm details
- `REFACTOR_PLAN.md`: Architecture refactoring plan (historical)
- `docs/PAYWALL_AWARE_SELECTION.md`: Paywall filtering logic
- `docs/PODCAST_SCRIPT_LENGTH_IMPROVEMENTS.md`: Podcast script generation
