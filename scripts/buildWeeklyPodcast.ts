import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { parse } from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { platform } from 'os';

const execAsync = promisify(exec);

// --- Environment Variable Loading for CLI ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../.env.local');
let envResult: { error?: Error; parsed?: Record<string, string> } = { parsed: {} };
try {
  const buffer = readFileSync(envPath);
  let contentToParse: string;
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    contentToParse = buffer.toString('utf16le', 2);
  } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const leBuffer = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i < buffer.length; i += 2) {
      leBuffer[i - 2] = buffer[i + 1];
      leBuffer[i - 1] = buffer[i];
    }
    contentToParse = leBuffer.toString('utf16le');
  } else if (buffer.length > 0 && buffer[1] === 0 && buffer[0] !== 0) {
    contentToParse = buffer.toString('utf16le');
  } else {
    contentToParse = buffer.toString('utf-8');
  }
  const parsed = parse(contentToParse);
  Object.assign(process.env, parsed);
  envResult.parsed = parsed;
} catch (err) {
  envResult.error = err as Error;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found in environment variables');
  process.exit(1);
}

const SCRIPT_MODEL = 'gpt-4o';
const TTS_MODEL = 'tts-1-hd'; // OpenAI TTS model (or 'tts-1' for faster/cheaper)
const TTS_VOICE_OPTIONS = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
type TTSVoice = typeof TTS_VOICE_OPTIONS[number];

// Target word count for ~20 minute podcast (average speaking rate ~150 words/min)
const TARGET_WORD_COUNT = 3000; // ~20 minutes at 150 words/min
const MIN_WORD_COUNT = 2100; // Minimum ~14 minutes at 150 words/min (acceptable range)
const STRICT_MIN_WORD_COUNT = 2250; // Strict minimum ~15 minutes
const WORDS_PER_MINUTE = 150;

interface DigestArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  snippet?: string;
  aiSummary?: string;
}

interface ExtractedArticle {
  url: string;
  title: string;
  extractedText: string;
  wordCount: number;
}

interface DigestTopic {
  total: number;
  top: DigestArticle[];
}

interface WeeklyDigest {
  weekLabel: string;
  topics: {
    AI_and_Strategy: DigestTopic;
    Ecommerce_Retail_Tech: DigestTopic;
    Luxury_and_Consumer: DigestTopic;
    Jewellery_Industry: DigestTopic;
  };
  keyThemes?: string[];
  oneSentenceSummary?: string;
  introParagraph?: string;
}

interface PodcastSegment {
  title: string;
  startCue: string;
  articles: string[];
}

interface PodcastScript {
  episodeTitle: string;
  episodeDescription: string;
  script: string;
  segments: PodcastSegment[];
  wordCount: number;
  estimatedDuration: number; // in minutes
}

interface PodcastMetadata {
  week: string;
  audioPath: string;
  model: string;
  voice: TTSVoice;
  generatedAt: string;
  duration?: number; // in seconds
  music?: {
    enabled: boolean;
    track: string;
  };
}

function parseArgs(): { week: string; voice: TTSVoice; forceScript: boolean; forceAudio: boolean; music: boolean } {
  const args = process.argv.slice(2);
  let week = '';
  let voice: TTSVoice = 'alloy';
  let forceScript = false;
  let forceAudio = false;
  let music = true; // default: on

  for (const arg of args) {
    if (arg.startsWith('--week=')) {
      week = arg.split('=')[1];
    } else if (arg.startsWith('--voice=')) {
      const voiceArg = arg.split('=')[1];
      if (TTS_VOICE_OPTIONS.includes(voiceArg as TTSVoice)) {
        voice = voiceArg as TTSVoice;
      } else {
        console.warn(`Invalid voice "${voiceArg}", using default "alloy"`);
      }
    } else if (arg.startsWith('--music=')) {
      const musicArg = arg.split('=')[1];
      music = musicArg === 'on';
    } else if (arg === '--forceScript') {
      forceScript = true;
    } else if (arg === '--forceAudio') {
      forceAudio = true;
    }
  }

  if (!week) {
    console.error('Error: --week=YYYY-Www is required');
    process.exit(1);
  }

  return { week, voice, forceScript, forceAudio, music };
}

