# Article Selection Pipeline Refactor

## Summary

The article selection pipeline has been refactored from a scoring-based system to a gating-based system where:
- **Deterministic step**: Acts as a gate (eligible/not eligible) with flags, not a ranking score
- **LLM step**: Does all final selection and ranking based on Pandora-focused criteria

## Key Changes

### 1. Deterministic Gating (No Ranking)

**Old approach**: Calculated numeric scores (sourceWeight + keywordBoost - penalty)

**New approach**: Boolean eligibility with flags:
- `eligible: boolean`
- `reasons: string[]`
- `flags: { sponsored?, pressRelease?, duplicateOf?, offCategory?, controversial?, controversialSuspected? }`
- `tier?: "high" | "med" | "low"` (optional, not for ranking)

**Gating checks:**
- Sponsored/press release detection (flagged, not excluded)
- Duplicate detection (excluded)
- Controversy detection (excluded deterministically, or flagged for LLM review)
- Week window validation (excluded)

### 2. Controversy Detection

**Excluded topics:**
- War/armed conflict/violence
- Culture-war/polarizing identity politics
- Election horse-race politics

**Allowlist exceptions** (policy/regulation with direct retail/ecommerce/AI impact):
- Tariffs, trade policy
- AI compliance laws (AI Act, GDPR, privacy regulation)
- Platform regulation with commerce impact
- Consumer protection laws affecting retail

**Ambiguous cases**: If article mentions both controversy markers AND retail/commerce context, flag as `controversialSuspected` for LLM review (don't exclude deterministically).

### 3. LLM Reranking Criteria (Priority Order)

**A) Relevance to Pandora colleagues** (highest priority)
- Practical implications for retail/ecommerce:
  - CX, conversion, CRM/loyalty, merchandising
  - Pricing/promo, supply chain
  - Store/digital, analytics/experimentation
  - AI productivity + governance

**B) Relevance to retail/fashion ecommerce landscape**
- Must connect to commerce
- Deprioritize generic tech unless clearly applied to retail

**C) Insightfulness**
- Prefer: new data, benchmarks, case studies, measurable outcomes, strong analysis
- Avoid: thin rewrites, pure announcements, vendor marketing, generic thought leadership

**D) Controversy filter** (hard constraint)
- Exclude: war/culture-war/election horse-race
- Allow: policy/regulation with direct retail/ecommerce/AI impact

**E) Recency**
- All articles from same week; no intra-week bias (Monday = Friday)

## Updated Prompt Text

```
You are selecting articles for a weekly brief in the "{categoryDisplayName}" category.

Your goal is to select and rank the {N} articles for Pandora colleagues interested in retail/ecommerce intelligence.

SELECTION CRITERIA (priority order):

A) RELEVANCE TO PANDORA COLLEAGUES (highest priority)
   Prioritize articles with practical implications for retail/ecommerce:
   - Customer experience (CX), conversion optimization
   - CRM/loyalty programs, customer retention
   - Merchandising, product assortment, inventory
   - Pricing/promotions, margin management
   - Supply chain, logistics, fulfillment
   - Store operations and digital commerce integration
   - Analytics, experimentation, measurement
   - AI productivity tools and governance

B) RELEVANCE TO RETAIL/FASHION ECOMMERCE LANDSCAPE
   - Must connect to commerce; deprioritize generic tech unless clearly applied to retail
   - Focus on actionable insights for retail professionals

C) INSIGHTFULNESS
   Prefer articles with:
   - New data, benchmarks, metrics
   - Case studies with measurable outcomes
   - Strong analysis and non-obvious takeaways
   - Concrete examples and real-world applications
   Avoid:
   - Thin rewrites or summaries
   - Pure announcements without analysis
   - Vendor marketing without substance
   - Generic thought leadership

D) CONTROVERSY FILTER (hard constraint - EXCLUDE these)
   Do NOT select articles primarily about:
   - War/armed conflict/violence (unless directly about retail supply chain impact)
   - Culture-war/polarizing identity politics
   - Election horse-race politics
   EXCEPTION: Allow policy/regulation with DIRECT retail/ecommerce/AI impact:
   - Tariffs, trade policy affecting retail pricing/supply chain
   - AI compliance laws (AI Act, GDPR, privacy regulation)
   - Platform regulation with direct commerce impact
   - Consumer protection laws affecting retail
   Articles marked [CONTROVERSY FLAGGED - REVIEW] should be carefully evaluated against this filter.

E) RECENCY
   - All articles are from the same week; treat Monday and Friday equally
   - No intra-week recency bias - all in-week articles are equally recent

CONSTRAINTS:
- Select exactly N articles (or fewer if fewer eligible candidates)
- Max 2 articles per source (enforce source diversity)
- Avoid duplicates/near-duplicates of the same story/topic
- Never select duplicates (check URLs if provided)
```

