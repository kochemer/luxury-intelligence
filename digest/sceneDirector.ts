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
  setting?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---

const SCENE_DIRECTOR_VERSION = 'v7'; // v7: NO humans (object/aftermath comedy only) + stronger real-camera realism (less "AI look")
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
  setting?: string; // The chosen everyday setting (tracked to avoid repeating it week to week)
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
            sceneDescription: scene.sceneDescription || '',
            setting: scene.setting || ''
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
    const lead = idx === 0 ? ' ⟵ LEAD STORY (build the joke about THIS one)' : '';
    let articleText = `Article ${idx + 1}:${lead}
- Title: ${article.title}
- Source: ${article.source || 'Unknown'}
- Summary: ${article.aiSummary || article.snippet || 'No summary available'}
- Why it matters: ${article.rerankWhy || 'Not specified'}`;

    if (article.sponsored) {
      articleText += '\n- Sponsored: Yes';
    }

    return articleText;
  }).join('\n\n');

  // Build anti-repetition constraints — now including the recent SETTINGS so the
  // model stops defaulting to the same supermarket/kitchen world every week.
  const noDiamonds = `HARD BAN - NO DIAMONDS (any size, any context):
- DO NOT feature diamonds, gemstones, or precious stones as focal objects
- For Jewellery Industry: use OTHER luxury objects (gold watches, rings, coins) instead`;

  let antiRepetitionConstraint = '';
  if (previousConcepts.length > 0) {
    const recentLines = previousConcepts
      .map(c => `- ${c.weekLabel}: setting="${c.setting || 'unknown'}", concept="${c.concept}" (${c.primaryHumorDriver})`)
      .join('\n');
    const recentSettings = previousConcepts.map(c => c.setting).filter(Boolean).join(', ');
    antiRepetitionConstraint = `
AVOID REPETITION (recent covers — do NOT reuse these):
${recentLines}

- Choose a DIFFERENT setting and a DIFFERENT primary humor driver than the recent ones above.
- Recently used settings to AVOID: ${recentSettings || 'none'}.
${noDiamonds}`;
  } else {
    antiRepetitionConstraint = `\n${noDiamonds}`;
  }

  return `You are a Scene Director for a weekly intelligence digest — think New Yorker cover or a great editorial cartoon, but as a photorealistic photograph.

Your job is to invent ONE photorealistic scene that is a genuine VISUAL JOKE about the single LEAD STORY below. Not a metaphor, not a mood — an actual joke that makes someone who just read that headline snort. A metaphor says "this represents value"; a joke shows a funny SITUATION with a setup and a punchline. Aim for that.

WHAT MAKES IT FUNNY (do this)
- Pick the ONE clearest comic idea in the lead story and stage it as a concrete SITUATION told entirely through OBJECTS and their aftermath — the scene of something that just happened, is comically going wrong, or is absurdly overdone. NO people to react — the objects and the mess/arrangement carry the whole joke.
- The engine of the joke is INCONGRUITY + EXAGGERATION: take one real thing from the story and push it to an absurd literal extreme (a thing far too big/small/many; the wrong tool for the job; a serious thing treated as trivial or vice-versa; a doorway/desk/room overwhelmed by it; a "just abandoned mid-action" moment).
- It must read WITHOUT WORDS and WITHOUT PEOPLE — the gag has to work from objects, arrangement, scale, and implied action alone. A viewer should "get it" in one second.
- The other articles are optional background flavour at most. Do NOT try to cram them all in — one clear joke beats a soup of references.

STYLE & TONE
- Hyper-realistic: must look like an actual photograph, not an AI image (Getty/Shutterstock — something a human photographer could have shot)
- Natural, believable lighting. Avoid dark surfaces, black backdrops, velvet — they read as CGI.
- The wit comes from the IDEA and the object/scene combination — never from visual effects.

SETTING — PICK ONE, MAKE IT UNEXPECTED (do NOT default to a supermarket or kitchen)
Choose a single, specific everyday setting that suits this week's stories, and vary it week to week. Draw from a WIDE range, e.g.:
office desk · boardroom · server room · trading floor · subway/train car · car dashboard or back seat · airport lounge or baggage carousel · hotel lobby or room-service tray · gym or locker room · art gallery or museum · workshop or garage · warehouse loading dock · rooftop · garden or park bench · laundromat · bathroom vanity · vending machine · newsstand · elevator · construction site · diner booth.
Only use a supermarket/kitchen if it is genuinely the single best fit for the stories — otherwise pick something else.

MANDATORY RULES
- NO people, NO humans, NO hands, faces, or body parts anywhere — not even in the background. The scene is unpeopled; objects and aftermath tell the joke.
- ABSOLUTELY NO readable text, words, brand names, logos, signage, labels, price tags, screens, or UI anywhere in the scene. This is critical — the image model tends to invent text/logos, so choose props that would not carry writing (or have any writing turned away, out of frame, or blurred beyond reading). Prefer generic, unbranded objects.
- LOOK LIKE A REAL PHOTOGRAPH, not an AI render: shot on a real camera by a person, natural available light with real shadows and true reflections, genuine surface texture — dust, wear, fingerprints, slight clutter, small imperfections and asymmetry. AVOID the tell-tale AI look: over-clean, over-smooth, waxy/plastic surfaces, everything perfectly centered and lit, glossy studio gloss, HDR glow. Aim for candid editorial/documentary realism (think a real photo in a magazine).
- NO illustration, CGI, 3D render, or cartoon style
- Wide landscape (3:2) composition — key elements in the central horizontal band
- ONE coherent scene (no collage, no multi-scene)

CREATIVE GUIDANCE
- With no people allowed, lean on AFTERMATH and IMPLIED ACTION: the empty chair, the overflowing doorway, the toppled stack, the one object comically out of place, the "you just missed it" moment. The mess or arrangement is the punchline.
- Exaggerate ONE thing hard rather than adding many props. The funniest covers are simple: one clear absurd focal event.
- Reject your first, most obvious idea — the second or third is usually funnier and less of a cliché.
- Keep it concrete and real-world: recognizable, touchable objects and a believable place; the humour comes from what's happened, not from surreal effects.

COMEDIC REGISTER — pick ONE to vary the feel week to week:
deadpan-corporate · absurdist · moody-but-well-lit (noir) · symmetrical/Wes-Anderson · documentary-candid · surreal-but-plausible

BORINGNESS BREAKER (REQUIRED)
You MUST select at least ONE Primary Humor Driver:
1. "role reversal" - something valuable/serious placed in a humble or trivial role (or vice versa)
2. "scale absurdity" - objects of mismatched size or importance next to each other
3. "literal metaphor" - objects that literally embody an abstract idea from the stories (supply, demand, risk, hype, a "moat", a "bubble")
4. "fish-out-of-water" - an object badly out of its normal context
5. "visual punchline" - an arrangement whose wit only clicks a beat later

Optionally add one Flavor Enhancer: unexpected texture/material combo · anachronism (old tech with new) · mirror/reflection reveal · partial obstruction creating mystery · implied motion or "just happened" moment.
${antiRepetitionConstraint}

ARTICLES TO REPRESENT:
${articleList}

OUTPUT FORMAT (JSON only, no markdown, no code blocks):
{
  "concept": "short concept title (e.g., 'server-room-ice-bath-ai-cooling')",
  "setting": "the single everyday setting you chose (e.g., 'server room', 'airport carousel', 'hotel room-service tray')",
  "primaryHumorDriver": "one of: role reversal, scale absurdity, literal metaphor, fish-out-of-water, visual punchline",
  "secondaryEnhancer": "optional flavor enhancer or null",
  "sceneDescription": "state the JOKE in one plain sentence first (what's the setup, what's the punchline, and which fact from the LEAD story it's riffing on), then describe the concrete scene — setting, the one exaggerated focal thing, any person and their reaction. It must be a joke a viewer gets in one second without any words.",
  "finalImagePrompt": "Describe ONLY: the setting/environment, what objects are in it, and where they are placed. Write it as a plain scene description — as if describing a real photograph to someone. Do NOT mention camera settings, f-stops, bokeh, depth of field, lighting rigs, cinematic, or composition rules — those cause CGI output. Keep it under 80 words.",
  "negativePrompt": [
    "people, person, human, man, woman, child, crowd, hands, fingers, face, faces, body, silhouette",
    "text, letters, numbers, signage, labels, price tags",
    "screens, UI, dashboards, holograms, floating icons",
    "watermarks, unrelated brand logos",
    "cartoon, illustration, CGI, 3D render, anime, video game render",
    "AI look, plastic, waxy skin, over-smooth, over-saturated, HDR glow, glossy studio, perfectly symmetrical, airbrushed",
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