async function loadDigest(weekLabel: string): Promise<WeeklyDigest> {
  const digestPath = path.join(__dirname, '../data/digests', `${weekLabel}.json`);
  try {
    const content = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    throw new Error(`Failed to load digest for ${weekLabel}: ${err.message}`);
  }
}

function collectAllArticles(digest: WeeklyDigest): DigestArticle[] {
  const articles: DigestArticle[] = [];
  for (const topicKey of Object.keys(digest.topics) as Array<keyof typeof digest.topics>) {
    // Only include top 3 articles from each category for podcast
    articles.push(...digest.topics[topicKey].top.slice(0, 3));
  }
  return articles;
}

/**
 * Hash URL using SHA256 (same as discovery/fetchExtract.ts)
 */
function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
}

/**
 * Load extracted article text from discovery cache files
 */
async function loadExtractedTextForArticles(
  articles: DigestArticle[],
  weekLabel: string
): Promise<Map<string, string>> {
  const extractedTextMap = new Map<string, string>();
  const discoveryExtractedDir = path.join(__dirname, '../data/weeks', weekLabel, 'discovery', 'extracted');
  
  // Check if discovery extracted directory exists
  try {
    await fs.access(discoveryExtractedDir);
  } catch {
    // Directory doesn't exist, return empty map
    console.log(`[Podcast] No discovery extracted directory found for ${weekLabel}, using summaries only`);
    return extractedTextMap;
  }

  // Load extracted text for each article
  for (const article of articles) {
    const hash = hashUrl(article.url);
    const extractedPath = path.join(discoveryExtractedDir, `${hash}.json`);
    
    try {
      const content = await fs.readFile(extractedPath, 'utf-8');
      const extracted: ExtractedArticle = JSON.parse(content);
      
      if (extracted.extractedText && extracted.extractedText.length > 0) {
        // Use full extracted text (up to 5000 chars, but prefer longer if available)
        extractedTextMap.set(article.url, extracted.extractedText);
      }
    } catch (err) {
      // File doesn't exist or can't be read - article might be from RSS/ingestion, not discovery
      // Continue without extracted text for this article
    }
  }

  const loadedCount = extractedTextMap.size;
  console.log(`[Podcast] Loaded full text for ${loadedCount}/${articles.length} articles from discovery cache`);
  
  return extractedTextMap;
}

