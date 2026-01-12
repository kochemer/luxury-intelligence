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

type ArticleContext = {
  headline: string; // Short headline (8-10 words, no punctuation)
  whatsHappening: string; // What is actually happening (1 sentence, factual)
  whyItMatters: string; // Why it matters to retail/ecommerce/luxury (1 sentence)
};

type VisualAnchor = {
  type: 'person' | 'place' | 'object';
  description: string;
};

/**
 * Build an image generation prompt from homepage top articles ONLY.
 * These are the exact articles displayed on the homepage (top 1-2 from Ecommerce & Retail Tech and Jewellery Industry).
 * The image MUST be generated exclusively from these articles - no other sources.
 */
function buildImagePrompt(homepageTopArticles: HomepageTopArticles): string {
  // Select articles for image (handles edge cases like incompatible themes)
  const articlesForImage = selectArticlesForImage(homepageTopArticles);
  
  if (articlesForImage.length === 0) {
    throw new Error('No articles available for cover image generation');
  }
  
  // Build article contexts from homepage articles ONLY
  const articleContexts: ArticleContext[] = articlesForImage.map(article => ({
    headline: rewriteHeadline(article.title),
    whatsHappening: extractWhatsHappening(article),
    whyItMatters: extractWhyItMatters(article),
  }));
  
  // Extract visual anchors from homepage articles ONLY
  const allAnchors: VisualAnchor[] = [];
  for (const article of articlesForImage) {
    const anchors = extractVisualAnchors(article);
    allAnchors.push(...anchors);
  }
  
  // Ensure we have at least 2-3 anchors (person, place, object)
  // If missing, add defaults based on article content
  const hasPerson = allAnchors.some(a => a.type === 'person');
  const hasPlace = allAnchors.some(a => a.type === 'place');
  const hasObject = allAnchors.some(a => a.type === 'object');
  
  if (!hasPerson) {
    allAnchors.push({ type: 'person', description: 'professional' });
  }
  if (!hasPlace) {
    allAnchors.push({ type: 'place', description: 'modern retail environment' });
  }
  if (!hasObject) {
    allAnchors.push({ type: 'object', description: 'technology device' });
  }
  
  // Select 2-3 distinct anchors (prefer one of each type)
  const selectedAnchors: VisualAnchor[] = [];
  const usedTypes = new Set<string>();
  const usedDescriptions = new Set<string>();
  
  // First pass: get one of each type
  for (const anchor of allAnchors) {
    if (!usedTypes.has(anchor.type) && selectedAnchors.length < 3 && !usedDescriptions.has(anchor.description)) {
      selectedAnchors.push(anchor);
      usedTypes.add(anchor.type);
      usedDescriptions.add(anchor.description);
    }
  }
  
  // Second pass: fill remaining slots (up to 3 total)
  for (const anchor of allAnchors) {
    if (selectedAnchors.length < 3 && !usedDescriptions.has(anchor.description)) {
      selectedAnchors.push(anchor);
      usedDescriptions.add(anchor.description);
    }
  }
  
  // Ensure we have at least 2 anchors
  if (selectedAnchors.length < 2) {
    // Add defaults if needed
    if (!hasPerson) {
      selectedAnchors.push({ type: 'person', description: 'professional' });
    }
    if (!hasPlace) {
      selectedAnchors.push({ type: 'place', description: 'modern retail environment' });
    }
  }
  
  // Build visual anchor string
  const visualAnchors = selectedAnchors.map(a => a.description).join(', ');
  
  // Build narrative intent
  let narrativeIntent = '';
  for (let i = 0; i < articleContexts.length; i++) {
    const ctx = articleContexts[i];
    narrativeIntent += `- ${ctx.whatsHappening} ${ctx.whyItMatters}\n`;
  }
  
  // Build article list for prompt (explicitly show which articles are used)
  const articleList = articlesForImage.map((article, idx) => 
    `Article ${idx + 1}: ${article.title}`
  ).join('\n');

  // Build the prompt
  const prompt = `Create a hyper-realistic editorial photograph for a premium business and retail intelligence publication.

CRITICAL: This image must visually represent ONLY the following articles, which are the top stories shown on the homepage. Do not introduce themes, scenes, or ideas not directly grounded in them.

Articles to represent:
${articleList}

Scene:
A believable, real-world situation inspired by these articles, captured mid-moment.
The scene should feel candid, slightly imperfect, and human — not staged for marketing.
Visually combine the following elements naturally:
${visualAnchors}

Narrative:
The image should subtly reflect the article themes through action and context, not symbols.
Humor or interest should come from:
- human behavior
- contrast (e.g. luxury vs operational reality)
- an unexpected but realistic moment

Examples of acceptable humor:
- mild irony
- visual tension
- a 'caught in the act' feeling
Not jokes, not caricature.

Photography style:
- Shot on a high-end DSLR or medium-format camera
- Natural or practical lighting (window light, store lighting)
- Realistic skin texture, fabric texture, reflections, imperfections
- Shallow depth of field where appropriate
- Editorial realism (Financial Times / WSJ Magazine / Vogue Business)

Composition:
- Wide, horizontally expansive banner format (target 3:1 or wider aspect ratio)
- Vertically minimal height - all important visual elements must be placed in the central horizontal band
- Safe margins at top and bottom - no critical content near vertical edges
- One clear focal subject in the central horizontal band
- Secondary elements add context but do not compete
- Clean background, no clutter
- Looks like a real photo taken in a real location
- Composition must work when displayed in a wide, shallow container
- Avoid vertical stacking, tall elements, or content that extends to top/bottom edges

Tone:
- Intelligent
- Modern
- Slightly playful, but understated
- Never flashy or futuristic

ABSOLUTE PROHIBITIONS:
- NO screens, dashboards, UI, holograms, floating icons, symbols, charts, or interface elements
- NO text of any kind (including signs, labels, price tags, screens, books, posters)
- NO futuristic or sci-fi visual language
- NO glossy CGI look
- NO exaggerated lighting or surreal depth
- NO abstract graphics
- NO UI overlays
- NO glowing elements
- NO collage or composite look
- NO logos, no brand marks, no watermarks

If an element could reasonably contain text in real life (screen, sign, paper), it MUST be:
- out of frame, or
- fully blurred, or
- turned away from the camera

The final image should look like:
'A real photograph that could only be explained by reading the articles — not designed to explain them.'

Prioritize realism over visual cleverness. If unsure, choose a simpler, more realistic scene.`;

  return prompt;
}

