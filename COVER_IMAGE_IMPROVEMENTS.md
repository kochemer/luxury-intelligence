# Cover Image Quality Improvements

## Summary

Updated the weekly cover image generation to produce photorealistic, high-end editorial magazine covers with improved fidelity and perceived quality.

## Final Prompt Template (Realistic Style)

```
Create a photorealistic editorial magazine cover art that visually represents the themes of this week's curated intelligence digest.

Topics covered: {category_names}

Key themes from this week's articles: {keywords}

Style requirements:
- Photorealistic editorial cover art with high-end fashion magazine aesthetic
- Realistic lighting, realistic materials, sharp details, subtle film grain
- Shallow depth of field, 50mm lens look, editorial studio lighting
- No text, no letters, no logos, no watermarks, no brand marks
- No collage cutouts, no cartoon, no exaggerated surrealism
- Composition: one central motif with subtle secondary elements
- Color palette: restrained, premium, sophisticated (not neon)
- Professional, elegant, suitable for a luxury intelligence publication
- Visual metaphor that captures the intersection of technology, commerce, and luxury

The image should feel like a premium photorealistic magazine cover from a high-end publication focused on business intelligence, technology trends, and luxury markets.
```

## Provider Parameters (DALL-E 3)

### Updated Settings:
- **Size**: `1792x1024` (was `1024x1024`)
  - Wider format optimized for magazine covers
  - Better aspect ratio for editorial layouts
  
- **Quality**: `hd` (was `standard`)
  - Highest quality available
  - Improved detail and sharpness
  - Better color accuracy

### Full API Call:
```typescript
{
  model: 'dall-e-3',
  prompt: prompt,
  n: 1,
  size: '1792x1024',  // Wider format
  quality: 'hd',      // Highest quality
  response_format: 'url',
}
```

## New Features

### 1. Style Control
- **CLI Flag**: `--coverStyle=realistic` (default) or `--coverStyle=illustration`
- Switches prompt adjectives only; same pipeline
- Example: `npx tsx scripts/buildWeeklyDigest.ts --week=2026-W02 --coverStyle=illustration`

### 2. File Size Sanity Check
- Minimum file size: **50KB**
- Files smaller than 50KB are treated as failures (likely errors/blanks)
- Falls back to placeholder if check fails
- Logs file size on successful generation

### 3. Enhanced Idempotency
- Checks file existence AND file size
- Regenerates if existing file is too small (< 50KB)
- Prevents serving corrupted/incomplete images

## Test Results

**Generated File**: `public/weekly-images/2026-W02.png`
- **File Size**: 3,327.8 KB (3.3 MB)
- **Status**: ✅ Passed sanity check (well above 50KB minimum)
- **Quality**: HD (highest available)
- **Dimensions**: 1792x1024 pixels

## Usage Examples

```bash
# Generate with realistic style (default)
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W02

# Regenerate with realistic style
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W02 --regenCover=true

# Use illustration style
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W02 --coverStyle=illustration

# Regenerate with illustration style
npx tsx scripts/buildWeeklyDigest.ts --week=2026-W02 --regenCover=true --coverStyle=illustration
```

## Key Improvements

1. **Photorealistic rendering** - Realistic lighting, materials, and details
2. **Higher resolution** - 1792x1024 vs 1024x1024 (75% more pixels)
3. **HD quality** - Maximum quality setting enabled
4. **Better composition** - Wider format suits magazine covers
5. **Quality assurance** - File size sanity check prevents serving bad images
6. **Style flexibility** - Optional illustration fallback style

