# GPT Image Migration: dall-e-3 → gpt-image-1.5

## Summary

Switched cover image generation from `dall-e-3` to `gpt-image-1.5` with hardened prompts for ultra-photorealism and strict no-text enforcement.

## Code Changes

### 1. Model Change

**File: `digest/generateCoverImage.ts`**

**Before:**
```typescript
const response = await openai.images.generate({
  model: 'dall-e-3',
  prompt: prompt,
  n: 1,
  size: '1792x1024',
  quality: 'hd',
  response_format: 'url',
});
```

**After:**
```typescript
const model = 'gpt-image-1.5';
let size = '1792x1024';

try {
  response = await openai.images.generate({
    model: model,
    prompt: prompt,
    n: 1,
    size: size,
    response_format: 'b64_json', // GPT Image returns base64, not URLs
  });
} catch (sizeError: any) {
  // Fallback to 1024x1024 if 1792x1024 not supported
  if (sizeError.message?.includes('size') || sizeError.message?.includes('dimension')) {
    console.warn(`Size ${size} not supported, falling back to 1024x1024`);
    size = '1024x1024';
    response = await openai.images.generate({
      model: model,
      prompt: prompt,
      n: 1,
      size: size,
      response_format: 'b64_json',
    });
  }
}
```

### 2. Base64 Decoding

**Before:**
```typescript
const imageUrl = response.data[0]?.url;
const imageResponse = await fetch(imageUrl);
const imageBuffer = await imageResponse.arrayBuffer();
const buffer = Buffer.from(imageBuffer);
```

**After:**
```typescript
const b64Json = response.data[0]?.b64_json;
if (!b64Json) {
  throw new Error('No base64 image data returned from GPT Image');
}

// Decode base64 to buffer
const buffer = Buffer.from(b64Json, 'base64');
```

### 3. Prompt Hardening

**New Function: `hardenPromptForPhotorealism()`**

Added to `digest/generateCoverImage.ts`:

```typescript
function hardenPromptForPhotorealism(prompt: string): string {
  return `${prompt}

PHOTOREALISM ENFORCEMENT:
- Ultra photorealistic editorial photograph, shot on a real DSLR or medium-format camera.
- Natural lighting, realistic skin texture, realistic reflections, realistic materials, real physics.
- Candid editorial realism; avoid stock-photo staging.

ANTI-CARTOON / ANTI-CGI:
- No illustration, no cartoon, no anime, no 3D render, no CGI, no synthetic look.

NO-TEXT GUARANTEE:
- Absolutely no text, letters, numbers, typography, signage, labels, price tags.
- No screens, dashboards, UI, holograms, floating icons, charts.
- Avoid any objects that commonly contain text (posters, newspapers, packaging, storefront signs). If unavoidable, they must be fully out of focus and unreadable.`;
}
```

This function is automatically called by `addBannerCompositionConstraints()` which wraps all prompts before sending to the image model.

### 4. Debugging Artifacts

**Updated `cover-input.json` structure:**

```json
{
  "weekLabel": "2026-W01",
  "homepageTopArticles": [...],
  "model": "gpt-image-1.5",
  "finalPrompt": "Full prompt string sent to GPT Image...",
  "imageSize": "1792x1024",
  "outputPath": "/weekly-images/2026-W01.png",
  "generatedAt": "2026-01-15T10:30:00.000Z"
}
```

These fields are automatically persisted in `generateWeeklyCoverImage()`.

## Size Support

- **Primary**: `1792x1024` (widest format, ≈1.75:1 aspect ratio)
- **Fallback**: `1024x1024` (if 1792x1024 not supported by model)

The code automatically detects unsupported sizes and falls back gracefully.

## Prompt Flow

1. Scene Director generates `finalImagePrompt`
2. Negative prompts integrated
3. **NEW**: `hardenPromptForPhotorealism()` adds photorealism enforcement
4. Banner composition constraints added
5. Final prompt sent to GPT Image

## Example Hardened Prompt

```
[Original Scene Director prompt]

PHOTOREALISM ENFORCEMENT:
- Ultra photorealistic editorial photograph, shot on a real DSLR or medium-format camera.
- Natural lighting, realistic skin texture, realistic reflections, realistic materials, real physics.
- Candid editorial realism; avoid stock-photo staging.

ANTI-CARTOON / ANTI-CGI:
- No illustration, no cartoon, no anime, no 3D render, no CGI, no synthetic look.

NO-TEXT GUARANTEE:
- Absolutely no text, letters, numbers, typography, signage, labels, price tags.
- No screens, dashboards, UI, holograms, floating icons, charts.
- Avoid any objects that commonly contain text (posters, newspapers, packaging, storefront signs). If unavoidable, they must be fully out of focus and unreadable.

COMPOSITION FOR WIDE HERO BANNER (CRITICAL):
- Wide, horizontally expansive banner format (target 3:1 or wider aspect ratio)
- Vertically minimal height - all important visual elements must be placed in the central horizontal band
- Safe margins at top and bottom - no critical content near vertical edges
- Composition must work when displayed in a wide, shallow container
- Avoid vertical stacking, tall elements, or content that extends to top/bottom edges
```

## Testing

To test the migration:

```bash
# Regenerate cover with new model
npx tsx scripts/regenerateCover.ts --week=2026-W01

# Check cover-input.json for debugging artifacts
cat data/weeks/2026-W01/cover-input.json
```

Expected output in `cover-input.json`:
- `model`: "gpt-image-1.5"
- `finalPrompt`: Full hardened prompt
- `imageSize`: "1792x1024" or "1024x1024"
- `outputPath`: "/weekly-images/2026-W01.png"

## Backward Compatibility

- Existing cached scene outputs still work (Scene Director output unchanged)
- Only the image generation step changed (model + prompt hardening)
- Fallback prompt builder also uses new model

## Files Modified

1. **`digest/generateCoverImage.ts`**
   - Changed model from `dall-e-3` to `gpt-image-1.5`
   - Changed `response_format` from `url` to `b64_json`
   - Added base64 decoding logic
   - Added `hardenPromptForPhotorealism()` function
   - Updated return type to include `size` and `model`
   - Added debugging artifacts to `cover-input.json`

2. **`scripts/buildWeeklyDigest.ts`**
   - Removed duplicate `cover-input.json` writing (now handled in `generateWeeklyCoverImage`)

3. **`scripts/regenerateCover.ts`**
   - Deprecated local `generateCoverImage` function (now uses `generateWeeklyCoverImage`)

