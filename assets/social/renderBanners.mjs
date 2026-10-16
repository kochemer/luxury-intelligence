/**
 * Profile banners for LinkedIn, X and YouTube, in the site's masthead style
 * (navy, gold, Libre Baskerville with diamond rules). Writes PNGs next to this
 * file by screenshotting HTML in headless Chrome, so the real web fonts render.
 *
 *   node assets/social/renderBanners.mjs [path-to-chrome]
 *
 * Each banner keeps its text inside the area the platform never covers:
 * LinkedIn and X put the profile picture over the bottom-left, YouTube crops
 * everything outside a centred 1546×423 box on phones. See docs/distribution.md.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const chrome = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// w × h: output pixels. box: where the text block is centred, in px. s: type scale.
const BANNERS = [
  // LinkedIn page cover is 1128×191; rendered at 2× for sharp text.
  { name: 'linkedin-banner', w: 2256, h: 382, box: { x: 760, y: 0, w: 1420, h: 382 }, s: 1.0 },
  { name: 'x-banner', w: 1500, h: 500, box: { x: 420, y: 40, w: 1020, h: 360 }, s: 0.8 },
  { name: 'youtube-banner', w: 2560, h: 1440, box: { x: 507, y: 508, w: 1546, h: 423 }, s: 1.3 },
];

function html({ w, h, box, s }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=DM+Sans:wght@400;500&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
  body {
    background:
      radial-gradient(ellipse ${w * 0.55}px ${h * 0.9}px at ${box.x + box.w / 2}px ${box.y + box.h / 2}px, rgba(139,105,20,0.16), transparent 70%),
      linear-gradient(135deg, #1B2A4A 0%, #131F38 100%);
    position: relative;
  }
  /* Faint diamond lattice, echoing the site's BrandPattern. */
  body::before {
    content: ''; position: absolute; inset: 0; opacity: 0.07;
    background-image:
      linear-gradient(45deg, #C9A94E 1px, transparent 1px),
      linear-gradient(-45deg, #C9A94E 1px, transparent 1px);
    background-size: ${56 * s}px ${56 * s}px;
  }
  .box {
    position: absolute; left: ${box.x}px; top: ${box.y}px; width: ${box.w}px; height: ${box.h}px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .rule { display: flex; align-items: center; color: rgba(201,169,78,0.75); font-size: ${16 * s}px; }
  .rule i { display: block; height: 1px; background: rgba(201,169,78,0.45); }
  .top i { width: ${200 * s}px; } .bottom i { width: ${90 * s}px; }
  .rule b { font-weight: normal; margin: 0 ${16 * s}px; }
  h1 {
    margin: ${22 * s}px 0; font: 700 ${62 * s}px/1 'Libre Baskerville', Georgia, serif;
    letter-spacing: 0.2em; text-transform: uppercase; color: #FAF9F6; white-space: nowrap;
    text-shadow: 0 0 ${40 * s}px rgba(139,105,20,0.35);
  }
  p { margin: ${26 * s}px 0 0; font: 500 ${21 * s}px/1.4 'DM Sans', Arial, sans-serif; letter-spacing: 0.28em;
      text-transform: uppercase; color: #C9A94E; white-space: nowrap; }
  p.sub { margin-top: ${10 * s}px; font-weight: 400; color: rgba(250,249,246,0.7); letter-spacing: 0.22em; font-size: ${18 * s}px; }
</style></head><body>
  <div class="box">
    <div class="rule top"><i></i><b>◇</b><i></i></div>
    <h1>Luxury Intelligence</h1>
    <div class="rule bottom"><i></i><b>◇</b><i></i></div>
    <p>Ecommerce · Retail tech · Jewellery · AI</p>
    <p class="sub">Read · Listen · Watch · Free every Monday</p>
  </div>
</body></html>`;
}

const tmp = mkdtempSync(path.join(tmpdir(), 'banners-'));
try {
  for (const b of BANNERS) {
    const file = path.join(tmp, `${b.name}.html`);
    writeFileSync(file, html(b));
    const out = path.join(here, `${b.name}.png`);
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${b.w},${b.h}`, '--virtual-time-budget=8000', `--screenshot=${out}`,
      pathToFileURL(file).href,
    ], { stdio: 'ignore' });
    console.log(`wrote ${path.relative(process.cwd(), out)} (${b.w}×${b.h})`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
