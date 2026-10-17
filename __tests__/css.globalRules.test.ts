import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Guard for two site-wide CSS traps found 2026-10-16:
// 1. An unlayered `* { max-width: 100% }` beats every Tailwind max-w-* utility
//    (utilities live in a layer; unlayered CSS wins), so no container width applied.
// 2. `overflow-x: hidden` alone on html/body makes body the scroll container and
//    breaks position: sticky (header, homepage media column). `clip` avoids that.

const css = readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Content ranges (start, end) of every top-level `@layer base { ... }` block. */
function layerBaseRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /@layer\s+base\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    ranges.push([start, i - 1]);
  }
  return ranges;
}

const ranges = layerBaseRanges(css);
const inBase = (idx: number) => ranges.some(([s, e]) => idx >= s && idx < e);

/** Every match of a rule `selector { ...body... }` at a line start, with its index and body. */
function rules(selector: string): Array<{ index: number; body: string }> {
  const re = new RegExp(String.raw`(^|\n)\s*${selector}\s*\{([^{}]*)\}`, 'g');
  const out: Array<{ index: number; body: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push({ index: m.index + m[1].length, body: m[2] });
  return out;
}

test('universal max-width rule exists and only inside @layer base', () => {
  const found = rules('[*]').filter((r) => /max-width\s*:\s*100%/.test(r.body));
  assert.ok(found.length > 0, 'expected a `* { max-width: 100% }` rule');
  for (const r of found) assert.ok(inBase(r.index), '`* { max-width }` must be inside @layer base');
});

test('img max-width/height:auto rule is inside @layer base', () => {
  const found = rules('img').filter((r) => /max-width\s*:\s*100%/.test(r.body) && /height\s*:\s*auto/.test(r.body));
  assert.ok(found.length > 0, 'expected an img max-width rule');
  for (const r of found) assert.ok(inBase(r.index), 'img rule must be inside @layer base');
});

test('html and body use overflow-x: clip (hidden breaks position: sticky)', () => {
  for (const sel of ['html', 'body']) {
    const found = rules(sel).filter((r) => /overflow-x\s*:/.test(r.body));
    assert.ok(found.length > 0, `expected a ${sel} rule with overflow-x`);
    for (const r of found) assert.match(r.body, /overflow-x\s*:\s*clip/, `${sel} must set overflow-x: clip`);
  }
});
