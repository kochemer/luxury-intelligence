# AI Category Debugging - Diagnosis & Solutions

## Problem Summary

The AI category is only returning **1 article** instead of 7. Here's what's happening step-by-step:

### Step-by-Step Breakdown

1. **LLM Reranking Attempt:**
   - LLM selected 7 articles
   - **6 of them were Arxiv articles** (violates max 1 Arxiv rule)
   - Validation caught this and rejected the response
   - Falls back to deterministic selection

2. **Deterministic Fallback Selection:**
   - Takes top 7 articles by deterministic score
   - **All 7 are Arxiv articles** (top-scored candidates are mostly Arxiv)
   - Passes to source diversity filtering

3. **Source Diversity Filtering:**
   - Keeps first Arxiv article (within limit of 1)
   - **Rejects 6 Arxiv articles** (exceeds limit)
   - Result: Only 1 article selected

4. **Backfilling Attempt:**
   - Tries to backfill from skipped articles (all Arxiv - can't add)
   - Tries to backfill from candidate pool (top candidates are Arxiv - can't add)
   - **Backfilling fails** - no eligible non-Arxiv articles in top candidates

### Root Cause

**The deterministic pre-filtering scores Arxiv articles too highly**, causing them to dominate the top 100 candidates. When fallback selection picks the top 7 by score, they're all Arxiv articles.

### Evidence from Debug Logs

```
[SourceDiversity] AI_and_Strategy: Starting with 7 articles
[SourceDiversity] AI_and_Strategy: Added "Refusal Steering..." from "Arxiv" (count: 1, arxiv: 1)
[SourceDiversity] AI_and_Strategy: Skipping "On shallow feedforward..." - Arxiv limit reached (1/1)
[SourceDiversity] AI_and_Strategy: Skipping "Embracing Ambiguity..." - Arxiv limit reached (1/1)
[SourceDiversity] AI_and_Strategy: Skipping "How malicious AI swarms..." - Arxiv limit reached (1/1)
[SourceDiversity] AI_and_Strategy: Skipping "Can Language Models..." - Arxiv limit reached (1/1)
[SourceDiversity] AI_and_Strategy: Skipping "The Percept-V Challenge..." - Arxiv limit reached (1/1)
[SourceDiversity] AI_and_Strategy: Skipping "Auditing and Mitigating..." - Arxiv limit reached (1/1)
[SourceDiversity] AI_and_Strategy: After initial pass - selected: 1, skipped: 6
[SourceDiversity] AI_and_Strategy: Backfilled 0 articles from skipped list
[SourceDiversity] AI_and_Strategy: Backfilled 0 articles from candidate pool
[SourceDiversity] AI_and_Strategy: Final count: 1/7
```

---

## Proposed Solutions

### Solution 1: Smart Fallback Selection (Recommended)

**Make the fallback selection enforce diversity constraints during selection, not after.**

**Implementation:**
- Modify `fallbackSelect` in `buildWeeklyDigest.ts` to enforce diversity **during** selection
- Instead of selecting top 7 by score, iterate through candidates and only add if diversity constraints allow
- This ensures we get diverse articles from the start, not just top-scored Arxiv articles

**Pros:**
- Ensures diverse selection even in fallback
- Doesn't require changing scoring logic
- Works with existing candidate pool

**Cons:**
- May select lower-scored articles if top candidates are all from same source

**Code Changes:**
```typescript
// In buildWeeklyDigest.ts, modify fallbackSelect to enforce diversity during selection
const fallbackSelect = (candidateList: Article[]): ArticleWithRelevance[] => {
  const selected: ArticleWithRelevance[] = [];
  const sourceCounts = new Map<string, number>();
  let arxivCount = 0;
  
  // Iterate through candidates (already sorted by score)
  for (const article of candidateList) {
    if (selected.length >= n) break;
    
    const normalizedSource = getNormalizedSource(article.source);
    const currentCount = sourceCounts.get(normalizedSource) || 0;
    const isArxivArticle = isArxiv(article.source);
    
    const canAddSource = currentCount < MAX_PER_SOURCE;
    const canAddArxiv = !isArxivArticle || (topic === 'AI_and_Strategy' ? arxivCount < 1 : true);
    
    // Only add if diversity constraints allow
    if (canAddSource && canAddArxiv) {
      // Add article
      selected.push({ ...article, relevance: ... });
      sourceCounts.set(normalizedSource, currentCount + 1);
      if (isArxivArticle) arxivCount++;
    }
    // Skip if constraints violated (don't add, continue to next)
  }
  
  return selected;
};
```

---

### Solution 2: Improve Backfilling Logic

**Make backfilling prioritize non-Arxiv articles when Arxiv limit is reached.**

**Implementation:**
- When backfilling from candidate pool, skip Arxiv articles if Arxiv limit is already reached
- Prioritize non-Arxiv articles in backfilling
- Sort candidate pool by score, but filter out Arxiv articles if limit reached

**Pros:**
- Simple change to existing backfilling logic
- Doesn't affect LLM selection
- Works with existing fallback

**Cons:**
- Only helps if there are non-Arxiv articles in candidate pool
- Doesn't fix root cause (top candidates being Arxiv)

**Code Changes:**
```typescript
// In applySourceDiversity, when backfilling from candidate pool:
if (finalSelected.length < targetCount && allCandidates && allCandidates.length > 0) {
  const selectedUrls = new Set(finalSelected.map(a => a.url));
  
  // Filter out Arxiv articles if limit reached
  const eligibleCandidates = arxivCount >= MAX_ARXIV_AI
    ? allCandidates.filter(a => !isArxiv(a.source))
    : allCandidates;
  
  for (const article of eligibleCandidates) {
    // ... existing backfilling logic
  }
}
```

---

### Solution 3: Adjust Deterministic Scoring for AI Category

**Reduce Arxiv source weight boost in deterministic scoring for AI category.**

**Implementation:**
- In `calculateRelevanceScore`, reduce the Arxiv source boost for AI category
- Currently: Arxiv sources get +0.15 boost
- Change to: +0.05 or +0.0 for Arxiv sources in AI category
- This will reduce Arxiv dominance in top candidates

**Pros:**
- Fixes root cause
- Ensures more diverse candidate pool
- Helps both LLM and fallback selection

**Cons:**
- May reduce quality if Arxiv articles are genuinely more important
- Requires tuning the boost value

**Code Changes:**
```typescript
// In buildWeeklyDigest.ts, calculateRelevanceScore:
if (topic === 'AI_and_Strategy') {
  const isAIFocusedSource = AI_FOCUSED_SOURCES.some(s => article.source.includes(s));
  const isArxivSource = article.source.toLowerCase().includes('arxiv');
  
  if (isArxivSource) {
    // Reduce Arxiv boost to prevent dominance
    sourceWeight = 0.05; // Reduced from 0.15
  } else if (isAIFocusedSource) {
    sourceWeight = 0.15;
  } else if (isRetailSource) {
    sourceWeight = 0;
  } else {
    sourceWeight = SOURCE_WEIGHTS[article.source] * 0.5;
  }
}
```

---

### Solution 4: Relax Arxiv Limit with Fallback

**Allow up to 2 Arxiv articles if we can't find enough non-Arxiv articles.**

**Implementation:**
- If after backfilling we still have < 7 articles, relax Arxiv limit to 2
- Only applies if we've exhausted backfilling options
- Ensures we always get close to 7 articles

**Pros:**
- Guarantees more articles selected
- Simple to implement
- Only relaxes when necessary

**Cons:**
- May violate original intent (max 1 Arxiv)
- Doesn't fix root cause

**Code Changes:**
```typescript
// In applySourceDiversity, after backfilling:
if (finalSelected.length < targetCount && category === 'AI_and_Strategy' && arxivCount >= MAX_ARXIV_AI) {
  // Relax Arxiv limit to 2 if we can't find enough articles
  const relaxedMaxArxiv = 2;
  // Try backfilling again with relaxed limit
  // ...
}
```

---

## Recommended Approach

**Combine Solution 1 + Solution 3:**

1. **Solution 3 (Adjust Scoring):** Reduce Arxiv boost to prevent dominance in candidate pool
2. **Solution 1 (Smart Fallback):** Make fallback enforce diversity during selection

This addresses both:
- **Root cause:** More diverse candidate pool (Solution 3)
- **Fallback safety:** Diverse selection even if top candidates are Arxiv (Solution 1)

---

## Implementation Priority

1. **Immediate Fix:** Solution 1 (Smart Fallback) - Quick to implement, fixes the immediate issue
2. **Long-term Fix:** Solution 3 (Adjust Scoring) - Addresses root cause, improves overall quality
