# Cover Image Generation Prompt Template

This document describes the prompt template used for generating weekly digest cover images using DALL-E 3.

## Prompt Structure

The prompt is built dynamically from the week's top articles across all categories. It includes:

1. **Topics covered**: Category names (e.g., "AI & Strategy, Ecommerce & Retail Tech, Luxury & Consumer, Jewellery Industry")
2. **Key themes**: Up to 12 keywords extracted from the top 3 article titles per category (max 12 titles total)
3. **Style requirements**: Editorial magazine cover aesthetic specifications

## Full Prompt Template

```
Create an editorial magazine cover illustration that visually represents the themes of this week's curated intelligence digest.

Topics covered: {category_names}

Key themes from this week's articles: {keywords}

Style requirements:
- Clean, premium, modern editorial magazine cover aesthetic
- No logos, no brand names, no text on the image
- Abstract but thematically linked to the week's topics
- Color palette: restrained, high-end (not neon), sophisticated
- Composition: one central motif with subtle secondary elements
- Professional, elegant, suitable for a luxury intelligence publication
- Visual metaphor that captures the intersection of technology, commerce, and luxury

The illustration should feel like a premium magazine cover that would appear in a high-end publication focused on business intelligence, technology trends, and luxury markets.
```

## Keyword Extraction

Keywords are extracted from article titles by:
1. Converting to lowercase
2. Removing punctuation
3. Filtering out common words (stop words)
4. Keeping words longer than 3 characters
5. Selecting up to 12 unique keywords

## Example

For a week with articles about "AI automation in retail", "Luxury brand digital transformation", and "Jewellery e-commerce trends", the prompt might include:

- Topics: AI & Strategy, Ecommerce & Retail Tech, Luxury & Consumer, Jewellery Industry
- Keywords: automation, retail, luxury, digital, transformation, jewellery, ecommerce, trends, technology, commerce, brands, intelligence

## API Configuration

- **Model**: DALL-E 3
- **Size**: 1024x1024
- **Quality**: Standard
- **Format**: PNG
- **Output**: `public/weekly-images/{weekLabel}.png`

## Idempotency

The image generation is idempotent:
- If `public/weekly-images/{weekLabel}.png` already exists, generation is skipped
- Use `--regenCover` flag to force regeneration
- This prevents unnecessary API calls and costs

