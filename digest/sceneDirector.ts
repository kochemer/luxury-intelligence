/**
 * Scene Director: LLM-based cover image prompt generation
 * Generates a final DALL-E prompt from prioritized articles using a 2-step pipeline.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---

const SCENE_DIRECTOR_VERSION = 'v2'; // Updated to include Boringness Breaker system
const SCENE_DIRECTOR_MODEL = process.env.SCENE_DIRECTOR_MODEL || 'gpt-4o';
const TEMPERATURE = 0.7; // Some creativity for scene generation
const MAX_TOKENS = 2000;
const CACHE_FILE = path.join(__dirname, '../data/scene_director_cache.json');
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
  conceptTitle: string;
  oneSentenceConcept: string;
  visualAnchors: {
    location: string;
    subjects: string[];
    props: string[];
    action: string;
  };
  humorNote: string;
  boringnessBreaker: {
    selected: string[]; // IDs of techniques chosen (e.g., ["A", "E"])
    executionNote: string; // 1 sentence describing how it shows up visually
  };
  finalImagePrompt: string;
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

// --- Cache Management ---

async function loadCache(): Promise<SceneDirectorCache> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {};
    }
    console.warn(`[SceneDirector] Failed to load cache: ${err.message}`);
    return {};
  }
}

async function saveCache(cache: SceneDirectorCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
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
    conceptTitle: 'editorial-retail-scene',
    oneSentenceConcept: `A professional editorial photograph of a modern retail environment inspired by: ${titles}`,
    visualAnchors: {
      location: 'modern retail environment',
      subjects: ['professional'],
      props: ['retail elements'],
      action: 'engaged in retail activity'
    },
    humorNote: 'none',
    boringnessBreaker: {
      selected: ['A'], // Human micro-moment as default
      executionNote: 'subtle human hesitation or micro-expression'
    },
    finalImagePrompt: `Create a hyper-realistic editorial photograph for a premium business and retail intelligence publication.

CRITICAL: This image must visually represent ONLY the following articles: ${titles}

Scene:
A believable, real-world retail situation inspired by these articles, captured mid-moment.
The scene should feel candid, slightly imperfect, and human — not staged for marketing.

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

ABSOLUTE PROHIBITIONS:
- NO screens, dashboards, UI, holograms, floating icons, symbols, charts, or interface elements
- NO text of any kind (including signs, labels, price tags, screens, books, posters)
- NO futuristic or sci-fi visual language
- NO glossy CGI look
- NO logos, no brand marks, no watermarks

If an element could reasonably contain text in real life (screen, sign, paper), it MUST be out of frame, fully blurred, or turned away from the camera.

Prioritize realism over visual cleverness.`,
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

function buildSceneDirectorPrompt(articles: ArticleInput[], variant: Variant): string {
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

  const variantGuidance = variant === 'safe' 
    ? 'Use a conservative, straightforward interpretation. Prioritize guaranteed realism over creative risk.'
    : 'Allow for subtle irony, contrast, or unexpected moments that feel natural and unforced. Balance realism with visual interest.';

  return `You are a Scene Director for a premium business and retail intelligence publication. Your job is to design a single, coherent, hyper-realistic editorial photograph that visually represents the week's top articles.

CRITICAL CONSTRAINTS:
1. You MUST create ONE coherent real-world scene (no collage, no split-screen, no multiple scenes)
2. The scene MUST be photorealistic editorial photography, NOT illustration, cartoon, or CGI
3. You can ONLY use the provided articles as inspiration - do not introduce themes, scenes, or ideas not directly grounded in them
4. The scene must encode novelty via situation/action/contrast, NOT via sci-fi elements, overlays, or abstract graphics
5. NO text-bearing surfaces (signs/screens/newspapers/labels). If unavoidable, specify "fully blurred / out of focus / turned away"
6. Humor must be subtle (irony/contrast), never slapstick or cartoon
7. Recency is irrelevant - focus on the conceptual essence
8. You MUST select at least ONE Boringness Breaker technique and encode it visually via action/framing/environment
9. Do NOT explain the humor in words; it must be visually inferred
10. No text, letters, numbers, signage, labels; no screens/UI/holograms; no logos/watermarks; avoid CGI/cartoon

BORINGNESS BREAKER CATALOGUE (select at least ONE):
A) Human micro-moment:
   - hesitation, raised eyebrow, half-smile, checking something twice, "caught thinking"
B) Mild situational irony:
   - luxury context meets operational reality, high-tech implied but manual workaround visible
C) Visual tension:
   - "about to happen" moment, hand hovering, object mid-air, near-miss alignment
D) Role reversal:
   - senior-looking person doing junior task, back-office role in front-of-house setting
E) Framing tricks (photography craft):
   - foreground obstruction, reflection reveal, over-the-shoulder perspective, off-center crop
F) Environmental storytelling:
   - props suggest recent use (fingerprints, open drawer, slightly moved item), contrast prepared vs in-use
G) Time-pressure cues (non-stressful):
   - calm multitasking, end-of-day/just-opened vibe, implied urgency without chaos
H) Soft contradiction:
   - calm scene with one detail "not quite right" that becomes interesting after 2 seconds
I) Tasteful Easter egg:
   - small recurring/out-of-place object that rewards a second look (no text)

ARTICLES TO REPRESENT:
${articleList}

VARIANT GUIDANCE: ${variantGuidance}

OUTPUT FORMAT (JSON only, no markdown, no code blocks):
{
  "conceptTitle": "short internal label (e.g., 'luxury-retail-contrast')",
  "oneSentenceConcept": "one sentence describing the scene",
  "visualAnchors": {
    "location": "specific real-world location (e.g., 'luxury jewelry boutique in London')",
    "subjects": ["person/people in scene (e.g., 'luxury retail manager', 'affluent customer')"],
    "props": ["key objects in scene (e.g., 'jewelry display case', 'smartphone')"],
    "action": "what's happening in the scene (e.g., 'examining jewelry while checking phone')"
  },
  "humorNote": "subtle humor mechanism if any, or 'none'",
  "boringnessBreaker": {
    "selected": ["A","E"],        // IDs of techniques chosen (at least one required)
    "executionNote": "1 sentence describing how it shows up visually"
  },
  "finalImagePrompt": "A SINGLE STRING to send to DALL-E. Must include: photography framing cues (lens/lighting/DOF), explicit 'no text/no signage/no screens' constraints, editorial realism cues (real materials, real reflections, imperfections), explicit 'avoid stock photo' guidance (candid, mid-action, human), wide horizontal banner composition (all important visual elements in central horizontal band, safe margins at top and bottom, vertically minimal height, horizontally expansive), visual encoding of the selected Boringness Breaker technique(s). The prompt should be complete and ready to send to DALL-E.",
  "negativePrompt": [
    "text, letters, numbers, signage, labels",
    "screens, UI, dashboards, holograms, floating icons",
    "logos, brands, watermarks",
    "cartoon, illustration, CGI, 3D render, anime"
  ],
  "confidence": 0.0
}

The finalImagePrompt must be a complete, standalone prompt that DALL-E can use directly. Include all necessary constraints and style guidance within that single string.

COMPOSITION REQUIREMENTS (CRITICAL for website hero banner):
- Wide, horizontally expansive banner format (3:1 or wider aspect ratio)
- Vertically minimal height - all important visual elements must be placed in the central horizontal band
- Safe margins at top and bottom - no critical content near vertical edges
- Composition should work when cropped to a wide, shallow container
- Avoid vertical stacking or tall elements that would be cropped

Set confidence to a value between 0.0 and 1.0 based on how well the articles can be combined into a single coherent scene. Lower confidence if articles are thematically incompatible or if the scene feels forced.`;
}

async function callSceneDirectorLLM(
  articles: ArticleInput[],
  variant: Variant,
  apiKey: string,
  isRetry: boolean = false
): Promise<SceneDirectorOutput | null> {
  try {
    const openai = new OpenAI({ apiKey });
    
    let prompt = buildSceneDirectorPrompt(articles, variant);
    
    // Add retry message if this is a retry
    if (isRetry) {
      prompt = `IMPORTANT: You must select at least one Boringness Breaker technique and encode it visually. Your previous response was missing or had an empty boringnessBreaker.selected field.

${prompt}`;
    }
    
    const response = await openai.chat.completions.create({
      model: SCENE_DIRECTOR_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a Scene Director for editorial photography. You output ONLY valid JSON, no markdown, no code blocks, no explanations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
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
    
    if (!parsed.visualAnchors || typeof parsed.visualAnchors !== 'object') {
      throw new Error('Invalid response: missing visualAnchors');
    }
    
    // Validate Boringness Breaker (MANDATORY)
    if (!parsed.boringnessBreaker || !parsed.boringnessBreaker.selected || !Array.isArray(parsed.boringnessBreaker.selected) || parsed.boringnessBreaker.selected.length === 0) {
      throw new Error('Invalid response: missing or empty boringnessBreaker.selected (at least one technique required)');
    }
    
    // Ensure confidence is a number
    if (typeof parsed.confidence !== 'number') {
      parsed.confidence = 0.5;
    }
    
    // Check if breaker is weakly applied (confidence penalty)
    const hasExecutionNote = parsed.boringnessBreaker?.executionNote && parsed.boringnessBreaker.executionNote.trim().length > 0;
    const executionNoteIsGeneric = hasExecutionNote && (
      parsed.boringnessBreaker.executionNote.toLowerCase().includes('funny') ||
      parsed.boringnessBreaker.executionNote.toLowerCase().includes('humor') ||
      parsed.boringnessBreaker.executionNote.toLowerCase().includes('interesting') ||
      parsed.boringnessBreaker.executionNote.length < 20 // Too short to be specific
    );
    
    if (executionNoteIsGeneric || !hasExecutionNote) {
      // Reduce confidence if breaker is weakly applied
      parsed.confidence = Math.max(0.0, parsed.confidence - 0.15);
      console.warn(`[SceneDirector] Boringness Breaker weakly applied, reducing confidence by 0.15`);
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
    
    // If missing boringnessBreaker and not already a retry, retry once
    if (errorMessage.includes('boringnessBreaker') && !isRetry) {
      console.warn(`[SceneDirector] Missing Boringness Breaker, retrying once...`);
      return callSceneDirectorLLM(articles, variant, apiKey, true);
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
  
  // Call LLM
  console.log(`[SceneDirector] Generating scene for ${weekLabel} (variant: ${variant})...`);
  const result = await callSceneDirectorLLM(selectedArticles, variant, apiKey);
  
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
  
  console.log(`[SceneDirector] Generated scene: ${result.conceptTitle} (confidence: ${result.confidence.toFixed(2)})`);
  
  return result;
}

