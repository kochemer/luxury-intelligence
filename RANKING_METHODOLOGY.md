# Ranking & Re-Ranking Methodology

> Checked 2026-10-05: top 7 per topic and the rerank models below match the
> code. Other details (prompt wording, weights) date from Jan 2026; verify in
> `digest/rerankArticles.ts` before relying on them. Owner-deferred changes to
> selection (roadmap F1.5, F2.1, F2.2) aren't built.

## Overview

The article selection pipeline uses a **hybrid approach** combining deterministic pre-filtering with LLM-based reranking, followed by post-processing to enforce diversity constraints. The system processes articles through multiple phases to select the top 7 articles per category.

---

## Pipeline Architecture

```
Article Ingestion
    ↓
Classification (Topic Assignment)
    ↓
Deterministic Pre-Filtering (Scoring)
    ↓
Candidate Selection (Top 100)
    ↓
LLM Reranking (with caching)
    ↓
Post-Processing (Source Diversity + Materiality Boost if needed)
    ↓
Final Top 7 Selection
```

---

## Phase 1: Classification

**File:** `classification/classifyTopics.ts`

### Purpose
Assign each article to one of four topics:
- `AI_and_Strategy`
- `Ecommerce_Retail_Tech`
- `Luxury_and_Consumer`
- `Jewellery_Industry`

### Method
**Heuristic-based keyword matching** (case-insensitive):
- Checks title and source for topic-specific keywords
- Priority order: AI > Ecommerce > Luxury > Jewellery
- Special source-based routing (e.g., jewellery industry sources)

### Key Keywords by Category

**AI_and_Strategy:**
- Core AI terms: "ai", "llm", "large language model", "openai", "anthropic", "claude", "gemini"
- Research terms: "arxiv", "research paper", "benchmark", "evaluation", "sota"
- Industry terms: "ai lab", "ai company", "model release", "weights release", "funding", "investment"
- Policy terms: "ai regulation", "ai policy", "ai safety", "alignment"

**Ecommerce_Retail_Tech:**
- "ecommerce", "online store", "checkout", "payment", "platform", "marketplace"
- "shopify", "cart", "fulfillment", "logistics", "conversion"

**Luxury_and_Consumer:**
- "luxury", "premium", "consumer", "affluent", "brand", "heritage", "aspirational"

**Jewellery_Industry:**
- "jewellery", "jewelry", "diamond", "gold", "silver", "gem", "precious metal"
- Special handling for "gold" and "silver" with word boundaries to avoid false positives (e.g., "Goldman")

---

## Phase 2: Deterministic Pre-Filtering & Scoring

**File:** `digest/buildWeeklyDigest.ts`

### Purpose
Score all articles in a category to identify the top candidates for LLM reranking.

### Scoring Components

#### 1. Recency Score
- **Value:** Constant `0.5` for all articles within the week
- **Rationale:** All articles from the same week are treated equally (no intra-week recency bias)
- **Range:** 0.0 - 0.5

#### 2. Source Weight
- **Default:** `0` for unlisted sources
- **Boosted Sources:**
  - "Jeweller - Business News": +0.1
  - "Professional Jeweller": +0.1
  - "NYTimes Technology": +0.15
  - "Modern Retail": +0.1
  - "Practical Ecommerce": +0.1
  - "Retail Dive": +0.1
  - "Harvard Business Review (Technology & AI)": +0.15
  - "McKinsey & Company: Artificial Intelligence": +0.15

**Special Handling for AI Category:**
- **AI-Focused Sources** (boosted +0.15):
  - arXiv variants, MIT Technology Review, The Verge - AI, TechCrunch - AI, Wired - AI, IEEE Spectrum, Nature Machine Intelligence
- **Retail Sources** (boost removed, set to 0):
  - "Modern Retail", "Digital Commerce 360", "Practical Ecommerce", "Retail Dive"
- **Other Sources** (boost halved):
  - `sourceWeight = SOURCE_WEIGHTS[source] * 0.5`

#### 3. Keyword Boost
- **Per Match:** +0.05 per keyword match
- **Matching:** Case-insensitive, in title and snippet
- **Category-Specific Keywords:** See Phase 1

#### 4. Penalty
- **Low-Signal Markers:** -0.2 per marker found
- **Markers:** "sponsored", "press release", "advertorial", "advertisement", "promoted", "paid content", "sponsored content", "ad", "promo"

