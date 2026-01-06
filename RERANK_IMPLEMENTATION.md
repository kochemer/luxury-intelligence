# LLM-Based Top 7 Selection Implementation

## Files Changed

1. **`digest/rerankArticles.ts`** (NEW)
   - LLM reranking module with caching and fallback
   - Candidate selection (25-40 articles)
   - Cache management
   - Validation and error handling

2. **`digest/buildWeeklyDigest.ts`** (MODIFIED)
   - Integrated `rerankArticles` function
   - Replaced `selectTopN` with async `selectTopN` that uses reranking
   - Added rerank statistics logging
   - Maintains backward compatibility with digest structure

3. **`data/rerank_cache.json`** (NEW, auto-generated)
   - Cache file for rerank results

## Reranker Prompt Text

```
You are selecting the top 7 articles for a weekly brief in the "{categoryDisplayName}" category.

Your goal is to select the 7 most valuable articles for readers interested in {categoryDisplayName}.

Consider:
- Relevance to {categoryDisplayName}
- Newsworthiness and importance
- Diversity of sources (max 2 per source unless category has very few sources)
- Recency (prefer recent articles)
- Quality (avoid low-signal content like pure press releases)
- Uniqueness (avoid duplicate topics)

Candidate articles (already scored by recency + source quality + keywords):
{candidateList}

Select exactly 7 articles (or fewer if fewer candidates exist). Return a JSON object with this exact structure:
{
  "selected": [
    { "id": "0", "rank": 1, "why": "brief reason", "confidence": 0.9 },
    { "id": "1", "rank": 2, "why": "brief reason", "confidence": 0.85 },
    ...
  ]
}

Rules:
- "id" must match the candidate number (0, 1, 2, ...)
- "rank" must be 1-7, unique, sequential
- "why" should be a short phrase (5-15 words) explaining why this article was selected
- "confidence" should be 0.0-1.0
- Never select duplicates (check URLs if provided)
- Prefer source diversity: max 2 items per source unless category has < 4 unique sources
- If fewer than 7 candidates exist, select all of them

Respond with ONLY valid JSON, no markdown, no code blocks, just raw JSON.
```

## Sample Rerank Cache Entry

```json
{
  "2026-W01:AI_and_Strategy:96c4f6b71fa0": {
    "selected": [
      {
        "id": "0",
        "rank": 1,
        "why": "Insights on effective AI usage from an expert",
        "confidence": 0.9
      },
      {
        "id": "1",
        "rank": 2,
        "why": "Decoding current AI terminology is essential",
        "confidence": 0.85
      },
      {
        "id": "4",
        "rank": 3,
        "why": "Explores the emergence of new billionaires in AI",
        "confidence": 0.8
      },
      {
        "id": "11",
        "rank": 4,
        "why": "Discusses generative AI's impact on SEO strategies",
        "confidence": 0.75
      },
      {
        "id": "13",
        "rank": 5,
        "why": "Analyzes AI's influence on shopping behavior",
        "confidence": 0.7
      },
      {
        "id": "17",
        "rank": 6,
        "why": "Highlights regulatory responses to AI-related issues",
        "confidence": 0.65
      },
      {
        "id": "23",
        "rank": 7,
        "why": "Innovative research on AI applications in robotics",
        "confidence": 0.6
      }
    ],
    "cached_at": "2026-01-03T21:30:01.766Z",
    "model": "gpt-4o-mini"
  }
}
```

## Logs from Test Runs

### First Run (Cache Miss)
```
[Classification Stats] Total: 57, Cache hits: 1, Cache misses: 56, LLM calls: 56, LLM successes: 56, LLM failures: 0, Fallbacks: 0
[Rerank Stats] Calls: 2, Cache hits: 0, Cache misses: 2, Fallbacks: 0, Avg candidates per category: 12.8
```

### Second Run (Cache Hit)
```
[Classification Stats] Total: 57, Cache hits: 2, Cache misses: 55, LLM calls: 55, LLM successes: 55, LLM failures: 0, Fallbacks: 0
[Rerank Stats] Calls: 0, Cache hits: 2, Cache misses: 0, Fallbacks: 0, Avg candidates per category: 12.8
```

## Implementation Details

### Candidate Selection
- Takes top 25-40 articles by deterministic score (recency + source weights + keywords)
- Only sends bounded fields: title, source, date, snippet (max 350 chars), existingScore, isSponsored flag
- No full article scraping

### Caching Strategy
- Cache key: `{weekLabel}:{category}:{hash(candidate URLs + titles + snippets)}`
- Detects content changes via hash
- Model versioning (cache invalidated if model changes)
- Automatic cache file creation

### Safety & Determinism
- Temperature: 0 (deterministic)
- Model: `RERANK_MODEL` env var (default: `gpt-4o-mini`)
- Strict validation:
  - IDs must exist in candidates
  - Ranks 1-7 unique and sequential
  - No duplicate URLs
- Fallback: Uses deterministic top 7 if LLM fails or returns invalid response

### Explainability
- Optional `rerankWhy` and `rerankConfidence` fields added to selected articles
- Does not break existing digest JSON structure
- Fields are optional and won't affect rendering if missing

### Observability
- Tracks: rerank calls, cache hits/misses, fallbacks, average candidates per category
- Logged after each digest build
- Stats reset at start of each build

## Testing Results

✅ **First run**: Made 2 LLM calls (for categories with enough candidates), cached results
✅ **Second run**: 100% cache hits (0 LLM calls), instant reranking
✅ **Fallback**: Tested and working (falls back to deterministic if LLM fails)
✅ **Validation**: Strict validation prevents invalid selections
✅ **Backward compatibility**: Digest structure unchanged, optional explainability fields added

## Configuration

- `RERANK_MODEL`: OpenAI model to use (default: `gpt-4o-mini`)
- `OPENAI_API_KEY`: Required for LLM calls
- Cache file: `data/rerank_cache.json` (auto-created)


