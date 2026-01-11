# Cover Image Generation Redesign

## Summary

Redesigned the weekly cover image generation to produce hyper-realistic, article-specific editorial photographs instead of abstract visual metaphors. The new approach creates concrete, staged scenes that clearly relate to the top 2-3 articles of the week.

## Key Design Shift

**From:** Abstract visual metaphor for themes  
**To:** Concrete, staged editorial photograph inspired by specific article narratives

## New Prompt Template

```
Create a hyper-realistic editorial magazine cover photograph inspired by this week's top retail and luxury intelligence stories.

Scene:
A single, coherent real-world scene that visually combines the following elements:
{VISUAL_ANCHOR_1}, {VISUAL_ANCHOR_2}, {VISUAL_ANCHOR_3}

Narrative intent:
The scene should subtly reflect:
- {Article 1: what's happening + why it matters}
- {Article 2: what's happening + why it matters}
(Optional third only if it fits naturally)

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

## Example: Filled Prompt (Week 2026-W01)

### Input Articles (Top 3 Selected)

**Article 1:**
- Title: "Visa reports 4.2pc rise in US holiday retail spending"
- Snippet: "Findings indicate artificial intelligence influenced consumer behavior during the season, shaping how shoppers discovered products and compared prices."
- AI Summary: "Visa's report shows a 4.2% increase in US holiday retail spending, with artificial intelligence playing a significant role in shaping consumer behavior by influencing product discovery and price comparisons."
- Rerank Why: "Insights on AI's impact on holiday retail spending"

**Article 2:**
- Title: "The Psychology of AI SERPs and Shopping"
- Snippet: "The rise of \"zero-click\" searches may signal the coming effect of AI shopping on product discovery and decision-making."
- AI Summary: "AI-driven \"zero-click\" searches are changing the landscape of product discovery and decision-making, hinting at the impact of AI on shopping behavior."
- Rerank Why: "Explores AI's influence on product discovery"

**Article 3:**
- Title: "Cartier UK sales surpassed £250 million while Pragnell faced a profit squeeze"
- (From Luxury & Consumer category)

### Generated Context

**Article 1 Context:**
- Headline: "Visa reports 42pc rise in US holiday retail spending"
- What's happening: "Visa's report shows a 4.2% increase in US holiday retail spending, with artificial intelligence playing a significant role in shaping consumer behavior by influencing product discovery and price comparisons."
- Why it matters: "Insights on AI's impact on holiday retail spending. This impacts retail and ecommerce operations."

**Article 2 Context:**
- Headline: "The Psychology of AI SERPs and Shopping"
- What's happening: "AI-driven \"zero-click\" searches are changing the landscape of product discovery and decision-making, hinting at the impact of AI on shopping behavior."
- Why it matters: "Explores AI's influence on product discovery. This impacts retail and ecommerce operations."

**Visual Anchors Extracted:**
- Person: "shopper" (from Article 1)
- Place: "modern retail environment" (default, no place found)
- Object: "smartphone" (from Article 2, "phone" detected)

### Example Filled Prompt

```
Create a hyper-realistic editorial magazine cover photograph inspired by this week's top retail and luxury intelligence stories.

Scene:
A single, coherent real-world scene that visually combines the following elements:
shopper, modern retail environment, smartphone

Narrative intent:
The scene should subtly reflect:
- Visa's report shows a 4.2% increase in US holiday retail spending, with artificial intelligence playing a significant role in shaping consumer behavior by influencing product discovery and price comparisons. Insights on AI's impact on holiday retail spending. This impacts retail and ecommerce operations.
- AI-driven "zero-click" searches are changing the landscape of product discovery and decision-making, hinting at the impact of AI on shopping behavior. Explores AI's influence on product discovery. This impacts retail and ecommerce operations.

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

## Side-by-Side: Old vs New Prompt

### OLD PROMPT (Abstract Metaphor)

```
Create a photorealistic editorial magazine cover art that visually represents the themes of this week's curated intelligence digest.

Topics covered: AI & Strategy, Ecommerce & Retail Tech, Luxury & Consumer, Jewellery Industry

Key themes from this week's articles: visa, reports, holiday, retail, spending, psychology, serps, shopping, cartier, sales, pragnell, profit

Style: Photoreal editorial magazine cover art, premium fashion-mag aesthetic, realistic studio lighting, realistic materials and textures, crisp micro-detail, subtle film grain, natural color grading, shallow depth of field, professional photography look. No text, no typography, no logos, no watermarks, no brand marks, no collage cutouts, no cartoon styling.

Composition: one central motif with subtle secondary elements. Color palette: restrained, premium, sophisticated (not neon). Visual metaphor that captures the intersection of technology, commerce, and luxury. The image should feel like a premium photorealistic magazine cover from a high-end publication focused on business intelligence, technology trends, and luxury markets.
```

**Problems:**
- Abstract "visual metaphor" - unclear what to show
- Generic keyword list - not tied to specific stories
- No concrete scene description
- Produces generic, disconnected imagery

### NEW PROMPT (Concrete Scene)

```
Create a hyper-realistic editorial magazine cover photograph inspired by this week's top retail and luxury intelligence stories.

Scene:
A single, coherent real-world scene that visually combines the following elements:
shopper, modern retail environment, smartphone

Narrative intent:
The scene should subtly reflect:
- Visa's report shows a 4.2% increase in US holiday retail spending, with artificial intelligence playing a significant role in shaping consumer behavior by influencing product discovery and price comparisons. Insights on AI's impact on holiday retail spending. This impacts retail and ecommerce operations.
- AI-driven "zero-click" searches are changing the landscape of product discovery and decision-making, hinting at the impact of AI on shopping behavior. Explores AI's influence on product discovery. This impacts retail and ecommerce operations.

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

**Improvements:**
- Concrete scene description with specific elements
- Tied to actual article narratives
- Clear visual anchors (person, place, object)
- Explicit narrative intent from articles
- Stronger constraints against text artifacts

## Implementation Details

### Article Selection
- Selects top 2-3 articles across all categories
- Prioritizes rank 1 from each category
- Falls back to rank 2 if needed to reach 3 articles

### Context Extraction
- **Headline**: Rewritten to 8-10 words, no punctuation
- **What's happening**: Extracted from aiSummary → snippet → title (first sentence, 20-200 chars)
- **Why it matters**: Uses rerankWhy if available, ensures retail/ecommerce context

### Visual Anchor Extraction
- **People**: shopper, customer, retail manager, analyst, executive, etc.
- **Places**: luxury retail store, warehouse, showroom, office, boardroom, etc.
- **Objects**: laptop, smartphone, jewelry display, robot arm, price tag, etc.
- Ensures at least one of each type (person, place, object)
- Defaults added if not found in article content

### Safety Guards
- Prompt length check (warns if < 200 chars)
- Ensures visual anchors are concrete (not abstract)
- Forces scene selection (person + place + object)
- Explicit "no readable surfaces" constraint

## Configuration

- **Model**: `dall-e-3` (unchanged)
- **Size**: `1792x1024` (unchanged)
- **Quality**: `hd` (unchanged)
- **Style**: Realistic only (illustration mode removed)

## Files Modified

1. `digest/generateCoverImage.ts`
   - Completely rewrote `buildImagePrompt()` function
   - Added article context extraction functions
   - Added visual anchor extraction
   - Removed illustration mode
   - Updated types to include snippet, aiSummary, rerankWhy

2. `scripts/buildWeeklyDigest.ts`
   - Updated to pass full article objects (with snippet, aiSummary, rerankWhy) instead of just title/source

## Testing

Build completed successfully. Ready for testing with `--regenCover` flag.