### Total Score Formula
```
scoreTotal = recencyScore + sourceWeight + keywordBoost - penalty
```

### Sorting
1. Sort by `scoreTotal` (descending)
2. Tie-breaker: Sort by URL (alphabetical) for determinism

### Candidate Selection
- **Top N candidates:** `min(100, total_articles_in_category)`
- These candidates are passed to LLM reranking

---

## Phase 3: LLM Reranking

**File:** `digest/rerankArticles.ts`

### Purpose
Use LLM to intelligently select and rank the top 7 articles from the candidate pool.

### Configuration
- **Primary Model:** `gpt-4.1` since 2026-09-16 (env: `RERANKER_MODEL_PRIMARY`, then `RERANK_MODEL`)
- **Fallback Model:** `gpt-4.1-mini` (env: `RERANKER_MODEL_FALLBACK`)
- **Temperature:** `0` (deterministic)
- **Max Tokens:** `2000`
- **Max Items Sent:** `18` (env: `RERANK_MAX_ITEMS`)
- **Max Chars Sent:** `80,000` (env: `RERANK_MAX_CHARS`)
- **Cooldown:** `6500ms` between calls (env: `RERANK_COOLDOWN_MS`)

### Candidate Trimming
If candidates exceed budget (items or chars), trim using:
1. **Score-based selection:** Score candidates using `scoreCandidateForTrimming()` (considers materiality, tier, flags)
2. **Take top N items:** Select top `RERANK_MAX_ITEMS` by score
3. **Char budget:** Drop lowest-scored items until within `RERANK_MAX_CHARS`

### Caching
- **Cache Key:** `weekLabel + category + candidate fingerprint`
- **Fingerprint:** Hash of candidate URLs + titles
- **Cache File:** `data/rerank_cache.json`
- **Cache Hit:** Returns cached results if candidate list matches (by fingerprint)

### LLM Prompt Structure

#### For AI Category (`AI_and_Strategy`):
**Objective:** Select articles that a serious AI practitioner/investor/research-following reader would consider most important.

**Priority Order:**
1. **AI Industry Economics & Power Moves**
   - Financial performance, pricing, unit economics, compute constraints
   - Major partnerships, acquisitions, funding, leadership changes
2. **Frontier Model Releases & Capability Leaps**
   - New major model launches, weights releases, meaningful capability changes
   - Evidence of improvements in reasoning, coding, math, agents, multimodality
3. **Benchmark / Evaluation Breakthroughs**
   - Strong results on credible benchmarks (SWE-bench, MMLU, GPQA, MATH, HumanEval)
   - Prefer articles with concrete metrics
4. **Research & Technical Paradigm Shifts**
   - New methods (training, inference, architectures), scaling laws, efficiency breakthroughs
   - RAG/agents/tool-use advances with real novelty
5. **Regulation/Policy**
   - Compute export controls, model governance, AI safety regulation

**Tie-Breaker (Minor):** Relevance to ecommerce/retail/luxury operators (Pandora lens)

**Exclusions:**
- Generic "AI adoption" surveys
- Education/university pilot stories (unless notable technique)
- Culture-war/outrage stories (unless meaningful AI capability/policy angle)
- Low-signal press releases

#### For Other Categories:
**Objective:** Select articles for Pandora colleagues interested in retail/ecommerce intelligence.

**Priority Order:**
1. **Relevance to Pandora Colleagues** (highest)
   - CX, conversion optimization, CRM/loyalty, merchandising
   - Pricing/promotions, margin management, supply chain
   - Store operations, digital commerce integration
   - Analytics, experimentation, AI productivity tools
2. **Relevance to Retail/Fashion Ecommerce Landscape**
   - Must connect to commerce
   - Deprioritize generic tech unless clearly applied to retail
3. **Commerce Materiality** (especially for Ecommerce category)
   - Prefer articles with high commerce materiality (real execution impact)
   - Platform capabilities, checkout/cart changes, retailer adoption
4. **Insightfulness**
   - New data, benchmarks, metrics
   - Case studies with measurable outcomes
   - Strong analysis and non-obvious takeaways
5. **Controversy Filter**
   - Exclude: War/armed conflict, culture-war/polarizing politics, election horse-race
   - Allow: Policy/regulation with direct retail/ecommerce/AI impact

