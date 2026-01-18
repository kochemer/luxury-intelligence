# Podcast Script Length Improvements

## Current Problem
Scripts are consistently coming in at 955-1590 words (6-11 minutes) when the target is 2250-3000 words (15-20 minutes).

## Root Causes Identified

1. **Token Limit Too Low**: `max_tokens: 12000` may be insufficient for 3000+ word scripts
2. **Unused Expansion Function**: `expandScript()` exists but is never called
3. **Weak Enforcement**: Retry only happens once and may not be effective
4. **Vague Segment Targets**: Dynamic calculation results in low minimums (~600 words per segment)
5. **Prompt Overload**: Very long prompt may dilute key requirements
6. **No Section Validation**: Script isn't validated section-by-section

## Recommended Solutions (Prioritized)

### 1. **Increase Token Limit** (High Impact, Low Risk)
**Current**: `max_tokens: 12000`  
**Recommended**: `max_tokens: 16000` or `20000`

**Rationale**: 3000 words ≈ 4000-4500 tokens. With JSON overhead and structure, 12000 may be cutting off output.

**Implementation**:
```typescript
max_tokens: 16000, // Increased from 12000 to allow full 3000+ word scripts
```

---

### 2. **Activate expandScript() Function** (High Impact, Medium Risk)
**Current**: Function exists but is never called  
**Recommended**: Use as automatic fallback after retry

**Implementation**:
```typescript
// After retry check in generatePodcastScript()
if (actualWordCount < STRICT_MIN_WORD_COUNT && !isRetry) {
  // ... existing retry logic ...
} else if (actualWordCount < STRICT_MIN_WORD_COUNT) {
  // After retry, if still short, use expandScript
  console.log(`[Script] Expanding script from ${actualWordCount} to ${STRICT_MIN_WORD_COUNT} words...`);
  return expandScript(script, STRICT_MIN_WORD_COUNT);
}
```

---

### 3. **Increase Segment Word Targets** (Medium Impact, Low Risk)
**Current**: Dynamic calculation yields ~600 words per segment  
**Recommended**: Fixed higher targets per segment

**Current Calculation**:
```typescript
segment1: Math.max(600, Math.ceil((STRICT_MIN_WORD_COUNT - 50 - 150 - 600 - 500 - 100) / 4))
// Results in ~600 words per segment
```

**Recommended**:
```typescript
const segmentWordTargets = {
  coldOpen: 75,      // Increased from 50
  intro: 200,        // Increased from 150
  segment1: 750,     // Fixed target (was ~600)
  segment2: 750,     // Fixed target
  segment3: 750,     // Fixed target
  segment4: 750,     // Fixed target
  lightning: 600,     // Increased from 500
  closing: 150        // Increased from 100
};
// Total: 3,125 words (target ~20-21 minutes)
```

---

### 4. **Add Per-Article Word Count Requirements** (Medium Impact, Low Risk)
**Current**: "150-200 words per article" (vague)  
**Recommended**: Explicit minimums with examples

**Implementation in Prompt**:
```
PER-ARTICLE REQUIREMENTS (MANDATORY):
- Each article MUST receive at least 180 words of discussion
- Structure per article:
  * Hook/context (30-40 words): "This week, [source] reported..."
  * What happened (50-60 words): Detailed explanation
  * Why it matters (40-50 words): Implications for retail/ecommerce/luxury
  * Connections (30-40 words): Link to other stories or trends
  * Analysis (30-40 words): Deeper insights or real-world applications

Example (180+ words):
"This week, Business of Fashion reported that luxury sales hit record highs despite economic uncertainty. The article details how brands like LVMH and Richemont saw double-digit growth in key markets, particularly in Asia and the Middle East. This matters because it shows luxury is becoming more resilient to economic downturns, with consumers prioritizing quality and status over price sensitivity. This connects to our earlier story about AI personalization - luxury brands are using technology to better target high-value customers. The implications are significant: we may see more luxury brands investing in digital experiences and data analytics, even as they maintain their premium positioning. For Pandora colleagues, this suggests the luxury market remains strong, but competition for high-value customers will intensify."

With 4 articles per segment × 180 words = 720 words minimum per segment (excluding transitions).
```

