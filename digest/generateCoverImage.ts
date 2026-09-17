import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import { generateCoverScenePrompt, type ArticleInput, type Variant } from './sceneDirector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Article = {
  title: string;
  source?: string;
  snippet?: string;
  aiSummary?: string;
  rerankWhy?: string;
  sponsored?: boolean;
};

/**
 * Homepage top articles - the authoritative source for cover image generation.
 * These are the exact articles displayed on the homepage (top 1-2 from Ecommerce & Retail Tech and Jewellery Industry).
 * The cover image MUST be generated exclusively from these articles to maintain user trust and relevance.
 */
type HomepageTopArticles = Article[];

/**
 * Extract keywords from article titles (for backward compatibility)
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
 * Generate a cover image using OpenAI GPT Image
 */
export async function generateCoverImage(
  prompt: string,
  outputPath: string,
  apiKey: string
): Promise<{ success: boolean; size?: string; model?: string }> {
  try {
    const openai = new OpenAI({ apiKey });
    
    console.log('Generating cover image with gpt-image-1...');

    const model = 'gpt-image-1';

    // gpt-image-1 supports 1024x1024 and 1536x1024 (wide format for cover)
    let size: "1024x1024" | "1536x1024" = '1536x1024';
    let response;
    
    try {
      response = await openai.images.generate({
        model: model,
        prompt: prompt,
        n: 1,
        size: size,
        quality: 'high',
      });
    } catch (sizeError: any) {
      // If size not supported, try fallback
      if (sizeError.message?.includes('size') || sizeError.message?.includes('dimension') || sizeError.message?.includes('Invalid value')) {
        console.warn(`Size ${size} not supported, falling back to 1024x1024`);
        size = '1024x1024';
        response = await openai.images.generate({
          model: model,
          prompt: prompt,
          n: 1,
          size: size,
          quality: 'high',
        });
      } else {
        throw sizeError;
      }
    }
    
    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from GPT Image');
    }
    
    const imageData = response.data[0];
    let buffer: Buffer;
    
    // Handle both URL and base64 responses
    if (imageData.url) {
      // Download image from URL
      const imageResponse = await fetch(imageData.url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from URL: ${imageResponse.statusText}`);
      }
      buffer = Buffer.from(await imageResponse.arrayBuffer());
    } else if (imageData.b64_json) {
      // Decode base64 to buffer
      buffer = Buffer.from(imageData.b64_json, 'base64');
    } else {
      throw new Error('No image data (URL or base64) returned from GPT Image');
    }
    
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
    
    console.log(`✓ Cover image saved to: ${outputPath} (${fileSizeKB.toFixed(1)}KB, size: ${size})`);
    return { success: true, size, model };
  } catch (error) {
    console.error('Error generating cover image:', error);
    return { success: false };
  }
}

/**
 * Harden prompt with ultra-photorealism enforcement and anti-text guarantees
 */
function hardenPromptForPhotorealism(prompt: string): string {
  return `Candid documentary photograph, shot on a real camera: ${prompt}

This must look like a genuine photograph taken by a person for a magazine — NOT AI-generated, not CGI, not a 3D render. Natural available light with real shadows and true reflections. Real materials with real texture: dust, wear, fingerprints, slight clutter, small imperfections and natural asymmetry. Slightly imperfect, candid framing. Avoid the AI look — no waxy/plastic surfaces, no over-smoothing, no over-saturation or HDR glow, no glossy studio perfection. Fill the entire frame edge to edge — no black bars, no empty edges.

Do not include: any people or human body parts; any text, labels, signage, screens, UI, or logos; diamonds or gemstones; CGI lighting, dramatic spotlights, or blurred vignette backgrounds.`;
}

/**
 * Integrate negative prompt constraints into the main prompt
 * (GPT Image doesn't support separate negative prompts, so we include them in the main prompt)
 */
export function integrateNegativePrompt(mainPrompt: string, negativePrompts: string[]): string {
  if (negativePrompts.length === 0) {
    return hardenPromptForPhotorealism(mainPrompt);
  }

  const negativeText = negativePrompts.join(', ');
  const withNegative = `${mainPrompt}

CRITICAL CONSTRAINTS (must be strictly avoided):
- ${negativeText}`;

  return hardenPromptForPhotorealism(withNegative);
}

/**
 * Persist scene director output to cover-scene.json
 */
async function persistSceneOutput(weekLabel: string, sceneOutput: any): Promise<void> {
  try {
    const sceneDir = path.join(__dirname, '../data/weeks', weekLabel);
    await fs.mkdir(sceneDir, { recursive: true });
    const scenePath = path.join(sceneDir, 'cover-scene.json');
    await fs.writeFile(scenePath, JSON.stringify(sceneOutput, null, 2), 'utf-8');
    console.log(`✓ Scene director output saved to: ${scenePath}`);
  } catch (error) {
    console.warn(`⚠ Failed to save scene output: ${(error as Error).message}`);
  }
}

/**
 * Generate cover image for a weekly digest using 2-step pipeline:
 * 1. Scene Director (LLM) generates final image prompt
 * 2. GPT Image renders the image
 * 
 * @param weekLabel - Week label (e.g., "2026-W01")
 * @param homepageTopArticles - Top 1-2 articles from Ecommerce & Retail Tech and Jewellery Industry (the exact articles shown on homepage)
 * @param regenCover - Force regeneration even if image exists
 * @param coverStyle - Deprecated, always uses realistic now
 * @param variant - 'safe' for conservative, 'fun' for more creative (default: 'safe')
 * @returns Success status, image path, and keywords
 */
export async function generateWeeklyCoverImage(
  weekLabel: string,
  homepageTopArticles: HomepageTopArticles,
  regenCover: boolean = false,
  coverStyle: 'realistic' | 'illustration' = 'realistic', // Deprecated, always uses realistic now
  variant: Variant = 'safe'
): Promise<{ success: boolean; imagePath?: string; keywords: string[]; prompt?: string }> {
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
        
        // Extract keywords for return (from homepage articles only)
        const titles = homepageTopArticles.map(a => a.title);
        const keywords = extractKeywords(titles);
        
        return { success: true, imagePath: `/weekly-images/${weekLabel}.png`, keywords };
      } else {
        console.log(`Existing cover image too small (${fileSizeKB.toFixed(1)}KB), regenerating...`);
      }
    } catch {
      // File doesn't exist, proceed with generation
    }
  }
  
  // Step 1: Scene Director generates the final image prompt
  console.log(`[Cover Generation] Step 1: Scene Director generating prompt (variant: ${variant})...`);
  
  const articleInputs: ArticleInput[] = homepageTopArticles.map(article => ({
    title: article.title,
    source: article.source,
    snippet: article.snippet,
    aiSummary: article.aiSummary,
    rerankWhy: article.rerankWhy,
    sponsored: article.sponsored
  }));
  
  // The Scene Director has its own internal fallback (generateFallbackPrompt) and
  // only throws on empty input, so a thrown error here means there is nothing to
  // render a cover from — fail cleanly rather than fabricating an off-brand image.
  let sceneOutput;
  try {
    sceneOutput = await generateCoverScenePrompt(weekLabel, articleInputs, variant);
  } catch (error) {
    console.error(`[Cover Generation] Scene Director failed: ${(error as Error).message}`);
    return { success: false, keywords: [] };
  }
  
  // Persist scene director output
  await persistSceneOutput(weekLabel, sceneOutput);
  
  // Step 2: Integrate negative prompt into main prompt (GPT Image doesn't support separate negative prompts)
  const finalPrompt = integrateNegativePrompt(sceneOutput.finalImagePrompt, sceneOutput.negativePrompt);
  
  // Safety guard: check if prompt is too abstract
  if (finalPrompt.length < 200) {
    console.warn('Generated prompt seems too short, may be too abstract');
  }
  
  // Get API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not found, skipping cover image generation');
    return { success: false, keywords: [], prompt: finalPrompt };
  }
  
  // Step 3: Generate image with GPT Image
  console.log(`[Cover Generation] Step 2: GPT Image rendering image...`);
  const imageResult = await generateCoverImage(finalPrompt, imagePath, apiKey);
  
  if (imageResult.success) {
    // Persist debugging artifacts to cover-input.json
    const coverInputDir = path.join(__dirname, '../data/weeks', weekLabel);
    await fs.mkdir(coverInputDir, { recursive: true });
    const coverInputPath = path.join(coverInputDir, 'cover-input.json');
    
    // Load existing cover-input.json if it exists, or create new
    let coverInputData: any = {};
    try {
      const existing = await fs.readFile(coverInputPath, 'utf-8');
      coverInputData = JSON.parse(existing);
    } catch {
      // File doesn't exist, start fresh
      coverInputData = {
        weekLabel,
        homepageTopArticles: homepageTopArticles.map(a => ({
          title: a.title,
          source: a.source,
          snippet: a.snippet,
          aiSummary: a.aiSummary,
          rerankWhy: a.rerankWhy,
        })),
      };
    }
    
    // Add debugging artifacts
    coverInputData.model = imageResult.model || 'gpt-image-1';
    coverInputData.finalPrompt = finalPrompt;
    coverInputData.imageSize = imageResult.size || '1792x1024';
    coverInputData.outputPath = `/weekly-images/${weekLabel}.png`;
    coverInputData.generatedAt = new Date().toISOString();
    
    await fs.writeFile(coverInputPath, JSON.stringify(coverInputData, null, 2), 'utf-8');
    
    // Extract keywords for return (from homepage articles only)
    const titles = homepageTopArticles.map(a => a.title);
    const keywords = extractKeywords(titles);
    
    return { success: true, imagePath: `/weekly-images/${weekLabel}.png`, keywords, prompt: finalPrompt };
  } else {
    return { success: false, keywords: [], prompt: finalPrompt };
  }
}

