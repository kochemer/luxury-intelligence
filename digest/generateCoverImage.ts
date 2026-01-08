import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Article = {
  title: string;
  source?: string;
};

type CategoryData = {
  name: string;
  articles: Article[];
};

/**
 * Build an image generation prompt from the week's top articles
 */
function buildImagePrompt(categories: CategoryData[], style: 'realistic' | 'illustration' = 'realistic'): string {
  // Collect up to 3 top titles per category (max 12 total)
  const allTitles: string[] = [];
  const categoryNames: string[] = [];
  
  for (const category of categories) {
    categoryNames.push(category.name);
    const topTitles = category.articles.slice(0, 3).map(a => a.title);
    allTitles.push(...topTitles);
  }
  
  // Limit to 12 titles total
  const selectedTitles = allTitles.slice(0, 12);
  
  // Extract key themes and keywords from titles
  const keywords = extractKeywords(selectedTitles);
  
  // Build style-specific prompt
  if (style === 'realistic') {
    const prompt = `Create a photorealistic editorial magazine cover art that visually represents the themes of this week's curated intelligence digest.

Topics covered: ${categoryNames.join(', ')}

Key themes from this week's articles: ${keywords.join(', ')}

Style: Photoreal editorial magazine cover art, premium fashion-mag aesthetic, realistic studio lighting, realistic materials and textures, crisp micro-detail, subtle film grain, natural color grading, shallow depth of field, professional photography look. No text, no typography, no logos, no watermarks, no brand marks, no collage cutouts, no cartoon styling.

Composition: one central motif with subtle secondary elements. Color palette: restrained, premium, sophisticated (not neon). Visual metaphor that captures the intersection of technology, commerce, and luxury. The image should feel like a premium photorealistic magazine cover from a high-end publication focused on business intelligence, technology trends, and luxury markets.`;

    return prompt;
  } else {
    // Illustration style (fallback)
    const prompt = `Create an editorial magazine cover illustration that visually represents the themes of this week's curated intelligence digest.

Topics covered: ${categoryNames.join(', ')}

Key themes from this week's articles: ${keywords.join(', ')}

Style requirements:
- Clean, premium, modern editorial magazine cover aesthetic
- No logos, no brand names, no text on the image
- Abstract but thematically linked to the week's topics
- Color palette: restrained, high-end (not neon), sophisticated
- Composition: one central motif with subtle secondary elements
- Professional, elegant, suitable for a luxury intelligence publication
- Visual metaphor that captures the intersection of technology, commerce, and luxury

The illustration should feel like a premium magazine cover that would appear in a high-end publication focused on business intelligence, technology trends, and luxury markets.`;

    return prompt;
  }
}

/**
 * Extract keywords from article titles
 */
function extractKeywords(titles: string[]): string[] {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'from', 'as', 'it', 'its', 'we', 'you', 'they', 'he', 'she', 'what',
    'how', 'why', 'when', 'where', 'who', 'which', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'each', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now'
  ]);
  
  const keywords = new Set<string>();
  
  for (const title of titles) {
    const words = title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !commonWords.has(w));
    
    words.forEach(w => keywords.add(w));
  }
  
  // Return top 12 unique keywords
  return Array.from(keywords).slice(0, 12);
}

/**
 * Generate a cover image using OpenAI DALL-E
 */
async function generateCoverImage(
  prompt: string,
  outputPath: string,
  apiKey: string
): Promise<boolean> {
  try {
    const openai = new OpenAI({ apiKey });
    
    console.log('Generating cover image with DALL-E...');
    
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1792x1024', // Wider format, better for magazine covers
      quality: 'hd', // Highest quality available
      response_format: 'url',
    });
    
    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from DALL-E');
    }
    
    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned from DALL-E');
    }
    
    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    
    // Sanity check: if file is too small (< 50KB), treat as failure
    const fileSizeKB = buffer.length / 1024;
    if (fileSizeKB < 50) {
      throw new Error(`Generated image file too small (${fileSizeKB.toFixed(1)}KB), likely an error. Minimum expected: 50KB`);
    }
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    // Write PNG file
    await fs.writeFile(outputPath, buffer);
    
    console.log(`✓ Cover image saved to: ${outputPath} (${fileSizeKB.toFixed(1)}KB)`);
    return true;
  } catch (error) {
    console.error('Error generating cover image:', error);
    return false;
  }
}

/**
 * Generate cover image for a weekly digest
 */
export async function generateWeeklyCoverImage(
  weekLabel: string,
  categories: CategoryData[],
  regenCover: boolean = false,
  coverStyle: 'realistic' | 'illustration' = 'realistic'
): Promise<{ success: boolean; imagePath?: string; keywords: string[] }> {
  const imagePath = path.join(__dirname, '../public/weekly-images', `${weekLabel}.png`);
  
  // Check if image already exists (idempotency)
  if (!regenCover) {
    try {
      await fs.access(imagePath);
      // Also check file size as sanity check
      const stats = await fs.stat(imagePath);
      const fileSizeKB = stats.size / 1024;
      if (fileSizeKB >= 50) {
        console.log(`Cover image already exists: ${imagePath} (${fileSizeKB.toFixed(1)}KB, skipping generation)`);
        
        // Extract keywords for return
        const allTitles: string[] = [];
        for (const category of categories) {
          allTitles.push(...category.articles.slice(0, 3).map(a => a.title));
        }
        const keywords = extractKeywords(allTitles.slice(0, 12));
        
        return { success: true, imagePath: `/weekly-images/${weekLabel}.png`, keywords };
      } else {
        console.log(`Existing cover image too small (${fileSizeKB.toFixed(1)}KB), regenerating...`);
      }
    } catch {
      // File doesn't exist, proceed with generation
    }
  }
  
  // Build prompt with style
  const prompt = buildImagePrompt(categories, coverStyle);
  
  // Get API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not found, skipping cover image generation');
    return { success: false, keywords: [] };
  }
  
  // Generate image
  const success = await generateCoverImage(prompt, imagePath, apiKey);
  
  if (success) {
    // Extract keywords for return
    const allTitles: string[] = [];
    for (const category of categories) {
      allTitles.push(...category.articles.slice(0, 3).map(a => a.title));
    }
    const keywords = extractKeywords(allTitles.slice(0, 12));
    
    return { success: true, imagePath: `/weekly-images/${weekLabel}.png`, keywords };
  } else {
    return { success: false, keywords: [] };
  }
}