---

### 5. **Improve Full-Text Utilization** (Medium Impact, Low Risk)
**Current**: Instructions exist but may not be emphasized enough  
**Recommended**: More explicit guidance on extracting details

**Implementation in Prompt**:
```
FULL-TEXT ARTICLES (hasFullText: true):
You have access to the COMPLETE article text. You MUST:
1. Extract at least 3-5 specific facts, numbers, or quotes from the full text
2. Reference these explicitly in your discussion (e.g., "According to the article, sales increased by 23%...")
3. Use full text to provide deeper context that isn't in the summary
4. Write 200-250 words per full-text article (not 180)

Example extraction from full text:
- "The company reported $7.4 billion in revenue" → Use exact number
- "Analysts predict 15% growth next quarter" → Include prediction
- "CEO stated: 'We're seeing unprecedented demand'" → Quote directly
```

---

### 6. **Add Section-by-Section Validation** (Low Impact, High Maintenance)
**Recommended**: Parse script and validate each section meets its target

**Implementation** (Optional - more complex):
```typescript
function validateScriptSections(script: PodcastScript, targets: SegmentWordTargets): {
  valid: boolean;
  issues: string[];
} {
  // Parse script into sections (heuristic-based)
  // Check each section meets its word target
  // Return validation results
}
```

**Note**: This adds complexity. Consider only if other solutions don't work.

---

### 7. **Improve Prompt Structure** (Low Impact, Low Risk)
**Current**: Very long prompt with requirements scattered  
**Recommended**: Reorganize with word count requirements at top

**Structure**:
1. **CRITICAL REQUIREMENTS** (first 10 lines)
   - Total word count targets
   - Per-segment targets
   - Per-article minimums
2. **Content Requirements**
   - What to include
   - How to expand
3. **Article Data**
   - Full text instructions
   - Article list

---

### 8. **Increase Lightning Round** (Low Impact, Low Risk)
**Current**: 500 words for lightning round  
**Recommended**: 600-700 words with more articles

**Rationale**: Lightning round can be expanded with more quick hits or deeper context on each.

---

## Implementation Priority

### Phase 1 (Quick Wins - Implement First)
1. ✅ Increase `max_tokens` to 16000
2. ✅ Activate `expandScript()` as fallback
3. ✅ Increase segment word targets (fixed values)
4. ✅ Improve per-article requirements in prompt

### Phase 2 (If Phase 1 Doesn't Solve)
5. ✅ Improve full-text utilization instructions
6. ✅ Reorganize prompt structure
7. ✅ Increase lightning round target

### Phase 3 (Only if Needed)
8. ⚠️ Add section-by-section validation (complex, may not be necessary)

---

## Expected Results

**Before**:
- Scripts: 955-1590 words (6-11 min)
- Success rate: ~30% meeting target

**After Phase 1**:
- Scripts: 2200-2800 words (15-19 min)
- Success rate: ~70% meeting target

**After Phase 2**:
- Scripts: 2500-3200 words (17-21 min)
- Success rate: ~85% meeting target

---

## Sustainability Considerations

1. **Token Costs**: Increasing `max_tokens` increases costs slightly, but ensures quality output
2. **Generation Time**: `expandScript()` adds one extra LLM call if needed (acceptable)
3. **Maintenance**: Fixed segment targets are easier to maintain than dynamic calculations
4. **Consistency**: Explicit per-article requirements make output more predictable

---

## Testing Plan

1. Implement Phase 1 changes
2. Run podcast generation for 3 different weeks
3. Measure:
   - Average word count
   - % meeting STRICT_MIN_WORD_COUNT
   - % meeting TARGET_WORD_COUNT
   - Generation time
   - Token usage
4. If results improve but not enough, proceed to Phase 2
5. Monitor for 2-3 weeks to ensure sustainability
