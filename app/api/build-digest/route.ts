/**
 * API Route: /api/build-digest
 *
 * This file defines a POST endpoint that triggers the "Weekly Digest" build.
 * It directly imports and calls the buildWeeklyDigest function instead of
 * spawning a child process, which is more efficient and provides better error handling.
 *
 * Typical use: webhook for triggering content regeneration, admin UI for forcing a digest refresh, etc.
 */

import { NextResponse } from 'next/server';
import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { buildWeeklyDigest } from '@/digest/buildWeeklyDigest';
import { generateSummariesForDigest } from '@/digest/generateSummaries';
import { parse } from 'dotenv';

// Load environment variables from .env.local if OPENAI_API_KEY is not already set
// (Next.js should load .env.local automatically, but this ensures it's available)
function ensureEnvVarsLoaded() {
  if (process.env.OPENAI_API_KEY) {
    return; // Already available
  }

  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const buffer = readFileSync(envPath);
    // Detect encoding: check for UTF-16 BOM (FE FF for BE, FF FE for LE)
    let contentToParse: string;
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
      // UTF-16 LE BOM
      contentToParse = buffer.toString('utf16le', 2);
    } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
      // UTF-16 BE BOM - convert to LE for processing
      const leBuffer = Buffer.alloc(buffer.length - 2);
      for (let i = 2; i < buffer.length; i += 2) {
        leBuffer[i - 2] = buffer[i + 1];
        leBuffer[i - 1] = buffer[i];
      }
      contentToParse = leBuffer.toString('utf16le');
    } else if (buffer.length > 0 && buffer[1] === 0 && buffer[0] !== 0) {
      // UTF-16 LE without BOM (every other byte is null)
      contentToParse = buffer.toString('utf16le');
    } else {
      // Assume UTF-8
      contentToParse = buffer.toString('utf-8');
    }
    const parsed = parse(contentToParse);
    Object.assign(process.env, parsed);
  } catch (err) {
    // Silently fail - Next.js may have already loaded it or file doesn't exist
    console.log('API: Could not load .env.local (may already be loaded by Next.js)');
  }
}

export async function POST() {
  // Ensure environment variables are loaded before generating summaries
  ensureEnvVarsLoaded();
  try {
    const now = DateTime.now().setZone('Europe/Copenhagen');
    const year = now.year;
    const weekNumber = now.weekNumber;
    const weekLabel = `${year}-W${weekNumber.toString().padStart(2, '0')}`;

    console.log(`API: Building digest for week: ${weekLabel}`);

    const digest = await buildWeeklyDigest(weekLabel);

    // Generate AI summaries for each Top-N article using shared function
    console.log('API: Generating AI summaries for articles...');
    const stats = await generateSummariesForDigest(digest);
    console.log(`API: Summary generation complete - Succeeded: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);

    const outputDir = path.join(process.cwd(), 'data', 'digests');
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${weekLabel}.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(digest, null, 2),
      'utf-8'
    );

    return NextResponse.json({
      ok: true,
      weekLabel,
      path: outputPath,
      builtAtISO: digest.builtAtISO,
      builtAtLocal: digest.builtAtLocal,
    });
  } catch (error) {
    console.error('Error building digest:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error stack:', errorStack);

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

