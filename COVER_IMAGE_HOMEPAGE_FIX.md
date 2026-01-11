# Cover Image Generation - Homepage Alignment Fix

## Problem Solved

The cover image generation was using articles from all categories, causing a mismatch with what users see on the homepage. The image now uses **ONLY** the top articles displayed on the homepage.

## Solution

### Authoritative Source
The cover image is now generated **exclusively** from:
- **Top 1-2 articles from Ecommerce & Retail Tech** (rank #1 and #2)
- **Top 1-2 articles from Jewellery Industry** (rank #1 and #2)

These are the exact articles already selected, ranked, and rendered on the homepage.

## Updated Function Signature

```typescript
/**
 * Generate cover image for a weekly digest
 * @param weekLabel - Week label (e.g., "2026-W01")
 * @param homepageTopArticles - Top 1-2 articles from Ecommerce & Retail Tech and Jewellery Industry (the exact articles shown on homepage)
 * @param regenCover - Force regeneration even if image exists
 * @param coverStyle - Deprecated, always uses realistic now
 * @returns Success status, image path, and keywords
 */
export async function generateWeeklyCoverImage(
  weekLabel: string,
  homepageTopArticles: HomepageTopArticles,  // Changed from CategoryData[]
  regenCover: boolean = false,
  coverStyle: 'realistic' | 'illustration' = 'realistic'
): Promise<{ success: boolean; imagePath?: string; keywords: string[] }>
```

### Type Definition

```typescript
/**
 * Homepage top articles - the authoritative source for cover image generation.
 * These are the exact articles displayed on the homepage (top 1-2 from Ecommerce & Retail Tech and Jewellery Industry).
 * The cover image MUST be generated exclusively from these articles to maintain user trust and relevance.
 */
type HomepageTopArticles = Article[];
```

## Code Changes

### 1. Build Script (`scripts/buildWeeklyDigest.ts`)

**Before:**
```typescript
const categories = [
  { name: 'AI & Strategy', articles: [...all top 7...] },
  { name: 'Ecommerce & Retail Tech', articles: [...all top 7...] },
  { name: 'Luxury & Consumer', articles: [...all top 7...] },
  { name: 'Jewellery Industry', articles: [...all top 7...] },
];
const coverResult = await generateWeeklyCoverImage(weekLabel, categories, regenCover, coverStyle);
```

**After:**
```typescript
// AUTHORITATIVE SOURCE: Use ONLY top 1-2 articles from Ecommerce & Retail Tech and Jewellery Industry
// These are the exact articles displayed on the homepage
const homepageTopArticles = [
  ...digest.topics.Ecommerce_Retail_Tech.top.slice(0, 2),  // Top 2 only
  ...digest.topics.Jewellery_Industry.top.slice(0, 2),     // Top 2 only
];
const coverResult = await generateWeeklyCoverImage(weekLabel, homepageTopArticles, regenCover, coverStyle);
```

### 2. Image Prompt (`digest/generateCoverImage.ts`)

**Key Changes:**
- Removed category names from prompt
- Removed global keyword lists
- Added explicit enforcement line: "This image must visually represent ONLY the following articles..."
- Lists the exact articles being used
- Visual anchors extracted ONLY from homepage articles

## Example: Real Prompt Generated (Week 2026-W01)

### Input Articles (Homepage Top Articles)

**From Ecommerce & Retail Tech (Top 2):**
1. "Visa reports 4.2pc rise in US holiday retail spending"
   - Snippet: "Findings indicate artificial intelligence influenced consumer behavior during the season, shaping how shoppers discovered products and compared prices."
   - AI Summary: "Visa's report shows a 4.2% increase in US holiday retail spending, with artificial intelligence playing a significant role in shaping consumer behavior by influencing product discovery and price comparisons."
   - Rerank Why: "Insights on AI's impact on holiday retail spending"

2. "The Psychology of AI SERPs and Shopping"
   - Snippet: "The rise of \"zero-click\" searches may signal the coming effect of AI shopping on product discovery and decision-making."
   - AI Summary: "AI SERPs and the increasing prevalence of \"zero-click\" searches are shaping the future of AI shopping, impacting how consumers discover products and make purchasing decisions."
   - Rerank Why: "Explores AI's influence on product discovery"

**From Jewellery Industry (Top 2):**
1. "Cartier UK sales top £250 million for the first time"
   - Snippet: "Cartier has grown at twice the pace of its parent company, Richemont, in the UK, the company's latest published accounts show. Sales in the UK rose by 11% to £251 million in the financial year that ended in March 2025."
   - AI Summary: "In the financial year ending March 2025, Cartier's UK sales surpassed £250 million for the first time, with an 11% increase in sales and a 25% rise in operating profit."
   - Rerank Why: "Highlights significant sales growth in luxury retail"

2. "Pragnell sales top £100 million for first time"
   - Snippet: "Pragnell delivered record sales of £100.5 million in its 2024-25 financial year but rising costs, including investment in expanding its retail network, continued to weigh on operating profit."
   - (Additional data...)

### Generated Prompt

```
Create a hyper-realistic editorial magazine cover photograph inspired by this week's top retail and luxury intelligence stories.

CRITICAL: This image must visually represent ONLY the following articles, which are the top stories shown on the homepage. Do not introduce themes, scenes, or ideas not directly grounded in them.

Articles to represent:
Article 1: Visa reports 4.2pc rise in US holiday retail spending
Article 2: The Psychology of AI SERPs and Shopping
Article 3: Cartier UK sales top £250 million for the first time
Article 4: Pragnell sales top £100 million for first time

Scene:
A single, coherent real-world scene that visually combines the following elements:
shopper, modern retail environment, smartphone

Narrative intent:
The scene should subtly reflect:
- Visa's report shows a 4.2% increase in US holiday retail spending, with artificial intelligence playing a significant role in shaping consumer behavior by influencing product discovery and price comparisons. Insights on AI's impact on holiday retail spending. This impacts retail and ecommerce operations.
- AI SERPs and the increasing prevalence of "zero-click" searches are shaping the future of AI shopping, impacting how consumers discover products and make purchasing decisions. Explores AI's influence on product discovery. This impacts retail and ecommerce operations.
- In the financial year ending March 2025, Cartier's UK sales surpassed £250 million for the first time, with an 11% increase in sales and a 25% rise in operating profit. Highlights significant sales growth in luxury retail. This impacts retail and ecommerce operations.
- Pragnell delivered record sales of £100.5 million in its 2024-25 financial year but rising costs continued to weigh on operating profit. [Why it matters extracted]. This impacts retail and ecommerce operations.

Style & realism:
- Ultra-photorealistic, professional editorial photography
- Looks like a real staged photoshoot for a top-tier business or fashion magazine
- Natural lighting, realistic materials, real physics
- High micro-detail, shallow depth of field
- No illustration, no abstraction, no surreal elements

Tone:
- Premium, intelligent, slightly humorous or ironic
- Humor should come from visual contrast or situation, not cartoons
- Clever, not playful

Composition:
- One dominant focal point
- Secondary elements clearly readable but not cluttered
- Feels intentional, not symbolic soup

STRICT CONSTRAINTS (CRITICAL):
- Absolutely no text, letters, numbers, symbols, signage, screens with UI, newspapers, charts, or labels
- No logos, no brand marks, no watermarks
- No abstract shapes, no floating objects, no surreal distortions
- No collage, no split scenes

Output should feel like:
'A real photograph that clearly hints at what the top stories are about — even without text.'
```

## Key Improvements

1. **Explicit Article List**: The prompt now lists the exact articles being used
2. **Enforcement Line**: "This image must visually represent ONLY the following articles..."
3. **No Category Names**: Removed generic category names that could introduce unrelated themes
4. **No Global Keywords**: Removed keyword extraction from all categories
5. **Homepage Alignment**: Image generation uses the same articles users see on the homepage

## Fail-Safe Logic

- If fewer than 2 articles exist in a category → uses what is available
- If one category is empty → generates from the other category only
- If articles are thematically incompatible → picks the single strongest article (first one)
- Never blends unrelated narratives just to use all inputs

## Verification

✅ Build completed successfully
✅ TypeScript compilation passed
✅ Function signature updated
✅ Prompt includes explicit enforcement line
✅ Only homepage articles are used
✅ No category names or global keywords in prompt