### LLM Constraints (Hard Requirements)
1. **Source Diversity:** Maximum 3 articles from any single source
2. **Arxiv Limit (AI Category Only):** Maximum 1 article from ANY Arxiv source (all Arxiv sources count as one group)
3. **Selection Count:** Exactly 7 articles (or fewer if fewer candidates)
4. **No Duplicates:** Check URLs to avoid duplicates

### LLM Response Format
```json
{
  "selected": [
    {
      "id": "0",  // Index in trimmed candidate list
      "rank": 1,
      "why": "brief concrete reason (5-15 words)",
      "confidence": 0.9
    },
    ...
  ]
}
```

### Validation
- Checks response structure (selected array exists)
- Validates selection count matches expected (7 or fewer)
- Validates IDs are valid (0 to candidates.length-1)
- Validates ranks are sequential (1, 2, 3, ...)
- **Validates source diversity constraints:**
  - Max 3 per source
  - Max 1 Arxiv for AI category
- If validation fails, falls back to deterministic selection

### Model Failover
- If PRIMARY model hits RPD/TPM rate limit, immediately switch to FALLBACK
- If FALLBACK also fails, use deterministic fallback
- Retry logic with exponential backoff (handled by OpenAI client)

### Mapping LLM Results to Original Candidates
- LLM returns indices based on **trimmed** candidate list
- Map back to **original** candidate list using:
  1. URL matching (primary)
  2. Title+Source matching (fallback)
- Log mapping failures for debugging

---

## Phase 4: Post-Processing

**File:** `digest/rerankArticles.ts` (function: `applySourceDiversity`)

### Source Diversity Enforcement (Always Applied)

**Rules:**
1. **Max 3 articles per source** (all categories)
2. **Max 1 Arxiv article** (AI category only - all Arxiv sources count as one group)

**Process:**
1. Iterate through LLM-selected articles
2. For each article:
   - Check if source count < 3
   - Check if Arxiv count < 1 (for AI category)
   - If both pass, add to final selection
   - Otherwise, add to skipped list
3. **Backfilling:**
   - If final selection < 7, try to backfill from skipped articles
   - If still < 7, backfill from full candidate pool (if provided)
   - Maintain diversity constraints during backfilling

### Materiality Boost (Only When LLM Fails)

**Applied Only In Fallback Path:**
- When LLM call fails or validation fails
- Not applied when LLM succeeds

**Commerce Materiality Scoring:**
- **File:** `scoring/commerceMateriality.ts`
- **Score Range:** 0-10
- **Signals:**
  - Shipping/rollout verbs (+2): "rolls out", "launches", "unveils", "enables", "goes live", etc.
  - Transaction intent (+3): "checkout", "cart", "payment", "conversion", "merchant", "inventory", etc.
  - Platform + retailer integration (+3): Mentions both platform (Google, OpenAI, Shopify, etc.) and retailer
  - Partner/standard/integration (+2): "protocol", "api", "integration", "sdk", "connector"
  - Discourse-only penalty (-2): "alarm", "concern", "ethics", "debate", "pilot", "research", "academic"
  - No commerce nouns penalty (-1): If no commerce-related keywords found

**Materiality Weights by Category:**
- **Ecommerce_Retail_Tech:** `1.5` (env: `COMMERCE_MATERIALITY_WEIGHT_ECOM`)
- **Luxury_and_Consumer / Jewellery_Industry:** `1.2` (env: `COMMERCE_MATERIALITY_WEIGHT_EMAIL`)
- **AI_and_Strategy:** `0.1` (low weight - materiality not primary concern)
- **Other:** `0.3` (env: `COMMERCE_MATERIALITY_WEIGHT_OTHER`)

**Boost Formula:**
```
combinedScore = originalRank - (materialityScore * materialityWeight)
```
- Lower combined score = better (boosted articles move up)
- Sort by combined score, then apply source diversity

---

## Phase 5: Fallback Mechanisms

### Deterministic Fallback Selection

**File:** `digest/buildWeeklyDigest.ts` (function: `fallbackSelect`)

**Used When:**
- LLM call fails (both models exhausted)
- LLM response is invalid (validation fails)
- Single candidate (no meaningful rerank)