/**
 * Rewrite headline to be short (8-10 words, no punctuation)
 */
function rewriteHeadline(title: string): string {
  // Remove punctuation
  let cleaned = title.replace(/[.,!?:;'"()\[\]{}]/g, '');
  // Split into words
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  // Take first 10 words max
  const shortWords = words.slice(0, 10);
  return shortWords.join(' ');
}

/**
 * Extract what's happening from article (1 sentence, factual)
 */
function extractWhatsHappening(article: Article): string {
  // Prefer aiSummary, then snippet, then derive from title
  if (article.aiSummary) {
    // Extract first sentence from summary
    const firstSentence = article.aiSummary.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 20 && firstSentence.length < 200) {
      return firstSentence;
    }
  }
  if (article.snippet) {
    const firstSentence = article.snippet.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 20 && firstSentence.length < 200) {
      return firstSentence;
    }
  }
  // Fallback: derive from title
  return `${article.title.replace(/[.!?]/g, '')}.`;
}

/**
 * Extract why it matters (1 sentence)
 */
function extractWhyItMatters(article: Article): string {
  // Use rerankWhy if available, otherwise derive from context
  if (article.rerankWhy) {
    // Convert to full sentence if needed
    let why = article.rerankWhy.trim();
    if (!why.endsWith('.') && !why.endsWith('!') && !why.endsWith('?')) {
      why += '.';
    }
    // Ensure it mentions retail/ecommerce/luxury context
    const lowerWhy = why.toLowerCase();
    if (lowerWhy.includes('retail') || lowerWhy.includes('commerce') || lowerWhy.includes('luxury') || 
        lowerWhy.includes('ecommerce') || lowerWhy.includes('shopping') || lowerWhy.includes('customer')) {
      return why;
    }
    // Add context if missing
    return `${why} This impacts retail and ecommerce operations.`;
  }
  // Fallback
  return `This development affects retail and ecommerce strategies.`;
}

/**
 * Extract visual anchors (people, places, objects) from article context
 */
function extractVisualAnchors(article: Article): VisualAnchor[] {
  const anchors: VisualAnchor[] = [];
  const text = `${article.title} ${article.snippet || ''} ${article.aiSummary || ''}`.toLowerCase();
  
  // People
  const peopleMarkers = [
    { term: 'shopper', anchor: 'shopper' },
    { term: 'customer', anchor: 'customer' },
    { term: 'retailer', anchor: 'retail manager' },
    { term: 'merchant', anchor: 'merchant' },
    { term: 'analyst', anchor: 'data analyst' },
    { term: 'executive', anchor: 'executive' },
    { term: 'manager', anchor: 'store manager' },
    { term: 'designer', anchor: 'designer' },
    { term: 'buyer', anchor: 'buyer' },
  ];
  
  for (const marker of peopleMarkers) {
    if (text.includes(marker.term)) {
      anchors.push({ type: 'person', description: marker.anchor });
      break; // Take first match
    }
  }
  
  // Places
  const placeMarkers = [
    { term: 'store', anchor: 'luxury retail store' },
    { term: 'warehouse', anchor: 'warehouse' },
    { term: 'showroom', anchor: 'showroom' },
    { term: 'studio', anchor: 'design studio' },
    { term: 'office', anchor: 'modern office' },
    { term: 'boardroom', anchor: 'boardroom' },
    { term: 'boutique', anchor: 'boutique' },
    { term: 'mall', anchor: 'shopping mall' },
  ];
  
  for (const marker of placeMarkers) {
    if (text.includes(marker.term)) {
      anchors.push({ type: 'place', description: marker.anchor });
      break;
    }
  }
  
  // Objects
  const objectMarkers = [
    { term: 'laptop', anchor: 'laptop' },
    { term: 'computer', anchor: 'computer' },
    { term: 'phone', anchor: 'smartphone' },
    { term: 'jewelry', anchor: 'jewelry display' },
    { term: 'jewellery', anchor: 'jewelry display' },
    { term: 'watch', anchor: 'luxury watch' },
    { term: 'robot', anchor: 'robot arm' },
    { term: 'display', anchor: 'product display' },
    { term: 'mirror', anchor: 'mirror' },
    { term: 'price tag', anchor: 'price tag' },
    { term: 'tag', anchor: 'price tag' },
    { term: 'screen', anchor: 'digital screen' },
    { term: 'tablet', anchor: 'tablet' },
  ];
  
  for (const marker of objectMarkers) {
    if (text.includes(marker.term)) {
      anchors.push({ type: 'object', description: marker.anchor });
      break;
    }
  }
  
  return anchors;
}