## Candidate Payload Example (JSON)

```json
{
  "id": "0",
  "title": "AI-Powered Personalization Drives 15% Conversion Lift at Luxury Retailer",
  "source": "Retail Dive",
  "date": "1/3/2026",
  "snippet": "A new study shows how luxury retailers are using AI to personalize customer experiences, resulting in measurable conversion improvements...",
  "url": "https://example.com/article",
  "flags": {
    "sponsored": false,
    "pressRelease": false,
    "controversialSuspected": false
  },
  "tier": "high"
}
```

## Mock Rerank Input/Output Example

### Input (Candidates)

```json
[
  {
    "id": "0",
    "title": "New AI Tools Transform Retail Customer Service",
    "source": "Modern Retail",
    "date": "1/2/2026",
    "snippet": "Retailers are adopting AI chatbots that reduce support costs by 30% while improving customer satisfaction scores...",
    "url": "https://example.com/ai-retail",
    "flags": {},
    "tier": "high"
  },
  {
    "id": "1",
    "title": "Ukraine War Impacts Global Supply Chains",
    "source": "NYTimes Technology",
    "date": "1/1/2026",
    "snippet": "The ongoing conflict in Ukraine continues to disrupt international trade routes...",
    "url": "https://example.com/ukraine-supply",
    "flags": {
      "controversialSuspected": true
    },
    "tier": "med"
  },
  {
    "id": "2",
    "title": "Ecommerce Conversion Rates Hit Record Highs",
    "source": "Practical Ecommerce",
    "date": "1/3/2026",
    "snippet": "New data shows ecommerce conversion rates increased 12% year-over-year, driven by improved checkout experiences...",
    "url": "https://example.com/conversion",
    "flags": {},
    "tier": "high"
  }
]
```

### Output (LLM Response)

```json
{
  "selected": [
    {
      "id": "2",
      "rank": 1,
      "why": "Provides concrete conversion data with measurable outcomes for ecommerce",
      "confidence": 0.95
    },
    {
      "id": "0",
      "rank": 2,
      "why": "AI customer service tools with specific cost reduction metrics",
      "confidence": 0.9
    }
  ]
}
```

**Note**: Article with id "1" (Ukraine war) was excluded due to controversy filter, even though it was flagged for review. The LLM determined it was primarily about war, not retail supply chain impact.

## Verification Checklist

✅ Prompt contains "no intra-week recency bias"
✅ Prompt contains "exclude war/culture-war/election horse-race"
✅ Prompt contains "allow policy/regulation: tariffs, AI compliance, privacy"
✅ Candidate payload does NOT include numeric scores
✅ Candidate payload includes flags and tier (optional)
✅ Build succeeds without TypeScript errors

## Files Modified

1. `digest/buildWeeklyDigest.ts`
   - Replaced scoring functions with gating functions
   - Added controversy detection
   - Updated types from `ArticleWithRelevance` to `ArticleWithGate`

2. `digest/rerankArticles.ts`
   - Updated `CandidateArticle` type (removed `existingScore`, added `flags`, `tier`)
   - Rewrote `buildRerankPrompt()` with new Pandora-focused criteria
   - Updated candidate building code to use gate flags instead of scores

