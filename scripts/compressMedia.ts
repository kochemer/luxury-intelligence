/**
 * One-off (safe to re-run): shrink the media already in public/ so each
 * Vercel deployment is smaller. New episodes and covers are compressed by the
 * pipeline itself; this catches up the existing ones.
 *
 * - public/podcast/YYYY-Www.mp3 → 64 kbps mono, and the matching
 *   data/weeks/{week}/podcast.json fileSize (the RSS enclosure length) updated
 * - public/weekly-images/*.png → 256-colour palette PNG, same name and size
 *
 * Files already compressed are skipped. Usage: npm run media:compress
 */

import { promises as fs } from 'fs';
import path from 'path';
import { compressPodcastMp3 } from '../podcast/compressAudio';
import { compressCoverPng } from '../digest/compressCoverImage';

const root = process.cwd();
const mb = (n: number) => (n / 1e6).toFixed(1);

async function compressPodcasts(): Promise<[number, number]> {
  const dir = path.join(root, 'public', 'podcast');
  const files = (await fs.readdir(dir)).filter(f => /^\d{4}-W\d{1,2}\.mp3$/.test(f)).sort();
  let before = 0, after = 0;

  for (const f of files) {
    const file = path.join(dir, f);
    const week = f.replace('.mp3', '');
    const oldSize = (await fs.stat(file)).size;
    const changed = await compressPodcastMp3(file);
    const newSize = (await fs.stat(file)).size;
    before += oldSize; after += newSize;

    // Always reconcile, so a run interrupted between the two writes heals.
    const metaPath = path.join(root, 'data', 'weeks', week, 'podcast.json');
    let metaNote = 'no podcast.json';
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
      if (meta.audioPath === `/podcast/${f}` && meta.fileSize !== newSize) {
        meta.fileSize = newSize;
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        metaNote = 'fileSize updated';
      } else {
        metaNote = 'fileSize ok';
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    console.log(`${f}: ${mb(oldSize)} → ${mb(newSize)} MB${changed ? '' : ' (already compressed)'}, ${metaNote}`);
  }
  return [before, after];
}

async function compressCovers(): Promise<[number, number]> {
  const dir = path.join(root, 'public', 'weekly-images');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.png')).sort();
  let before = 0, after = 0;

  for (const f of files) {
    const file = path.join(dir, f);
    const input = await fs.readFile(file);
    const output = await compressCoverPng(input);
    if (output !== input) await fs.writeFile(file, output);
    before += input.length; after += output.length;
    console.log(`${f}: ${mb(input.length)} → ${mb(output.length)} MB`);
  }
  return [before, after];
}

async function main() {
  const [pb, pa] = await compressPodcasts();
  const [cb, ca] = await compressCovers();
  console.log(`\nPodcasts: ${mb(pb)} → ${mb(pa)} MB`);
  console.log(`Covers:   ${mb(cb)} → ${mb(ca)} MB`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