**Process:**
1. Iterate through candidates (already sorted by deterministic score)
2. Apply diversity constraints:
   - Max 3 per source
   - Max 1 Arxiv for AI category
3. Select first N articles that pass constraints
4. If not enough, relax constraints to fill slots (mustFill logic)

**Post-Processing:**
- Apply materiality boost (re-rank by materiality)
- Apply source diversity enforcement (with backfilling)

---

## Category-Specific Differences

### AI_and_Strategy
- **Source Weighting:**
  - AI-focused sources boosted (+0.15)
  - Retail sources de-boosted (0)
  - Other sources halved
- **LLM Criteria:**
  - AI-first (industry economics, frontier models, benchmarks, research, policy)
  - Retail relevance is minor tie-breaker only
- **Source Diversity:**
  - Max 1 Arxiv article (all Arxiv sources grouped)
- **Materiality Weight:** `0.1` (low)

### Ecommerce_Retail_Tech
- **LLM Criteria:**
  - Pandora colleagues focus (practical retail/ecommerce implications)
  - Commerce materiality emphasized
  - Technology & AI as selection criterion
- **Materiality Weight:** `1.5` (high)

### Luxury_and_Consumer
- **Materiality Weight:** `1.2` (medium-high)

### Jewellery_Industry
- **Materiality Weight:** `1.2` (medium-high)
- **Special Keyword Handling:** Word boundaries for "gold" and "silver" to avoid false positives

---

## Key Configuration Constants

### Candidate Selection
- `CANDIDATE_MAX_LLM = 100` (max candidates sent to LLM)
- `TOP_N = 7` (final selection count)
- `MAX_PER_SOURCE = 3` (source diversity limit)

### LLM Reranking
- `RERANK_MAX_ITEMS = 18` (max items in prompt)
- `RERANK_MAX_CHARS = 80,000` (max chars in prompt)
- `RERANK_COOLDOWN_MS = 6,500` (cooldown between calls)

### Scoring
- `KEYWORD_BOOST_PER_MATCH = 0.05`
- `LOW_SIGNAL_PENALTY = 0.2`
- `RECENCY_SCORE = 0.5` (constant for all week articles)

---

## Data Flow Summary

1. **Input:** All articles from `data/articles.json` filtered to week window
2. **Classification:** Each article assigned to one topic
3. **Deduplication:** Within each topic, deduplicate by normalized title
4. **Scoring:** Calculate relevance scores for all articles in topic
5. **Candidate Selection:** Top 100 articles (by score) selected for LLM
6. **LLM Reranking:**
   - Check cache
   - If miss, call LLM with trimmed candidates
   - Validate response
   - Map results back to original candidates
7. **Post-Processing:**
   - Apply source diversity (always)
   - Apply materiality boost (only if LLM failed)
8. **Output:** Top 7 articles per category with relevance scores and explainability

---

## Caching Strategy

- **Cache Key:** `weekLabel + category + candidate fingerprint`
- **Fingerprint:** Hash of candidate URLs + titles
- **Cache Hit:** Returns cached LLM results if candidate list matches
- **Cache Miss:** Calls LLM, caches result
- **Cache Invalidation:** Manual (delete `data/rerank_cache.json`)

---

## Error Handling & Resilience

1. **LLM Failures:**
   - Primary model fails → Try fallback model
   - Both models fail → Use deterministic fallback
2. **Validation Failures:**
   - Invalid response structure → Fallback
   - Constraint violations → Fallback
3. **Mapping Failures:**
   - Logged for debugging
   - Attempts fallback mapping (title+source)
4. **Backfilling:**
   - If diversity constraints leave < 7 articles, backfill from:
     1. Skipped articles (from LLM selection)
     2. Full candidate pool (if provided)

---

## Performance Considerations

- **Cooldown:** 6.5s between LLM calls to avoid TPM limits
- **Trimming:** Reduces prompt size to stay within token/char limits
- **Caching:** Avoids redundant LLM calls for same candidate sets
- **Batch Processing:** Processes all categories sequentially with cooldown

---

## Future Improvements

1. **LLM Learning:** LLM should learn to respect diversity constraints after validation failures
2. **Deterministic Scoring:** May need adjustment to ensure diverse candidate pool (especially for AI category with many Arxiv articles)
3. **Backfilling Logic:** Could be improved to better handle edge cases where candidate pool lacks diversity
