/**
 * Mock cover generator (LOCAL ONLY — never writes to public/weekly-images).
 *
 * Regenerates weekly cover images with the CURRENT cover code (fixed Scene
 * Director prompt v4 + gpt-image-1 quality:high) using each week's LIVE homepage
 * top articles, and writes them to mock/ alongside an HTML gallery comparing
 * NEW vs the LIVE production cover. Reuses the production helpers
 * (generateCoverScenePrompt, integrateNegativePrompt, generateCoverImage) so the
 * output faithfully mirrors what production would render.
 *
 * Usage:
 *   npm run cover:mock -- --weeks=2026-W35,2026-W36,2026-W37
 * Output: mock/cover-<week>.png + mock/covers.html
 */

import { promises as fs } from 'fs';
import path from 'path';
import { loadEnv } from '../lib/env';
import { generateCoverScenePrompt, type ArticleInput } from '../digest/sceneDirector';
import { integrateNegativePrompt, generateCoverImage } from '../digest/generateCoverImage';
import type { WeeklyDigest } from '../lib/types';

loadEnv();

// Matches regenerateCover.extractHomepageTopArticles: Ecommerce top 2 + Jewellery top 1.
function homepageTopArticles(digest: WeeklyDigest): ArticleInput[] {
  const out: ArticleInput[] = [];
  const ecom = digest.topics?.Ecommerce_Retail_Tech?.top ?? [];
  for (const a of ecom.slice(0, 2)) out.push({ title: a.title, source: a.source, snippet: a.snippet, aiSummary: a.aiSummary, rerankWhy: (a as { rerankWhy?: string }).rerankWhy });
  const jewel = digest.topics?.Jewellery_Industry?.top ?? [];
  if (jewel[0]) { const a = jewel[0]; out.push({ title: a.title, source: a.source, snippet: a.snippet, aiSummary: a.aiSummary, rerankWhy: (a as { rerankWhy?: string }).rerankWhy }); }
  return out;
}

async function main() {
  let weeks = ['2026-W35', '2026-W36', '2026-W37'];
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--weeks=')) weeks = arg.slice('--weeks='.length).split(',').map(s => s.trim()).filter(Boolean);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const outDir = path.join(process.cwd(), 'mock');
  await fs.mkdir(outDir, { recursive: true });
  const results: { week: string; ok: boolean; concept?: string }[] = [];

  for (const week of weeks) {
    console.log(`\n[cover:mock] ${week} — building prompt + image...`);
    let digest: WeeklyDigest;
    try {
      digest = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'digests', `${week}.json`), 'utf-8'));
    } catch {
      console.warn(`[cover:mock] no live digest for ${week}, skipping`);
      results.push({ week, ok: false });
      continue;
    }
    const articles = homepageTopArticles(digest);
    if (!articles.length) { console.warn(`[cover:mock] ${week}: no homepage articles`); results.push({ week, ok: false }); continue; }

    const scene = await generateCoverScenePrompt(week, articles, 'safe');
    const finalPrompt = integrateNegativePrompt(scene.finalImagePrompt, scene.negativePrompt);
    const outPath = path.join(outDir, `cover-${week}.png`);
    const res = await generateCoverImage(finalPrompt, outPath, apiKey);
    results.push({ week, ok: res.success, concept: scene.concept });
    console.log(`[cover:mock] ${week}: ${res.success ? 'OK' : 'FAILED'} — concept "${scene.concept}"`);
  }

  // Build comparison gallery
  const rows = weeks.map(week => {
    const r = results.find(x => x.week === week);
    return `
      <section>
        <h2>${week}${r?.concept ? ` — <span class="concept">${r.concept}</span>` : ''}</h2>
        <div class="pair">
          <figure><figcaption>NEW (v4 prompt, quality:high)</figcaption>
            <img src="cover-${week}.png" alt="new cover ${week}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'missing',textContent:'not generated'}))"></figure>
          <figure><figcaption>LIVE (current production)</figcaption>
            <img src="../public/weekly-images/${week}.png" alt="live cover ${week}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'missing',textContent:'no live image'}))"></figure>
        </div>
      </section>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cover mock — new vs live</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; background:#f6f7f9; color:#1a1a1a; }
  header { background:#10233b; color:#fff; padding:18px 24px; }
  header h1 { margin:0; font-size:18px; } header p { margin:4px 0 0; opacity:.8; font-size:13px; }
  section { max-width:1200px; margin:20px auto; padding:0 16px; }
  h2 { font-size:15px; border-bottom:2px solid #c9a44a; padding-bottom:6px; }
  .concept { font-weight:400; color:#b26b00; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  figure { margin:0; } figcaption { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#666; margin-bottom:6px; }
  img { width:100%; border-radius:8px; border:1px solid #ddd; display:block; }
  .missing { padding:40px; text-align:center; color:#999; background:#eee; border-radius:8px; font-style:italic; }
  @media (prefers-color-scheme: dark) { body{background:#14161a;color:#e8e8e8;} img{border-color:#333;} .missing{background:#222;} }
</style></head><body>
<header><h1>Cover comparison — new vs live</h1><p>Left = regenerated with the fixed Scene Director prompt (v4) at quality:high. Right = the current production cover. Local preview only — not published.</p></header>
${rows}
</body></html>`;
  const galleryPath = path.join(outDir, 'covers.html');
  await fs.writeFile(galleryPath, html, 'utf-8');
  console.log(`\n[cover:mock] ✓ Gallery: ${galleryPath}`);
  console.log(`[cover:mock] Open: file:///${galleryPath.replace(/\\/g, '/')}`);
}

main().catch(err => { console.error('[cover:mock] Fatal:', err); process.exit(1); });
