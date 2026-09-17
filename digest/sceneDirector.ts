/**
 * Scene Director: LLM-based cover image prompt generation
 * Generates a final DALL-E prompt from prioritized articles using a 2-step pipeline.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';

import { readJsonCache, writeJsonCache } from '../lib/utils/cachePaths';
import { getModelFor, maxTokensParam, temperatureParam } from '../lib/llm/models';

// Anti-repetition tracking
type PreviousConcept = {
  weekLabel: string;
  concept: string;
  primaryHumorDriver: string;
  sceneDescription: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---

const SCENE_DIRECTOR_VERSION = 'v4'; // v4: removed the self-contradicting dark-bg/no-people/bokeh block; coherent light-natural direction + 3:2 composition
const SCENE_DIRECTOR_MODEL = process.env.SCENE_DIRECTOR_MODEL || getModelFor('polish');
const TEMPERATURE = 0.7; // Some creativity for scene generation
const MAX_TOKENS = 2000;
const CACHE_KIND = 'scene_director';
const CONFIDENCE_THRESHOLD = 0.55; // Fallback if confidence below this

// --- Types ---

export type ArticleInput = {
  title: string;
  source?: string;
  snippet?: string;
  aiSummary?: string;
  rerankWhy?: string;
  sponsored?: boolean;
};

export type SceneDirectorOutput = {
  concept: string; // Short concept title
  primaryHumorDriver: string; // One of: "role reversal", "scale absurdity", "literal metaphor", "fish-out-of-water", "visual punchline"
  secondaryEnhancer?: string; // Optional flavor enhancer
  sceneDescription: string; // Vivid, concrete description of the scene
  finalImagePrompt: string; // Complete prompt ready for image generation
  negativePrompt: string[];
  confidence: number;
};

type CacheEntry = {
  output: SceneDirectorOutput;
  version: string;
  cached_at: string;
  variant: 'safe' | 'fun';
};

type SceneDirectorCache = {
  [cacheKey: string]: CacheEntry;
};

export type Variant = 'safe' | 'fun';

// --- Previous Concepts Tracking (avoid repetition) ---

/**
 * Load previous cover concepts from the last N weeks to avoid repetition.
 * Looks for cover-scene.json files in data/weeks/{weekLabel}/
 */
async function loadPreviousConcepts(currentWeekLabel: string, lookbackWeeks: number = 8): Promise<PreviousConcept[]> {
  try {
    const weeksDir = path.join(process.cwd(), 'data', 'weeks');
    const entries = await fs.readdir(weeksDir, { withFileTypes: true });

    const previousConcepts: PreviousConcept[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== currentWeekLabel) {
        const coverScenePath = path.join(weeksDir, entry.name, 'cover-scene.json');
        try {
          const content = await fs.readFile(coverScenePath, 'utf-8');
          const scene = JSON.parse(content);
          previousConcepts.push({
            weekLabel: entry.name,
            concept: scene.concept || '',
            primaryHumorDriver: scene.primaryHumorDriver || '',
            sceneDescription: scene.sceneDescription || ''
          });
        } catch {
          // File doesn't exist or is invalid, skip
        }
      }
    }

    // Sort by week label (descending) and take the most recent N
    previousConcepts.sort((a, b) => b.weekLabel.localeCompare(a.weekLabel));
    return previousConcepts.slice(0, lookbackWeeks);
  } catch {
    // Directory doesn't exist yet, return empty list
    return [];
  }
}

// --- Cache Management (uses unified cache paths) ---

async function loadCache(): Promise<SceneDirectorCache> {
  const cache = await readJsonCache<SceneDirectorCache>(CACHE_KIND);
  return cache || {};
}

async function saveCache(cache: SceneDirectorCache): Promise<void> {
  try {
    await writeJsonCache(CACHE_KIND, cache);
  } catch (err: any) {
    console.warn(`[SceneDirector] Failed to save cache: ${err.message}`);
  }
}

