# Tavily Discovery Call Notes

## Code pointers (Discovery)
- `scripts/discoverWeekly.ts` â†’ `main()` calls `generateSearchQueries()` then `searchWithTavily()`
- `ingestion/runIngestion.ts` â†’ `runWebDiscovery()` calls `generateSearchQueries()` then `searchWithTavily()`
- `discovery/searchProvider.ts` â†’ `searchWithTavily()` loops queries and calls `searchTavily()` (actual HTTP POST to Tavily)
- `discovery/queryDirector.ts` â†’ `generateSearchQueries()` (base + delta + consultancy + platform queries; no date constraints added)
- `discovery/queryDelta.ts` â†’ `generateDeltaQueries()` (LLM generates topical queries, not date-based)

## Code pointers (Tavily Extract â€“ not search)
- `discovery/fetchExtract.ts` â†’ `extractWithTavily()` (Tavily Extract API for consultancy/platform domains)
- `podcast/enrichFullText.ts` â†’ `extractWithTavily()` (Tavily Extract API for podcast full-text)

## Discovery search payload (exact fields)
The HTTP POST body sent by `searchTavily()` in `discovery/searchProvider.ts`:

```json
{
  "api_key": "TAVILY_API_KEY",
  "query": "<cleaned query>",
  "search_depth": "basic",
  "include_answer": false,
  "include_raw_content": false,
  "include_domains": ["<domain>"] | [],
  "exclude_domains": [],
  "max_results": <ceil(maxCandidates / topicQueries.length)>,
  "include_images": false
}
```

### Post-processing and query rewrite rules
- If a query contains `site:domain.com`, we:
  - Extract the domain and set `include_domains = [domain.com]`
  - Remove the `site:` operator from the query (`cleanQuery`)
- If no `site:` operator, `include_domains = []`
- `max_results` per query = `ceil(maxCandidates / topicQueries.length)`
- No weekLabel/weekStart/weekEnd or date filters are appended to the query

### Date/time constraints
- **None**. No `days`, `time_range`, `after:`, `before:`, or similar params are set.

## Example payloads (real week: 2026-W06)
These are sample payloads for the first two queries per topic (actual printed output from local run):

```json
[
  {
    "api_key": "TAVILY_API_KEY",
    "query": "AI tools for business automation",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "AI_and_Strategy"
  },
  {
    "api_key": "TAVILY_API_KEY",
    "query": "generative AI applications in retail",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "AI_and_Strategy"
  },
  {
    "api_key": "TAVILY_API_KEY",
    "query": "ecommerce platform updates",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "Ecommerce_Retail_Tech"
  },
  {
    "api_key": "TAVILY_API_KEY",
    "query": "retail technology innovations",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "Ecommerce_Retail_Tech"
  },
  {
    "api_key": "TAVILY_API_KEY",
    "query": "luxury brand digital strategy",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "Luxury_and_Consumer"
  },
  {
    "api_key": "TAVILY_API_KEY",
    "query": "premium consumer goods trends",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "Luxury_and_Consumer"
  },
  {
    "api_key": "TAVILY_API_KEY",
    "query": "jewelry industry trends",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "Jewellery_Industry"
  },
  {
    "api_key": "TAVILY_API_KEY",
    "query": "diamond market news",
    "search_depth": "basic",
    "include_answer": false,
    "include_raw_content": false,
    "include_domains": [],
    "exclude_domains": [],
    "max_results": 7,
    "include_images": false,
    "topic": "Jewellery_Industry"
  }
]
```
