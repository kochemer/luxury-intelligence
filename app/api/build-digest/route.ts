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
import { promises as fs } from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { buildWeeklyDigest } from '@/digest/buildWeeklyDigest';

export async function POST() {
  try {
    const now = DateTime.now().setZone('Europe/Copenhagen');
    const year = now.year;
    const weekNumber = now.weekNumber;
    const weekLabel = `${year}-W${weekNumber.toString().padStart(2, '0')}`;

    console.log(`API: Building digest for week: ${weekLabel}\n`);

    const digest = await buildWeeklyDigest(weekLabel);

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

