import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'dotenv';
import { type Variant } from '../digest/sceneDirector';
import { generateWeeklyCoverImage } from '../digest/generateCoverImage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local (synchronous for top-level)
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
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
  } catch (err) {
    // .env.local not found, continue
  }
}

loadEnv();

type CoverInput = {
  weekLabel: string;
  homepageTopArticles: Array<{
    title: string;
    source?: string;
    snippet?: string;
    aiSummary?: string;
    rerankWhy?: string;
  }>;
  prompt: string;
  finalImagePrompt?: string; // New field from Scene Director
  coverStyle: 'realistic' | 'illustration';
  variant?: 'safe' | 'fun'; // New field
  generatedAt: string;
};

/**
 * Update digest JSON with new cover image path
 */
async function updateDigestCoverPath(weekLabel: string, imagePath: string): Promise<void> {
  const digestPath = path.join(__dirname, '../data/digests', `${weekLabel}.json`);
  
  try {
    const digestContent = await fs.readFile(digestPath, 'utf-8');
    const digest = JSON.parse(digestContent);
    
    digest.coverImageUrl = imagePath;
    digest.coverImageAlt = `Weekly cover illustration for ${weekLabel}`;
    
    await fs.writeFile(digestPath, JSON.stringify(digest, null, 2), 'utf-8');
    console.log(`✓ Updated digest JSON with new cover path`);
  } catch (error) {
    console.warn(`⚠ Could not update digest JSON: ${(error as Error).message}`);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): { weekLabel: string; variant: Variant } {
  const args = process.argv.slice(2);
  let weekLabel: string | null = null;
  let variant: Variant = 'safe';
  
  for (const arg of args) {
    if (arg.startsWith('--week=')) {
      weekLabel = arg.split('=')[1];
      if (!/^\d{4}-W\d{1,2}$/.test(weekLabel)) {
        console.error(`Invalid week format: ${weekLabel}. Expected YYYY-W## (e.g. 2026-W01)`);
        process.exit(1);
      }
    } else if (arg.startsWith('--variant=')) {
      const v = arg.split('=')[1];
      if (v === 'safe' || v === 'fun') {
        variant = v;
      } else {
        console.warn(`Invalid variant: ${v}. Using default: safe`);
      }
    }
  }
  
  if (!weekLabel) {
    console.error('Error: --week=YYYY-W## is required');
    console.error('Usage: npm run cover -- --week=2026-W01 [--variant=safe|fun]');
    process.exit(1);
  }
  
  return { weekLabel, variant };
}

/**
 * Main function
 */
async function main() {
  const { weekLabel, variant } = parseArgs();
  
  console.log(`Regenerating cover image for week: ${weekLabel}`);
  console.log(`  Variant: ${variant}`);
  console.log('');
  
  // Load cover input artifact
  const coverInputPath = path.join(__dirname, '../data/weeks', weekLabel, 'cover-input.json');
  
  let coverInput: CoverInput;
  try {
    const content = await fs.readFile(coverInputPath, 'utf-8');
    coverInput = JSON.parse(content);
  } catch (error) {
    console.error(`Error: Could not load cover input from ${coverInputPath}`);
    console.error(`Make sure you've run buildWeeklyDigest for week ${weekLabel} first.`);
    process.exit(1);
  }
  
  console.log(`Loaded cover input for ${coverInput.weekLabel}`);
  console.log(`  Articles: ${coverInput.homepageTopArticles.map(a => a.title).join(', ')}`);
  console.log('');

  // Use the new 2-step pipeline
  const coverResult = await generateWeeklyCoverImage(
    weekLabel,
    coverInput.homepageTopArticles,
    true, // regenCover = true
    coverInput.coverStyle || 'realistic',
    variant
  );
  
  if (coverResult.success && coverResult.imagePath) {
    // Update digest JSON
    await updateDigestCoverPath(weekLabel, coverResult.imagePath);
    console.log('');
    console.log(`✓ Cover image regeneration complete!`);
    console.log(`  Image: public/weekly-images/${weekLabel}.png`);
    console.log(`  Digest updated: data/digests/${weekLabel}.json`);
  } else {
    console.error('✗ Cover image generation failed');
    process.exit(1);
  }
}

// Run if invoked directly
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

