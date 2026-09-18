/**
 * Module function for building weekly podcast
 * Extracted from scripts/buildWeeklyPodcast.ts for use by orchestrator
 */

import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import type { WeeklyDigest } from '../lib/types';
import { getModelFor, maxTokensParam, temperatureParam } from '../lib/llm/models';

/**
 * Generate podcast script from digest
 */
async function generatePodcastScript(digest: WeeklyDigest): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const articles = [
    ...digest.topics.Ecommerce_Retail_Tech.top.slice(0, 3),
    ...digest.topics.Jewellery_Industry.top.slice(0, 2),
    ...digest.topics.Luxury_and_Consumer.top.slice(0, 2),
    ...digest.topics.AI_and_Strategy.top.slice(0, 1),
  ];

  const articlesText = articles.map((article, idx) => {
    return `${idx + 1}. ${article.title}
   Source: ${article.source}
   Summary: ${article.aiSummary || article.snippet || 'No summary available'}`;
  }).join('\n\n');

  const prompt = `You are a podcast host for "Weekly Luxury Intelligence", a podcast covering ecommerce, jewellery, luxury, and AI news.

Generate a conversational podcast script covering these ${articles.length} articles. The total script MUST be at least 2000 words and no more than 2500 words.

${articlesText}

Word count requirements — you MUST hit these, do not stop early:
- Intro: 60 words — welcome listeners, mention this is week ${digest.weekLabel}
- Each of the ${articles.length} article segments: 250 words MINIMUM — cover the full story, explain why it matters, discuss implications and context for the industry. Do not cut a segment short.
- A one-sentence transition between each segment (~15 words each)
- Closing: 60 words — thank listeners, tease next week
The total must reach AT LEAST 2200 words. If you finish a segment early, expand on analysis and context until you reach 250 words for that segment.

Tone: Professional but conversational, like a business news podcast. Be clear and engaging. Write full, complete paragraphs — do not use bullet points or lists.

IMPORTANT: Output plain spoken narration only. Do NOT include any labels, headers, or prefixes such as "Host:", "Intro:", "Segment:", "Closing:", or any other structural markers. The output will be read aloud directly by a text-to-speech engine — it must contain nothing but the words to be spoken.`;

  const scriptModel = getModelFor('script');
  const response = await openai.chat.completions.create({
    model: scriptModel,
    messages: [
      { role: 'system', content: 'You are a professional podcast script writer.' },
      { role: 'user', content: prompt },
    ],
    ...maxTokensParam(scriptModel, 5000),
    ...temperatureParam(scriptModel, 0.7),
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Split text into chunks for OpenAI TTS (max 4096 chars per chunk)
 */
function splitTextIntoChunks(text: string, maxChars: number = 4000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 <= maxChars) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = sentence;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Generate audio using ElevenLabs API, chunking text to stay under the 10k char limit
 */
async function generateAudioWithElevenLabs(text: string, outputPath: string): Promise<{ success: boolean; duration?: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not found');
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'XFsVUrYetuzY4ZR8T3nN';
  const model = 'eleven_multilingual_v2';

  const chunks = splitTextIntoChunks(text, 9500);

  try {
    const audioBuffers: Buffer[] = [];

    for (const chunk of chunks) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: chunk,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      audioBuffers.push(Buffer.from(await response.arrayBuffer()));
    }

    await fs.writeFile(outputPath, Buffer.concat(audioBuffers));

    const wordCount = text.split(/\s+/).length;
    const duration = Math.round((wordCount / 150) * 60);

    return { success: true, duration };
  } catch (error) {
    throw error;
  }
}

/**
 * Generate audio using OpenAI TTS (fallback)
 */
async function generateAudioWithOpenAI(text: string, outputPath: string): Promise<{ success: boolean; duration?: number }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const chunks = splitTextIntoChunks(text);
    const audioBuffers: Buffer[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: chunks[i],
      });

      const chunkBuffer = Buffer.from(await response.arrayBuffer());
      audioBuffers.push(chunkBuffer);
    }

    const finalBuffer = Buffer.concat(audioBuffers);
    await fs.writeFile(outputPath, finalBuffer);

    const wordCount = text.split(/\s+/).length;
    const duration = Math.round((wordCount / 150) * 60);

    return { success: true, duration };
  } catch (error) {
    throw error;
  }
}

/**
 * Build weekly podcast
 */
export async function buildWeeklyPodcast(weekLabel: string): Promise<{ success: boolean; scriptPath: string; audioPath: string }> {
  // Load digest
  const digestPath = path.join(process.cwd(), 'data', 'digests', `${weekLabel}.json`);
  const digestContent = await fs.readFile(digestPath, 'utf-8');
  const digest: WeeklyDigest = JSON.parse(digestContent);

  // Generate script
  const script = await generatePodcastScript(digest);

  // Save script
  const weekDir = path.join(process.cwd(), 'data', 'weeks', weekLabel);
  await fs.mkdir(weekDir, { recursive: true });
  const scriptPath = path.join(weekDir, 'podcast-script.txt');
  await fs.writeFile(scriptPath, script, 'utf-8');

  // Generate audio
  const audioPath = path.join(process.cwd(), 'public', 'podcast', `${weekLabel}.mp3`);
  await fs.mkdir(path.dirname(audioPath), { recursive: true });

  let audioResult: { success: boolean; duration?: number; model?: string; voice?: string };
  
  // Try ElevenLabs first
  try {
    const result = await generateAudioWithElevenLabs(script, audioPath);
    audioResult = {
      success: result.success,
      duration: result.duration,
      model: 'eleven_multilingual_v2',
      voice: process.env.ELEVENLABS_VOICE_ID || 'XFsVUrYetuzY4ZR8T3nN',
    };
  } catch (error) {
    // Fallback to OpenAI TTS
    try {
      const result = await generateAudioWithOpenAI(script, audioPath);
      audioResult = {
        success: result.success,
        duration: result.duration,
        model: 'tts-1',
        voice: 'alloy',
      };
    } catch (fallbackError) {
      throw new Error(`Both ElevenLabs and OpenAI TTS failed: ${(fallbackError as Error).message}`);
    }
  }

  // Save metadata. fileSize feeds the RSS <enclosure length> in
  // app/podcast/feed.xml/route.ts, which must not stat public/ itself (that
  // makes Vercel's file tracer bundle every MP3 into the function).
  const { size: fileSize } = await fs.stat(audioPath);
  const podcastMetadata = {
    week: weekLabel,
    audioPath: `/podcast/${weekLabel}.mp3`,
    model: audioResult.model || 'unknown',
    voice: audioResult.voice || 'unknown',
    generatedAt: new Date().toISOString(),
    duration: audioResult.duration,
    fileSize,
  };

  const metadataPath = path.join(weekDir, 'podcast.json');
  await fs.writeFile(metadataPath, JSON.stringify(podcastMetadata, null, 2), 'utf-8');

  return {
    success: true,
    scriptPath,
    audioPath,
  };
}
