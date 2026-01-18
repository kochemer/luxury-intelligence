# Paywall-Aware Selection

## Overview

The paywall-aware selection system reduces paywalled articles in the final Top-N selection to improve podcast script quality and full-text availability.

## Implementation

### 1. Paywall Detection

Paywall status is detected during article extraction (`discovery/fetchExtract.ts`):

- **HTTP Status Codes**: 401, 402, 403 → `likely_paywalled`
- **HTML Markers**: Detects paywall-related HTML elements/classes
- **Text Patterns**: Detects paywall-related text patterns
- **Word Count**: Articles with < 200 words after extraction → `likely_paywalled`
- **Unknown**: If article was never fetched/extracted → `unknown`

### 2. Selection Penalties

**LLM Ranking Prompt** (`discovery/selectTop.ts`):
- Includes `paywallStatus` for each candidate
- Instruction: "Prefer articles that are NOT paywalled. If two articles are similarly relevant, choose the non-paywalled one."

### 3. Paywall Cap

After LLM ranking and deterministic selection:
- **Max paywalled per category**: 1 (configurable via `MAX_PAYWALLED_PER_CATEGORY`)
- If exceeded, lowest-ranked paywalled articles are replaced with non-paywalled candidates from the ranked list

### 4. Reporting

Selection reports include paywall statistics:
- `selected_paywalled`: Count of paywalled articles
- `selected_not_paywalled`: Count of non-paywalled articles
- `selected_unknown`: Count of articles with unknown paywall status
- `paywalled_percentage`: Percentage of selected articles that are paywalled

## Configuration

### Environment Variables

```bash
# Max paywalled articles per category (default: 1)
MAX_PAYWALLED_PER_CATEGORY=1
```

### Default Values

- `MAX_PAYWALLED_PER_CATEGORY`: 1
- Paywall detection is automatic (no configuration needed)

## Example Output

```
=== SELECTION SUMMARY ===
Candidates: 120
Ranked (TOP_K): 40
Selected: 28
Exclusions:
  - Domain cap: 5
  - Duplicates: 3
  - Hard controversy: 2
  - Sponsored: 1
Paywall stats:
  - Paywalled: 2 (7%)
  - Not paywalled: 24
  - Unknown: 2
```

## Files Modified

1. `discovery/fetchExtract.ts`: Added paywall detection during extraction
2. `discovery/selectTop.ts`: Added paywall-aware selection and cap enforcement
3. Types updated: `ExtractedArticle`, `SelectedArticle`, `SelectionReport`

## Benefits

- **Podcast Quality**: More articles with full text available for podcast script generation
- **Content Quality**: Better access to detailed article content for analysis
- **Transparency**: Clear reporting on paywall status in selection reports
