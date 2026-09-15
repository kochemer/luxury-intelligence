# Cover Image Scene Director Implementation

## Overview

The cover image generation now uses a 2-step pipeline:
1. **Scene Director (LLM)**: Generates the final image prompt from prioritized articles
2. **DALL·E**: Renders the image using the generated prompt

## Architecture

### Module: `digest/sceneDirector.ts`

The Scene Director is an LLM-based system that takes the week's top articles and generates a structured scene concept with a final DALL-E prompt.

### Module: `digest/generateCoverImage.ts`

Updated to use the Scene Director pipeline:
- Calls `generateCoverScenePrompt()` first
- Uses the `finalImagePrompt` from Scene Director
- Integrates `negativePrompt` into the main prompt (DALL-E doesn't support separate negative prompts)
- Persists scene output to `data/weeks/{week}/cover-scene.json`

## Scene Director Prompt Structure

### System Prompt
```
You are a Scene Director for editorial photography. You output ONLY valid JSON, no markdown, no code blocks, no explanations.
```

### User Prompt Template
```
You are a Scene Director for a premium business and retail intelligence publication. Your job is to design a single, coherent, hyper-realistic editorial photograph that visually represents the week's top articles.

CRITICAL CONSTRAINTS:
1. You MUST create ONE coherent real-world scene (no collage, no split-screen, no multiple scenes)
2. The scene MUST be photorealistic editorial photography, NOT illustration, cartoon, or CGI
3. You can ONLY use the provided articles as inspiration - do not introduce themes, scenes, or ideas not directly grounded in them
4. The scene must encode novelty via situation/action/contrast, NOT via sci-fi elements, overlays, or abstract graphics
5. NO text-bearing surfaces (signs/screens/newspapers/labels). If unavoidable, specify "fully blurred / out of focus / turned away"
6. Humor must be subtle (irony/contrast), never slapstick or cartoon
7. Recency is irrelevant - focus on the conceptual essence

ARTICLES TO REPRESENT:
[Article 1 details]
[Article 2 details]
...

VARIANT GUIDANCE: [safe or fun guidance]

OUTPUT FORMAT (JSON only, no markdown, no code blocks):
{
  "conceptTitle": "short internal label",
  "oneSentenceConcept": "one sentence describing the scene",
  "visualAnchors": {
    "location": "...",
    "subjects": ["...", "..."],
    "props": ["...", "..."],
    "action": "..."
  },
  "humorNote": "subtle humor mechanism (if any)",
  "finalImagePrompt": "A SINGLE STRING to send to DALL-E",
  "negativePrompt": [
    "text, letters, numbers, signage, labels",
    "screens, UI, dashboards, holograms, floating icons",
    "logos, brands, watermarks",
    "cartoon, illustration, CGI, 3D render, anime"
  ],
  "confidence": 0.0
}
```

## Example Output: `cover-scene.json`

```json
{
  "conceptTitle": "luxury-retail-contrast",
  "oneSentenceConcept": "A luxury jewelry boutique manager examines high-end pieces while a customer checks their smartphone, capturing the tension between traditional luxury retail and modern digital commerce.",
  "visualAnchors": {
    "location": "luxury jewelry boutique in London",
    "subjects": ["luxury retail manager", "affluent customer"],
    "props": ["jewelry display case", "smartphone"],
    "action": "examining jewelry while checking phone"
  },
  "humorNote": "subtle irony: luxury retail setting with digital device intrusion",
  "finalImagePrompt": "Create a hyper-realistic editorial photograph for a premium business and retail intelligence publication. A luxury jewelry boutique in London, shot on a high-end DSLR with natural window lighting. A luxury retail manager and an affluent customer are examining jewelry pieces in a display case. The customer holds a smartphone, creating a subtle visual tension between traditional luxury retail and modern digital commerce. Realistic skin texture, fabric texture, reflections on glass, slight imperfections. Shallow depth of field. Editorial realism style (Financial Times / WSJ Magazine / Vogue Business). One clear focal subject with secondary elements adding context. Clean background. Candid, mid-action moment. NO screens with visible content, NO text, NO signage, NO logos. If any text-bearing surface appears, it must be fully blurred, out of focus, or turned away from camera. Avoid stock photo aesthetic - this should look like a real photograph taken in a real location.",
  "negativePrompt": [
    "text, letters, numbers, signage, labels",
    "screens, UI, dashboards, holograms, floating icons",
    "logos, brands, watermarks",
    "cartoon, illustration, CGI, 3D render, anime"
  ],
  "confidence": 0.85
}
```

## Final DALL-E Prompt (with Negative Constraints Integrated)

Since DALL-E doesn't support separate negative prompts, the negative constraints are integrated into the main prompt:

```
[finalImagePrompt from Scene Director]

CRITICAL CONSTRAINTS (must be strictly avoided):
- text, letters, numbers, signage, labels, screens, UI, dashboards, holograms, floating icons, logos, brands, watermarks, cartoon, illustration, CGI, 3D render, anime
```

## Variants

### `--variant=safe` (default)
- Conservative, straightforward interpretation
- Prioritizes guaranteed realism over creative risk
- Lower temperature guidance in prompt

### `--variant=fun`
- Allows subtle irony, contrast, or unexpected moments
- Balances realism with visual interest
- Slightly more creative interpretation

## Fallback Behavior

1. **Low Confidence (< 0.55)**: Uses a safe template prompt instead of LLM output
2. **LLM Failure**: Falls back to legacy prompt builder
3. **API Key Missing**: Skips generation, returns placeholder

## Data Flow

1. `buildWeeklyDigest.ts` → calls `generateWeeklyCoverImage()`
2. `generateWeeklyCoverImage()` → calls `generateCoverScenePrompt()` (Scene Director)
3. Scene Director → generates JSON with `finalImagePrompt`
4. Scene output → saved to `data/weeks/{week}/cover-scene.json`
5. `finalImagePrompt` + `negativePrompt` → integrated into final DALL-E prompt
6. DALL-E → generates image → saved to `public/weekly-images/{week}.png`
7. `cover-input.json` → updated with `finalImagePrompt` for regeneration

## Usage

### Build Digest with Cover (default: safe variant)
```bash
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W01
```

### Build with Fun Variant
```bash
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W01 --variant=fun
```

### Regenerate Cover Only
```bash
npx tsx scripts/regenerateCover.ts --week=2026-W01 --variant=safe
```

## Article Binding

The Scene Director is **strictly bound** to the provided articles:
- Only top 1-2 from Ecommerce & Retail Tech
- Only top 1-2 from Jewellery Industry
- Optional: 1 supporting article if it improves coherence
- Maximum 4 articles total

The LLM prompt explicitly states: "You can ONLY use the provided articles as inspiration - do not introduce themes, scenes, or ideas not directly grounded in them."

## Caching

Scene Director outputs are cached in `data/scene_director_cache.json`:
- Cache key: SHA256 hash of `weekLabel + articleTitles + variant`
- Prevents redundant LLM calls for same article combinations
- Versioned to allow cache invalidation on prompt changes