function getCacheKey(weekLabel: string, articles: ArticleInput[], variant: Variant): string {
  // Create deterministic cache key from week + article titles + variant
  const articleTitles = articles.map(a => a.title).sort().join('|');
  const input = `${weekLabel}|${articleTitles}|${variant}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// --- Fallback Template (for low confidence) ---

function generateFallbackPrompt(articles: ArticleInput[]): SceneDirectorOutput {
  const titles = articles.map(a => a.title).join(', ');
  
  return {
    concept: 'editorial-retail-scene',
    primaryHumorDriver: 'visual punchline',
    secondaryEnhancer: 'unexpected texture/material combination',
    sceneDescription: `A hyper-realistic editorial photograph of a modern retail environment inspired by the week's articles. The scene captures a playful visual metaphor where retail objects are arranged in an unexpected but believable way, creating a subtle visual joke that makes the viewer pause and smile. Natural lighting, realistic textures, and candid composition.`,
    finalImagePrompt: `Create a hyper-realistic editorial photograph for a weekly intelligence digest.

CRITICAL: This image must visually represent ONLY the following articles: ${titles}

Scene:
A playful, slightly absurd visual metaphor inspired by these articles. The scene should be believable but create a visual joke that makes the viewer pause and smile. Prefer object-driven scenes over people-driven scenes.

Photography style:
- Shot on a high-end DSLR or medium-format camera
- Natural or practical lighting (window light, store lighting)
- Realistic textures, materials, reflections, imperfections
- Shallow depth of field where appropriate
- Editorial realism with a playful, humorous tone

Composition:
- Wide landscape format (3:2, the format the image is rendered at)
- Keep the focal subject in the central horizontal band so it survives a crop to a shallow hero banner
- Safe margins at top and bottom - no critical content near the top or bottom edges
- One clear focal subject; secondary elements add context but do not compete
- Clean background, no clutter
- Looks like a real photo taken in a real location
- Avoid tall vertical stacking or content that extends to the top/bottom edges

ABSOLUTE PROHIBITIONS:
- NO screens, dashboards, UI, holograms, floating icons, symbols, charts, or interface elements
- NO text of any kind (including signs, labels, price tags, screens, books, posters)
- NO futuristic or sci-fi visual language
- NO glossy CGI look, no cartoon, no illustration
- NO logos, no brand marks, no watermarks

If an element could reasonably contain text in real life (screen, sign, paper), it MUST be out of frame, fully blurred, or turned away from the camera.

The scene should be playful and absurd but look like a real photograph.`,
    negativePrompt: [
      'text, letters, numbers, signage, labels',
      'screens, UI, dashboards, holograms, floating icons',
      'logos, brands, watermarks',
      'cartoon, illustration, CGI, 3D render, anime'
    ],
    confidence: 0.5
  };
}

// --- LLM Scene Generation ---