async function generatePodcastScript(digest: WeeklyDigest, weekLabel: string, isRetry: boolean = false): Promise<PodcastScript> {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const articles = collectAllArticles(digest);
  
  // Load full extracted text from discovery cache files
  const extractedTextMap = await loadExtractedTextForArticles(articles, weekLabel);
  
  // Group articles by topic for segments (only top 3 per category)
  const topicGroups = {
    'Artificial Intelligence News': digest.topics.AI_and_Strategy.top.slice(0, 3),
    'E-commerce & Retail Tech': digest.topics.Ecommerce_Retail_Tech.top.slice(0, 3),
    'Fashion & Luxury': digest.topics.Luxury_and_Consumer.top.slice(0, 3),
    'Jewellery Industry': digest.topics.Jewellery_Industry.top.slice(0, 3),
  };

  const systemPrompt = `You are a podcast scriptwriter creating a weekly intelligence brief for Pandora colleagues. 
Write in a conversational but professional tone. 
Clearly cite article titles and sources verbally (never mention URLs).
Avoid controversial topics (war/culture-war/election horse-race) - same rules as the digest.
Include subtle humor occasionally but no jokes that date badly.
${isRetry ? `⚠️ RETRY: Your previous script was too short. You MUST write at least ${MIN_WORD_COUNT} words. Expand every segment significantly.` : ''}
CRITICAL: The script MUST be at least ${STRICT_MIN_WORD_COUNT} words (minimum ~15 minutes). Target ${TARGET_WORD_COUNT} words for a full ~20 minute episode.
You MUST expand on each article with context, implications, and connections between stories.
DO NOT write a short script. This is a full-length podcast episode, not a brief summary.
Return valid JSON only.`;

  const segmentWordTargets = {
    coldOpen: 50,
    intro: 150,
    segment1: Math.max(600, Math.ceil((STRICT_MIN_WORD_COUNT - 50 - 150 - 600 - 500 - 100) / 4)),
    segment2: Math.max(600, Math.ceil((STRICT_MIN_WORD_COUNT - 50 - 150 - 600 - 500 - 100) / 4)),
    segment3: Math.max(600, Math.ceil((STRICT_MIN_WORD_COUNT - 50 - 150 - 600 - 500 - 100) / 4)),
    segment4: Math.max(600, Math.ceil((STRICT_MIN_WORD_COUNT - 50 - 150 - 600 - 500 - 100) / 4)),
    lightning: 500,
    closing: 100
  };
  const totalMinWords = segmentWordTargets.coldOpen + segmentWordTargets.intro + 
    segmentWordTargets.segment1 + segmentWordTargets.segment2 + 
    segmentWordTargets.segment3 + segmentWordTargets.segment4 + 
    segmentWordTargets.lightning + segmentWordTargets.closing;

  const userPrompt = `Create a podcast script for week ${weekLabel}.

Week Summary: ${digest.oneSentenceSummary || 'Weekly intelligence brief'}
Key Themes: ${digest.keyThemes?.join(', ') || 'Retail and e-commerce intelligence'}

🚨 CRITICAL WORD COUNT REQUIREMENT - YOU MUST FOLLOW THESE EXACTLY:
- TOTAL MINIMUM: ${STRICT_MIN_WORD_COUNT} words (${Math.round(STRICT_MIN_WORD_COUNT / WORDS_PER_MINUTE)} minutes) - THIS IS MANDATORY
- TARGET: ${TARGET_WORD_COUNT} words (${Math.round(TARGET_WORD_COUNT / WORDS_PER_MINUTE)} minutes)

EXACT WORD COUNT TARGETS FOR EACH SECTION (you must hit these minimums):
1. Cold open: ${segmentWordTargets.coldOpen} words minimum
2. Intro: ${segmentWordTargets.intro} words minimum  
3. Segment 1 (Artificial Intelligence News, ${topicGroups['Artificial Intelligence News'].length} articles): ${segmentWordTargets.segment1} words minimum
4. Segment 2 (E-commerce & Retail Tech, ${topicGroups['E-commerce & Retail Tech'].length} articles): ${segmentWordTargets.segment2} words minimum
5. Segment 3 (Fashion & Luxury, ${topicGroups['Fashion & Luxury'].length} articles): ${segmentWordTargets.segment3} words minimum
6. Segment 4 (Jewellery Industry, ${topicGroups['Jewellery Industry'].length} articles): ${segmentWordTargets.segment4} words minimum
7. Lightning round: ${segmentWordTargets.lightning} words minimum
8. Closing: ${segmentWordTargets.closing} words minimum

TOTAL: At least ${totalMinWords} words across all sections.

EXPANSION REQUIREMENTS FOR EACH ARTICLE:
- Provide 3-5 sentences of context and background
- Explain why this story matters to retail/ecommerce/luxury professionals
- Connect it to other articles or broader trends
- Add analysis: what are the implications?
- Include real-world examples or applications when relevant
- For each article, write 150-200 words minimum (we have fewer articles, so each needs more depth)

DO NOT:
- Rush through articles with one sentence each
- Write brief summaries
- Skip analysis or context
- Write less than ${MIN_WORD_COUNT} total words

Structure:
1. Cold open (${segmentWordTargets.coldOpen} words) - Hook with most interesting story, set the scene
2. Intro (${segmentWordTargets.intro} words) - Welcome, week overview, what's coming, why it matters
3. Four main segments (${segmentWordTargets.segment1} words each minimum):
   - Segment 1: Artificial Intelligence News - Expand each of ${topicGroups['Artificial Intelligence News'].length} articles with full context
   - Segment 2: E-commerce & Retail Tech - Expand each of ${topicGroups['E-commerce & Retail Tech'].length} articles with full context
   - Segment 3: Fashion & Luxury - Expand each of ${topicGroups['Fashion & Luxury'].length} articles with full context
   - Segment 4: Jewellery Industry - Expand each of ${topicGroups['Jewellery Industry'].length} articles with full context
4. Lightning round (${segmentWordTargets.lightning} words) - Quick hits but still provide context for each
5. Closing (${segmentWordTargets.closing} words) - Wrap up, key takeaways, next week preview

${isRetry ? `⚠️ RETRY NOTICE: Your previous attempt was too short. You MUST write at least ${STRICT_MIN_WORD_COUNT} words total. Count your words as you write each section.` : ''}

EXAMPLE OF PROPER LENGTH:
For a segment with 3 articles, you should write:
- Article 1: 150-200 words (context, why it matters, implications, deeper analysis)
- Article 2: 150-200 words (context, why it matters, implications, deeper analysis)  
- Article 3: 150-200 words (context, why it matters, implications, deeper analysis)
- Transitions and connections: 100-150 words
Total per segment: 550-750 words minimum. For ${segmentWordTargets.segment1} words, expand even more with additional context, examples, and connections.

Remember: This is a FULL podcast episode, not a summary. Write as if you're speaking to colleagues who want depth and context.

Articles to cover:
${JSON.stringify(articles.map(a => {
  // Prefer full extracted text, fallback to aiSummary, then snippet
  const fullText = extractedTextMap.get(a.url);
  const summary = fullText 
    ? `FULL ARTICLE TEXT (use this for detailed discussion):\n${fullText}\n\n---\nAI Summary: ${a.aiSummary || a.snippet || 'N/A'}`
    : (a.aiSummary || a.snippet || 'No summary available');
  
  return {
    title: a.title,
    source: a.source,
    content: summary, // Full text or summary
    url: a.url,
    hasFullText: !!fullText
  };
}), null, 2)}

IMPORTANT: For articles with "hasFullText: true", you have access to the FULL article content. Use this to:
- Extract specific details, quotes, and data points
- Provide deeper analysis and context
- Connect multiple details from the article
- Write 180-250 words per article with full text (we have fewer articles, so go deeper)
- Reference specific facts, numbers, and examples from the full text
- Expand on implications and real-world applications

For articles without full text, use the provided summary but still expand with context and implications.

Return JSON:
{
  "episodeTitle": "Engaging title for the episode",
  "episodeDescription": "1-2 sentence description",
  "script": "Full spoken script with all segments",
  "segments": [
    {
      "title": "Segment title",
      "startCue": "Opening line of this segment",
      "articles": ["url1", "url2"]
    }
  ],
  "wordCount": 3000,
  "estimatedDuration": 20
}`;

  try {
    const response = await openai.chat.completions.create({
      model: SCRIPT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 12000, // Force longer output for expanded articles
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const script = JSON.parse(content) as PodcastScript;
    
    // Validate word count
    const actualWordCount = script.script.split(/\s+/).length;
    script.wordCount = actualWordCount;
    script.estimatedDuration = Math.round(actualWordCount / WORDS_PER_MINUTE);
    
    // Retry if below strict minimum (only once to avoid infinite loops)
    if (actualWordCount < STRICT_MIN_WORD_COUNT && !isRetry) {
      console.warn(`⚠️  Script is only ${actualWordCount} words (~${script.estimatedDuration} min), below target of ${STRICT_MIN_WORD_COUNT} words (~${Math.round(STRICT_MIN_WORD_COUNT / WORDS_PER_MINUTE)} min)`);
      console.log(`[Script] Retrying with stricter length requirements...`);
      return generatePodcastScript(digest, weekLabel, true);
    }
    
    // Warn if below minimum after retry
    if (actualWordCount < MIN_WORD_COUNT) {
      console.warn(`⚠️  Script is only ${actualWordCount} words (~${script.estimatedDuration} min), below minimum of ${MIN_WORD_COUNT} words (~${Math.round(MIN_WORD_COUNT / WORDS_PER_MINUTE)} min)`);
    } else if (actualWordCount < STRICT_MIN_WORD_COUNT) {
      console.warn(`⚠️  Script is ${actualWordCount} words (~${script.estimatedDuration} min), slightly below target of ${STRICT_MIN_WORD_COUNT} words (~${Math.round(STRICT_MIN_WORD_COUNT / WORDS_PER_MINUTE)} min) but acceptable`);
    }

    return script;
  } catch (error: any) {
    throw new Error(`Failed to generate podcast script: ${error.message}`);
  }
}

/**
 * Expand a script to meet minimum word count by adding more detail and context
 */
async function expandScript(script: PodcastScript, targetWordCount: number): Promise<PodcastScript> {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const currentWordCount = script.script.split(/\s+/).length;
  const wordsNeeded = targetWordCount - currentWordCount;
  
  const expandPrompt = `Expand the following podcast script by adding approximately ${wordsNeeded} more words.

Current script (${currentWordCount} words):
${script.script}

EXPANSION REQUIREMENTS:
- Add more context and background to each article discussion
- Expand analysis and implications
- Add connections between stories
- Include more detail on why each story matters
- Expand transitions between segments
- Add more depth to the lightning round
- Expand the closing with more takeaways

Return the FULL expanded script (not just additions) in the same JSON format:
{
  "episodeTitle": "${script.episodeTitle}",
  "episodeDescription": "${script.episodeDescription}",
  "script": "FULL expanded script with at least ${targetWordCount} words",
  "segments": ${JSON.stringify(script.segments)},
  "wordCount": ${targetWordCount},
  "estimatedDuration": ${Math.round(targetWordCount / WORDS_PER_MINUTE)}
}`;

  try {
    const response = await openai.chat.completions.create({
      model: SCRIPT_MODEL,
      messages: [
        { role: 'system', content: 'You are a podcast scriptwriter. Expand scripts with more detail and context while maintaining the same structure and tone.' },
        { role: 'user', content: expandPrompt }
      ],
      temperature: 0.7,
      max_tokens: 10000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const expanded = JSON.parse(content) as PodcastScript;
    return expanded;
  } catch (error: any) {
    throw new Error(`Failed to expand script: ${error.message}`);
  }
}

/**
 * Identify which chunks belong to intro (cold open + intro) and outro (closing)
 * Simple heuristic: first 1-2 chunks are intro, last chunk is outro
 */
function identifyIntroOutroChunks(chunks: string[], script: PodcastScript): { introChunks: number[]; outroChunks: number[] } {
  // Intro: first 1-2 chunks (cold open + intro)
  // Outro: last chunk (closing)
  const introChunks: number[] = [];
  const outroChunks: number[] = [];
  
  if (chunks.length === 0) {
    return { introChunks, outroChunks };
  }
  
  // First 1-2 chunks are intro (cold open + intro)
  introChunks.push(0);
  if (chunks.length > 1 && chunks[0].length < 1000) {
    // If first chunk is short, likely includes both cold open and intro
    // Otherwise, second chunk might be intro continuation
    introChunks.push(1);
  }
  
  // Last chunk is outro
  outroChunks.push(chunks.length - 1);
  
  return { introChunks, outroChunks };
}

/**
 * Resolve FFmpeg executable path
 * Checks in order:
 * 1. FFMPEG_PATH environment variable
 * 2. tools/ffmpeg/ffmpeg(.exe) (bundled)
 * 3. System PATH (ffmpeg command)
 */
function resolveFfmpegPath(): string | null {
  const isWindows = platform() === 'win32';
  const exe = isWindows ? '.exe' : '';
  
  // 1. Check environment variable
  if (process.env.FFMPEG_PATH) {
    const envPath = process.env.FFMPEG_PATH;
    try {
      // Check if file exists (synchronous check for path resolution)
      if (require('fs').existsSync(envPath)) {
        return envPath;
      }
    } catch {
      // Continue to next option
    }
  }
  
  // 2. Check bundled location
  const bundledPath = path.join(__dirname, '../tools/ffmpeg', `ffmpeg${exe}`);
  try {
    if (require('fs').existsSync(bundledPath)) {
      return bundledPath;
    }
  } catch {
    // Continue to next option
  }
  
  // 3. Fall back to system PATH
  return 'ffmpeg';
}

/**
 * Resolve FFprobe executable path (same logic as FFmpeg)
 */
function resolveFfprobePath(): string | null {
  const isWindows = platform() === 'win32';
  const exe = isWindows ? '.exe' : '';
  
  // 1. Check environment variable (FFPROBE_PATH or FFMPEG_PATH base)
  if (process.env.FFPROBE_PATH) {
    const envPath = process.env.FFPROBE_PATH;
    try {
      if (require('fs').existsSync(envPath)) {
        return envPath;
      }
    } catch {
      // Continue to next option
    }
  }
  
  // If FFMPEG_PATH is set, try to derive ffprobe path
  if (process.env.FFMPEG_PATH) {
    const ffmpegPath = process.env.FFMPEG_PATH;
    const ffprobePath = ffmpegPath.replace(/ffmpeg/i, 'ffprobe');
    try {
      if (require('fs').existsSync(ffprobePath)) {
        return ffprobePath;
      }
    } catch {
      // Continue to next option
    }
  }
  
  // 2. Check bundled location
  const bundledPath = path.join(__dirname, '../tools/ffmpeg', `ffprobe${exe}`);
  try {
    if (require('fs').existsSync(bundledPath)) {
      return bundledPath;
    }
  } catch {
    // Continue to next option
  }
  
  // 3. Fall back to system PATH
  return 'ffprobe';
}

/**
 * Check if FFmpeg is available
 */
async function checkFFmpegAvailable(): Promise<{ available: boolean; path: string | null }> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    return { available: false, path: null };
  }
  
  try {
    await execAsync(`"${ffmpegPath}" -version`);
    return { available: true, path: ffmpegPath };
  } catch {
    return { available: false, path: ffmpegPath };
  }
}

/**
 * Mix background music with voice audio using FFmpeg
 */
async function mixMusicWithVoice(
  voicePath: string,
  musicPath: string,
  outputPath: string,
  fadeIn: number = 1.2,
  fadeOut: number = 1.8,
  musicVolume: number = 0.12 // 12% volume (subtle)
): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();
  const ffprobePath = resolveFfprobePath();
  
  if (!ffmpegPath || !ffprobePath) {
    throw new Error('FFmpeg not found. Please install FFmpeg or place it in tools/ffmpeg/');
  }
  
  // Get voice duration first
  let duration: number;
  try {
    // Use proper Windows path quoting (no escaping needed, just quote the path)
    const { stdout: durationStr } = await execAsync(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voicePath}"`);
    duration = parseFloat(durationStr.trim());
  } catch (error: any) {
    throw new Error(`Failed to get voice duration: ${error.message}`);
  }
  
  const fadeOutStart = Math.max(0, duration - fadeOut);
  
  // FFmpeg command to mix music with voice
  // - Music volume: 12% (subtle background)
  // - Fade in: 1.2s, Fade out: 1.8s
  // - Voice remains at full volume
  // - Music loops if needed but stops at voice duration
  // -map flags select only audio streams (ignore video/cover art in music file)
  // Use proper Windows path quoting (no escaping needed, just quote the paths)
  const command = `"${ffmpegPath}" -i "${voicePath}" -stream_loop -1 -i "${musicPath}" -map 0:a -map 1:a -filter_complex "[1:a]volume=${musicVolume},afade=t=in:ss=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2" -c:a libmp3lame -b:a 192k -shortest "${outputPath}"`;
  
  try {
    await execAsync(command);
  } catch (error: any) {
    throw new Error(`FFmpeg mixing failed: ${error.message}`);
  }
}

async function generateAudio(script: PodcastScript, voice: TTSVoice, weekLabel: string, musicEnabled: boolean): Promise<{ path: string; duration: number }> {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  
  // OpenAI TTS has a limit per request, so we'll chunk if needed
  const MAX_CHUNK_LENGTH = 4000; // characters, safe limit
  const chunks: string[] = [];
  
  // Split script into sentences and group into chunks
  const sentences = script.script.match(/[^.!?]+[.!?]+/g) || [script.script];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > MAX_CHUNK_LENGTH && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  console.log(`[TTS] Generating audio in ${chunks.length} chunk(s)...`);

  const tempDir = path.join(__dirname, '../data/weeks', weekLabel, 'podcast-temp');
  await fs.mkdir(tempDir, { recursive: true });
  
  const chunkFiles: string[] = [];

  // Generate TTS for each chunk and save to temp files
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[TTS] Processing chunk ${i + 1}/${chunks.length}...`);
    
    try {
      const response = await openai.audio.speech.create({
        model: TTS_MODEL,
        voice: voice,
        input: chunks[i],
        response_format: 'mp3'
      });

      // Convert response to buffer and save to temp file
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const chunkPath = path.join(tempDir, `chunk-${i}.mp3`);
      await fs.writeFile(chunkPath, buffer);
      chunkFiles.push(chunkPath);
    } catch (error: any) {
      throw new Error(`Failed to generate audio chunk ${i + 1}: ${error.message}`);
    }
  }

  // Identify intro/outro chunks
  const { introChunks, outroChunks } = identifyIntroOutroChunks(chunks, script);
  
  // If music is enabled, mix it with intro/outro chunks
  if (musicEnabled) {
    const musicPath = path.join(__dirname, '../assets/audio/podcast-theme.mp3.mp3');
    
    // Check if music file exists
    try {
      await fs.access(musicPath);
    } catch {
      console.warn(`[Music] Music file not found at ${musicPath}, skipping music mixing`);
      musicEnabled = false;
    }
    
    // Check if FFmpeg is available
    if (musicEnabled) {
      const { available, path: ffmpegPath } = await checkFFmpegAvailable();
      if (!available) {
        console.warn('[Music] FFmpeg not found, skipping music mixing.');
        console.warn('  To enable music mixing, place FFmpeg in one of these locations:');
        console.warn('  1. Set FFMPEG_PATH environment variable');
        console.warn(`  2. Place ffmpeg${platform() === 'win32' ? '.exe' : ''} in tools/ffmpeg/`);
        console.warn('  3. Install FFmpeg globally and add to PATH');
        console.warn('  See tools/ffmpeg/README.md for details.');
        musicEnabled = false;
      } else if (ffmpegPath) {
        console.log(`[Music] Using FFmpeg at: ${ffmpegPath}`);
      }
    }
    
    // Mix music with intro chunks
    if (musicEnabled && introChunks.length > 0) {
      for (const chunkIdx of introChunks) {
        try {
          console.log(`[Music] Mixing music with intro chunk ${chunkIdx + 1}...`);
          const originalPath = chunkFiles[chunkIdx];
          const mixedPath = path.join(tempDir, `chunk-${chunkIdx}-mixed.mp3`);
          await mixMusicWithVoice(originalPath, musicPath, mixedPath);
          chunkFiles[chunkIdx] = mixedPath;
          // Clean up original
          await fs.unlink(originalPath).catch(() => {});
        } catch (error: any) {
          console.warn(`[Music] Failed to mix music with intro chunk ${chunkIdx + 1}: ${error.message}. Using voice-only.`);
        }
      }
    }
    
    // Mix music with outro chunks
    if (musicEnabled && outroChunks.length > 0) {
      for (const chunkIdx of outroChunks) {
        // Skip if already mixed (shouldn't happen, but safety check)
        if (introChunks.includes(chunkIdx)) continue;
        
        try {
          console.log(`[Music] Mixing music with outro chunk ${chunkIdx + 1}...`);
          const originalPath = chunkFiles[chunkIdx];
          const mixedPath = path.join(tempDir, `chunk-${chunkIdx}-mixed.mp3`);
          await mixMusicWithVoice(originalPath, musicPath, mixedPath);
          chunkFiles[chunkIdx] = mixedPath;
          // Clean up original
          await fs.unlink(originalPath).catch(() => {});
        } catch (error: any) {
          console.warn(`[Music] Failed to mix music with outro chunk ${chunkIdx + 1}: ${error.message}. Using voice-only.`);
        }
      }
    }
  }

  // Concatenate all chunks using FFmpeg
  const publicDir = path.join(__dirname, '../public/podcast');
  await fs.mkdir(publicDir, { recursive: true });
  const audioPath = path.join(publicDir, `${weekLabel}.mp3`);
  
  // Create file list for FFmpeg concat
  const fileListPath = path.join(tempDir, 'filelist.txt');
  // Use forward slashes for FFmpeg (works on both Windows and Unix)
  const fileListContent = chunkFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
  await fs.writeFile(fileListPath, fileListContent, 'utf-8');
  
  try {
    // Concatenate using FFmpeg
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      throw new Error('FFmpeg not found');
    }
    // Use proper Windows path quoting (no escaping needed, just quote the paths)
    await execAsync(`"${ffmpegPath}" -f concat -safe 0 -i "${fileListPath}" -c copy "${audioPath}"`);
  } catch (error: any) {
    // Fallback: read all chunks and concatenate manually
    console.warn('[Audio] FFmpeg concat failed, using manual concatenation...');
    const buffers: Buffer[] = [];
    for (const chunkFile of chunkFiles) {
      const buffer = await fs.readFile(chunkFile);
      buffers.push(buffer);
    }
    const finalAudio = Buffer.concat(buffers);
    await fs.writeFile(audioPath, finalAudio);
  }
  
  // Clean up temp files
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  // Get actual duration
  let estimatedDuration: number;
  try {
    const ffprobePath = resolveFfprobePath();
    if (ffprobePath) {
      // Use proper Windows path quoting (no escaping needed, just quote the path)
      const { stdout: durationStr } = await execAsync(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
      estimatedDuration = Math.round(parseFloat(durationStr.trim()));
    } else {
      // Fallback estimation
      estimatedDuration = Math.round(script.script.length / 25);
    }
  } catch {
    // Fallback estimation
    estimatedDuration = Math.round(script.script.length / 25);
  }

  const fileStats = await fs.stat(audioPath);
  console.log(`✓ Audio saved to: ${audioPath} (${(fileStats.size / 1024 / 1024).toFixed(2)}MB, ~${Math.round(estimatedDuration / 60)}min)`);

  return { path: `/podcast/${weekLabel}.mp3`, duration: estimatedDuration };
}

async function main() {
  const { week, voice, forceScript, forceAudio, music } = parseArgs();
  
  console.log(`Building podcast for week: ${week}`);
  console.log(`Voice: ${voice}`);
  console.log(`Music: ${music ? 'on' : 'off'}`);
  if (forceScript) console.log('Force regenerating script');
  if (forceAudio) console.log('Force regenerating audio');

  // Load digest
  console.log(`[Load] Loading digest for ${week}...`);
  const digest = await loadDigest(week);

  // Paths
  const weekDir = path.join(__dirname, '../data/weeks', week);
  const scriptPath = path.join(weekDir, 'podcast-script.json');
  const metadataPath = path.join(weekDir, 'podcast.json');

  // Step A: Generate script
  let script: PodcastScript;
  const scriptExists = !forceScript && await fs.access(scriptPath).then(() => true).catch(() => false);
  
  if (scriptExists) {
    console.log(`[Script] Using cached script from ${scriptPath}`);
    const scriptContent = await fs.readFile(scriptPath, 'utf-8');
    script = JSON.parse(scriptContent);
  } else {
    console.log('[Script] Generating podcast script...');
    script = await generatePodcastScript(digest, week);
    await fs.mkdir(weekDir, { recursive: true });
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2));
    console.log(`✓ Script saved to: ${scriptPath}`);
    console.log(`  Word count: ${script.wordCount}, Estimated duration: ~${script.estimatedDuration} minutes`);
  }

  // Step B: Generate audio
  const metadataExists = !forceAudio && await fs.access(metadataPath).then(() => true).catch(() => false);
  let audioPath: string;
  let duration: number | undefined;

  if (metadataExists && !forceAudio) {
    console.log(`[Audio] Using cached audio metadata from ${metadataPath}`);
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent) as PodcastMetadata;
    audioPath = metadata.audioPath;
    duration = metadata.duration;
  } else {
    console.log('[Audio] Generating audio from script...');
    const audioResult = await generateAudio(script, voice, week, music);
    audioPath = audioResult.path;
    duration = audioResult.duration;
    
    // Save metadata
    const metadata: PodcastMetadata = {
      week,
      audioPath,
      model: TTS_MODEL,
      voice,
      generatedAt: new Date().toISOString(),
      duration: duration,
      music: music ? {
        enabled: true,
        track: 'podcast-theme.mp3'
      } : undefined
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`✓ Metadata saved to: ${metadataPath}`);
  }

  console.log('\n✓ Podcast generation complete!');
  console.log(`  Episode: ${script.episodeTitle}`);
  console.log(`  Audio: ${audioPath}`);
  console.log(`  Duration: ~${script.estimatedDuration} minutes`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

