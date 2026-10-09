/**
 * Build the weekly podcast for one week: `npm run podcast [-- --week=YYYY-Www]`.
 *
 * A thin CLI over podcast/buildWeeklyPodcast.ts, the module the weekly
 * pipeline runs. Until 2026-10-09 this file was a separate 320-line copy that
 * had drifted: it still tried ElevenLabs first, never compressed the MP3 and
 * never wrote the `fileSize` the RSS feed needs. Keep logic in the module.
 */
import { loadEnv } from '../lib/env';
import { getCurrentDigestWeek, validateWeekLabel } from '../lib/utils/getCurrentDigestWeek';
import { buildWeeklyPodcast } from '../podcast/buildWeeklyPodcast';

loadEnv();

function parseWeek(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--week' && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith('--week=')) return args[i].split('=')[1];
  }
  return null;
}

async function main() {
  const weekLabel = parseWeek(process.argv.slice(2)) ?? getCurrentDigestWeek();
  validateWeekLabel(weekLabel);

  console.log(`[Podcast] Generating podcast for ${weekLabel}...`);
  const result = await buildWeeklyPodcast(weekLabel);
  console.log(`[Podcast] ✓ Script: ${result.scriptPath}`);
  console.log(`[Podcast] ✓ Audio:  ${result.audioPath}`);
}

main().catch((error) => {
  console.error('[Podcast] Fatal error:', error);
  process.exit(1);
});