function buildSceneDirectorPrompt(
  articles: ArticleInput[],
  variant: Variant,
  previousConcepts: PreviousConcept[] = []
): string {
  const articleList = articles.map((article, idx) => {
    let articleText = `Article ${idx + 1}:
- Title: ${article.title}
- Source: ${article.source || 'Unknown'}
- Summary: ${article.aiSummary || article.snippet || 'No summary available'}
- Why it matters: ${article.rerankWhy || 'Not specified'}`;

    if (article.sponsored) {
      articleText += '\n- Sponsored: Yes';
    }

    return articleText;
  }).join('\n\n');

  // Build anti-repetition constraints
  let antiRepetitionConstraint = '';
  if (previousConcepts.length > 0) {
    const recentConcepts = previousConcepts.map(c => `- ${c.weekLabel}: "${c.concept}" (${c.primaryHumorDriver})`).join('\n');
    antiRepetitionConstraint = `
AVOID REPETITION (Recent covers):
${recentConcepts}

DO NOT reuse these concepts or humor drivers. Create a fresh object pairing.

HARD BAN - NO DIAMONDS (any size, any context):
- DO NOT feature diamonds, gemstones, or precious stones as focal objects
- For Jewellery Industry: use OTHER luxury objects (gold watches, rings, coins) instead
- Create value commentary through object pairing (luxury item next to everyday object)`;
  } else {
    antiRepetitionConstraint = `
HARD BAN - NO DIAMONDS (any size, any context):
- DO NOT feature diamonds, gemstones, or precious stones as focal objects
- For Jewellery Industry: use OTHER luxury objects (gold watches, rings, coins) instead
- Create value commentary through object pairing (luxury item next to everyday object)

ANTI-CLICHE GUIDE (PRODUCT PHOTOGRAPHY STYLE):
- Mix a luxury object with everyday items: watch + apple, ring + bread, gold coin + orange
- The joke is the juxtaposition of value and utility
- Example: "gold watch next to a banana" (role reversal, tabletop)
- Or: "gold coins scattered among kitchen vegetables" (scale absurdity, mundane context)
- Keep it pure product photography—no narrative, just smart object selection`;
  }

  const companyNames = articles
    .map(a => a.source?.replace(/\s*-\s*.*$/, '').trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');

  return `You are a Scene Director for a weekly intelligence digest.

Your job is to create a SINGLE photorealistic scene that acts as a playful, slightly absurd visual metaphor for the week's most important articles.

STYLE & TONE
- Hyper-realistic: must look like an actual photograph, not an AI image
- Think: stock photo from Getty or Shutterstock — something a human photographer could have shot
- Mundane, naturally-lit setting — supermarket shelf, wooden table, shop counter, checkout belt
- Avoid dark surfaces, black backdrops, velvet — these cause CGI-looking dramatic lighting
- Lively and slightly absurd through the combination of objects — not through visual effects

MANDATORY RULES
- NO text, logos, signs, UI, screens, or readable symbols
- NO illustration, CGI, or cartoon style
- Photorealistic lighting, textures, materials, reflections
- Wide banner composition (elements in central horizontal band)
- ONE coherent scene (no collage, no multi-scene)

CREATIVE GUIDANCE
- Objects should carry the visual joke — people are optional and secondary
- Humor comes from unexpected object combinations or situations
- People in the background are fine; avoid scenes where people are just standing around talking
- Objects should be recognizable, real, and touchable-looking
- Recency is irrelevant - focus on the conceptual essence

BORINGNESS BREAKER (REQUIRED - OBJECT-BASED HUMOR)
You MUST select at least ONE Primary Humor Driver (expressed through OBJECT COMBINATION):
1. "role reversal" - Luxury item in mundane context (e.g., diamond ring next to bread, gold watch next to apples)
2. "scale absurdity" - Objects of mismatched value next to each other (e.g., tiny coin next to giant jewelry)
3. "literal metaphor" - Objects that embody a concept (e.g., objects representing "supply," "demand," "value")
4. "fish-out-of-water" - Unexpected object pairing (e.g., kitchen counter items mixed with luxury goods)
5. "visual punchline" - Object arrangement reveals a wit (e.g., common + rare = commentary on value)

Optionally add one Flavor Enhancer:
- Unexpected texture/material combination
- Anachronistic element (old tech with new, vice versa)
- Mirror/reflection reveal
- Partial obstruction creating mystery
- Implied motion or "just happened" moment

SUBTLE BRAND LOGOS (ENCOURAGED):
Include subtle, recognisable logos of the companies mentioned in the articles (${companyNames}) as props within the scene — e.g. on a shopping bag, a box, a tag, a sticker on an object. Keep them small, natural, and incidental. Do NOT make the logo the focal point.
${antiRepetitionConstraint}

ARTICLES TO REPRESENT:
${articleList}

OUTPUT FORMAT (JSON only, no markdown, no code blocks):
{
  "concept": "short concept title (e.g., 'luxury-diamond-scale-absurdity')",
  "primaryHumorDriver": "one of: role reversal, scale absurdity, literal metaphor, fish-out-of-water, visual punchline",
  "secondaryEnhancer": "optional flavor enhancer or null",
  "sceneDescription": "vivid, concrete description of the scene. Be specific about objects, lighting, composition, and the visual joke. Describe what makes it absurd but believable.",
  "finalImagePrompt": "Describe ONLY: what objects are in the scene, where they are placed, and what surface/environment they sit in. Write it as a plain scene description — as if describing a real photograph to someone. Do NOT mention camera settings, f-stops, bokeh, depth of field, lighting rigs, cinematic, or composition rules — those cause CGI output. Keep it under 80 words.",
  "negativePrompt": [
    "text, letters, numbers, signage, labels, price tags",
    "screens, UI, dashboards, holograms, floating icons",
    "watermarks, unrelated brand logos",
    "cartoon, illustration, CGI, 3D render, anime",
    "diamond, diamonds, gemstone, gemstones, precious stones, jewelry close-up, jewelry product shot, diamond ring, diamond necklace, diamond earring, jeweled, sparkling gemstone",
    "dramatic spotlight, glowing edges, rim lighting, vignette, cinematic color grade, blurred background, bokeh"
  ],
  "confidence": 0.0
}

The finalImagePrompt must be complete and ready to send to DALL-E. The scene should be playful and absurd but look like a real photograph.

Set confidence between 0.0 and 1.0 based on how well the articles can be combined into a single coherent, humorous scene.`;
}

async function callSceneDirectorLLM(
  articles: ArticleInput[],
  variant: Variant,
  apiKey: string,
  previousConcepts: PreviousConcept[] = [],
  isRetry: boolean = false
): Promise<SceneDirectorOutput | null> {
  try {
    const openai = new OpenAI({ apiKey });

    let prompt = buildSceneDirectorPrompt(articles, variant, previousConcepts);
    
    // Add retry message if this is a retry
    if (isRetry) {
      prompt = `IMPORTANT: You must select a primaryHumorDriver (one of: role reversal, scale absurdity, literal metaphor, fish-out-of-water, visual punchline). Your previous response was missing or invalid.

${prompt}`;
    }
    
    const response = await openai.chat.completions.create({
      model: SCENE_DIRECTOR_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a Scene Director for a weekly intelligence digest. You create playful, absurd visual metaphors using photorealistic scenes. You output ONLY valid JSON, no markdown, no code blocks, no explanations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      ...temperatureParam(SCENE_DIRECTOR_MODEL, TEMPERATURE),
      ...maxTokensParam(SCENE_DIRECTOR_MODEL, MAX_TOKENS),
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in LLM response');
    }
    
    // Parse JSON (handle potential markdown code blocks)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      // Remove markdown code blocks
      jsonContent = jsonContent.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    }
    
    const parsed = JSON.parse(jsonContent);
    
    // Validate structure
    if (!parsed.finalImagePrompt || typeof parsed.finalImagePrompt !== 'string') {
      throw new Error('Invalid response: missing finalImagePrompt');
    }
    
    if (!parsed.concept || typeof parsed.concept !== 'string') {
      throw new Error('Invalid response: missing concept');
    }
    
    if (!parsed.sceneDescription || typeof parsed.sceneDescription !== 'string') {
      throw new Error('Invalid response: missing sceneDescription');
    }
    
    // Validate Primary Humor Driver (MANDATORY)
    const validHumorDrivers = ['role reversal', 'scale absurdity', 'literal metaphor', 'fish-out-of-water', 'visual punchline'];
    if (!parsed.primaryHumorDriver || typeof parsed.primaryHumorDriver !== 'string' || !validHumorDrivers.includes(parsed.primaryHumorDriver.toLowerCase())) {
      throw new Error(`Invalid response: primaryHumorDriver must be one of: ${validHumorDrivers.join(', ')}`);
    }
    
    // Ensure confidence is a number
    if (typeof parsed.confidence !== 'number') {
      parsed.confidence = 0.5;
    }
    
    // Check if scene description is too generic (confidence penalty)
    const sceneDesc = parsed.sceneDescription?.toLowerCase() || '';
    const isGeneric = sceneDesc.length < 50 || 
      sceneDesc.includes('interesting') || 
      sceneDesc.includes('humorous') ||
      sceneDesc.includes('funny') ||
      !sceneDesc.includes('photograph') && !sceneDesc.includes('scene') && !sceneDesc.includes('image');
    
    if (isGeneric) {
      parsed.confidence = Math.max(0.0, parsed.confidence - 0.15);
      console.warn(`[SceneDirector] Scene description too generic, reducing confidence by 0.15`);
    }
    
    // Ensure negativePrompt is an array
    if (!Array.isArray(parsed.negativePrompt)) {
      parsed.negativePrompt = [
        'text, letters, numbers, signage, labels',
        'screens, UI, dashboards, holograms, floating icons',
        'logos, brands, watermarks',
        'cartoon, illustration, CGI, 3D render, anime'
      ];
    }
    
    return parsed as SceneDirectorOutput;
  } catch (error) {
    const errorMessage = (error as Error).message;
    
    // If missing primaryHumorDriver and not already a retry, retry once
    if ((errorMessage.includes('primaryHumorDriver') || errorMessage.includes('humor')) && !isRetry) {
      console.warn(`[SceneDirector] Missing Primary Humor Driver, retrying once...`);
      return callSceneDirectorLLM(articles, variant, apiKey, [], true);
    }
    
    console.error(`[SceneDirector] LLM call failed: ${errorMessage}`);
    return null;
  }
}

// --- Main Export ---

/**
 * Generate cover scene concept from prioritized articles
 * @param weekLabel - Week label (e.g., "2026-W01")
 * @param articles - Top 1-2 from Ecommerce & Retail Tech and Jewellery Industry
 * @param variant - 'safe' for conservative, 'fun' for more creative
 * @returns Scene director output with finalImagePrompt ready for DALL-E
 */
export async function generateCoverScenePrompt(
  weekLabel: string,
  articles: ArticleInput[],
  variant: Variant = 'safe'
): Promise<SceneDirectorOutput> {
  // Validate input
  if (articles.length === 0) {
    throw new Error('No articles provided for scene generation');
  }
  
  // Limit to top 4 articles (as per spec: top 1-2 from each category + optional 1 supporting)
  const selectedArticles = articles.slice(0, 4);
  
  // Check cache
  const cache = await loadCache();
  const cacheKey = getCacheKey(weekLabel, selectedArticles, variant);
  const cached = cache[cacheKey];
  
  if (cached && cached.version === SCENE_DIRECTOR_VERSION) {
    console.log(`[SceneDirector] Cache hit for ${weekLabel} (variant: ${variant})`);
    return cached.output;
  }
  
  // Get API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[SceneDirector] OPENAI_API_KEY not found, using fallback');
    return generateFallbackPrompt(selectedArticles);
  }

  // Load previous concepts to avoid repetition
  const previousConcepts = await loadPreviousConcepts(weekLabel);
  if (previousConcepts.length > 0) {
    console.log(`[SceneDirector] Found ${previousConcepts.length} previous concepts for anti-repetition guidance`);
  }

  // Call LLM
  console.log(`[SceneDirector] Generating scene for ${weekLabel} (variant: ${variant})...`);
  const result = await callSceneDirectorLLM(selectedArticles, variant, apiKey, previousConcepts);
  
  if (!result) {
    console.warn('[SceneDirector] LLM call failed, using fallback');
    return generateFallbackPrompt(selectedArticles);
  }
  
  // Check confidence threshold
  if (result.confidence < CONFIDENCE_THRESHOLD) {
    console.warn(`[SceneDirector] Low confidence (${result.confidence.toFixed(2)}), using fallback`);
    return generateFallbackPrompt(selectedArticles);
  }
  
  // Cache result
  cache[cacheKey] = {
    output: result,
    version: SCENE_DIRECTOR_VERSION,
    cached_at: new Date().toISOString(),
    variant
  };
  await saveCache(cache);
  
  console.log(`[SceneDirector] Generated scene: ${result.concept} (${result.primaryHumorDriver}, confidence: ${result.confidence.toFixed(2)})`);
  
  return result;
}