/**
 * Select articles for image generation from homepage top articles.
 * Uses only the provided articles (already selected and ranked for homepage display).
 * If articles are thematically incompatible, picks the single strongest article.
 */
function selectArticlesForImage(homepageTopArticles: HomepageTopArticles): Article[] {
  if (homepageTopArticles.length === 0) {
    throw new Error('No homepage articles provided for cover image generation');
  }
  
  // If only 1 article, use it
  if (homepageTopArticles.length === 1) {
    return homepageTopArticles;
  }
  
  // If 2 articles, use both
  if (homepageTopArticles.length === 2) {
    return homepageTopArticles;
  }
  
  // If 3+ articles, use first 2 (they are already ranked)
  return homepageTopArticles.slice(0, 2);
}

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
async function generateCoverImage(
  prompt: string,
  outputPath: string,
  apiKey: string
): Promise<{ success: boolean; size?: string; model?: string }> {
  try {
    const openai = new OpenAI({ apiKey });
    
    console.log('Generating cover image with GPT Image...');
    
    // GPT Image model name
    const model = 'gpt-image-1.5';
    
    // Try 1536x1024 first (wide format for cover), fallback to 1024x1024 if not supported
    let size: "1536x1024" | "1024x1024" = '1536x1024';
    let response;
    
    try {
      response = await openai.images.generate({
        model: model,
        prompt: prompt,
        n: 1,
        size: size,
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

/**
 * Add banner composition constraints to ensure wide, shallow hero image format
 */
function addBannerCompositionConstraints(prompt: string): string {
  const hardened = hardenPromptForPhotorealism(prompt);
  return `${hardened}

COMPOSITION FOR WIDE HERO BANNER (CRITICAL):
- Wide, horizontally expansive banner format (target 3:1 or wider aspect ratio)
- Vertically minimal height - all important visual elements must be placed in the central horizontal band
- Safe margins at top and bottom - no critical content near vertical edges
- Composition must work when displayed in a wide, shallow container
- Avoid vertical stacking, tall elements, or content that extends to top/bottom edges`;
}

/**
 * Integrate negative prompt constraints into the main prompt
 * (GPT Image doesn't support separate negative prompts, so we include them in the main prompt)
 */
function integrateNegativePrompt(mainPrompt: string, negativePrompts: string[]): string {
  if (negativePrompts.length === 0) {
    return addBannerCompositionConstraints(mainPrompt);
  }
  
  const negativeText = negativePrompts.join(', ');
  const withNegative = `${mainPrompt}

CRITICAL CONSTRAINTS (must be strictly avoided):
- ${negativeText}`;
  
  return addBannerCompositionConstraints(withNegative);
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
  
  let sceneOutput;
  try {
    sceneOutput = await generateCoverScenePrompt(weekLabel, articleInputs, variant);
  } catch (error) {
    console.error(`[Cover Generation] Scene Director failed: ${(error as Error).message}`);
    // Fallback to old prompt builder
    console.log('[Cover Generation] Falling back to legacy prompt builder...');
    const fallbackPrompt = buildImagePrompt(homepageTopArticles);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('OPENAI_API_KEY not found, skipping cover image generation');
      return { success: false, keywords: [], prompt: fallbackPrompt };
    }
    const fallbackResult = await generateCoverImage(fallbackPrompt, imagePath, apiKey);
    const titles = homepageTopArticles.map(a => a.title);
    const keywords = extractKeywords(titles);
    return { success: fallbackResult.success, imagePath: fallbackResult.success ? `/weekly-images/${weekLabel}.png` : undefined, keywords, prompt: fallbackPrompt };
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
    coverInputData.model = imageResult.model || 'gpt-image-1.5';
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

