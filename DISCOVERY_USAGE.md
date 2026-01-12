# Web Discovery Usage Guide

The web discovery feature complements RSS ingestion by discovering additional articles via web search and selecting the top 20 most relevant articles per category.

## Setup

1. **Environment Variables**: Add to `.env.local`:
   ```
   TAVILY_API_KEY=your_tavily_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```

2. **Get Tavily API Key**: Sign up at https://tavily.com and get your API key.

## Usage

### Standalone Discovery Script

Run discovery for a specific week:

```bash
npm run discover -- --week=2026-W01
```

With custom parameters:

```bash
npm run discover -- --week=2026-W01 --maxCandidates=150 --selectTop=25 --searchProvider=tavily
```

### Integrated with Ingestion

Run both RSS and discovery:

```bash
npm run ingest -- --mode=both --week=2026-W01
```

Run only discovery:

```bash
npm run ingest -- --mode=webDiscovery --week=2026-W01
```

Run only RSS (default):

```bash
npm run ingest -- --mode=rss
```

## Configuration Flags

- `--mode=rss|webDiscovery|both` (default: `both`)
- `--week=YYYY-Www` (default: current week)
- `--maxCandidates=120` (per category, default: 120)
- `--selectTop=20` (per category, default: 20)
- `--searchProvider=tavily|bing|serpapi` (default: `tavily`, only tavily implemented)

## Data Artifacts

Discovery creates the following files in `data/weeks/{week}/discovery/`:

- `queries.json` - Generated search queries per category
- `serp-results.json` - Raw search results from Tavily
- `candidates.json` - Normalized candidate articles
- `fetch/{hash}.html` - Cached HTML for each URL
- `extracted/{hash}.json` - Extracted article content
- `selected-top20.json` - Final selected articles with rankings

## Pipeline Flow

1. **Query Generation** - LLM generates 5-10 search queries per category based on:
   - Category definition
   - Last week's key themes
   - Example sources

2. **Search** - Tavily API searches for each query, gathers URLs with metadata

3. **Fetch & Extract** - For each candidate:
   - Fetch HTML (with caching)
   - Extract readable text using cheerio
   - Filter: English only, minimum 200 words, article-like content

4. **Selection** - LLM selects top 20 per category:
   - Relevance scoring
   - Controversy filtering (excludes war/culture-war/election)
   - Domain diversity (max 2 per domain)
   - Deduplication

5. **Merge** - Selected articles merged into `data/articles.json`:
   - URL deduplication
   - Title similarity checking
   - Preserves existing articles

## Example Output

After running discovery for week 2026-W01:

```
Web Discovery Configuration:
  Week: 2026-W01
  Max candidates per category: 120
  Select top per category: 20
  Search provider: tavily

[Step 1] Generating search queries...
✓ Generated 32 queries across 4 categories

[Step 2] Searching the web...
✓ Found 87 candidate URLs

[Step 3] Fetching and extracting articles...
✓ Extracted 65 articles

[Step 4] Selecting top articles...
✓ Selected 18 articles

[Step 5] Merging into main articles.json...
✓ Merged 15 new articles, 3 updated

Discovery complete!
```

## Integration with Weekly Digest

Discovery articles are automatically included when building the weekly digest:

```bash
npm run ingest -- --mode=both --week=2026-W01
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W01
```

The digest pipeline will:
1. Load all articles from `data/articles.json` (including discovery articles)
2. Filter by week window
3. Classify and rerank as usual
4. Generate summaries, themes, and cover image

## Notes

- Discovery uses caching at each step - re-running will use cached data
- To force regeneration, delete the `data/weeks/{week}/discovery/` directory
- Rate limiting is built-in (500ms between search queries, 1s between fetches)
- Controversy filtering matches the same rules as `buildWeeklyDigest.ts`
- Domain diversity ensures no single source dominates

