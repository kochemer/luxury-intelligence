/**
 * Shrink a weekly cover PNG by quantizing it to a 256-colour palette
 * (~70% smaller, same dimensions, still a PNG).
 *
 * It stays a PNG on purpose: sent newsletters link to
 * /weekly-images/{week}.png, and Outlook desktop can't show WebP. Every file
 * in public/weekly-images/ ships in every Vercel deployment, and Hobby
 * deployment storage is 10 GB for the whole account (docs/operations.md § Storage).
 */

import sharp from 'sharp';

/** Returns the smaller of the quantized PNG and the original. */
export async function compressCoverPng(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  if (meta.format !== 'png' || meta.isPalette) return input;

  const output = await sharp(input)
    .png({ palette: true, quality: 90, effort: 10, dither: 1.0, compressionLevel: 9 })
    .toBuffer();
  return output.length < input.length ? output : input;
}
