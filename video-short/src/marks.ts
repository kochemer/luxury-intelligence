/**
 * Brand marks and icons for scenes.
 *
 * A scene can name up to 2 companies/products ("entities") and one generic
 * icon. Each entity becomes:
 *   - its logo, if Simple Icons (CC0 SVGs) has an exact name match that isn't
 *     a known collision, drawn in the brand's own color, unaltered; otherwise
 *   - a typeset wordmark of the name (no logo is faked or scraped).
 * Many luxury brands and Amazon are NOT in Simple Icons (several asked to be
 * removed), so wordmarks are the normal case for them.
 *
 * Logos identify companies in news commentary. Every entity must be named in
 * the source article, and meta.json lists the logos used for review before
 * anything is published.
 */
import { readFileSync } from 'fs';
import path from 'path';
import * as simpleIcons from 'simple-icons';

export interface Mark {
  kind: 'logo' | 'wordmark' | 'icon';
  name: string;
  svg?: string;
  color?: string;
}

/** Simple Icons titles that collide with a different, better-known company. */
const COLLISIONS = new Set(['hermes' /* parcel carrier, not Hermès */, 'muse', 'coach', 'guess', 'fossil', 'next', 'swatch']);

/** Generic icons the script may use (lucide-static, ISC license). */
export const ICONS = [
  'bot', 'brain', 'ban', 'store', 'shopping-cart', 'shopping-bag', 'handbag', 'credit-card', 'wallet',
  'badge-dollar-sign', 'gem', 'crown', 'sparkles', 'megaphone', 'eye', 'lock', 'door-closed', 'shield-x',
  'trending-up', 'trending-down', 'package', 'truck', 'users', 'user', 'search', 'smartphone', 'globe',
  'factory', 'scissors', 'shirt', 'watch', 'percent', 'tag', 'receipt', 'chart-line', 'scale', 'gavel',
  'flame', 'rocket', 'clock', 'hourglass', 'ghost', 'skull', 'party-popper', 'hand-coins', 'piggy-bank',
] as const;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const byTitle = new Map<string, { title: string; svg: string; hex: string }>();
for (const v of Object.values(simpleIcons) as any[]) {
  if (v && typeof v === 'object' && v.svg && v.title) byTitle.set(fold(v.title), v);
}

function iconSvg(name: string): string | null {
  try {
    const file = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
    return readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
  } catch { return null; }
}

export function resolveMarks(entities: string[], icon: string, source: string, warn: (m: string) => void): Mark[] {
  const marks: Mark[] = [];
  const src = fold(source);
  for (const name of entities.slice(0, 2)) {
    if (!name.trim()) continue;
    if (!src.includes(fold(name))) { warn(`entity "${name}" is not named in the source, not shown`); continue; }
    const hit = byTitle.get(fold(name));
    if (hit && !COLLISIONS.has(fold(name))) {
      marks.push({ kind: 'logo', name, svg: hit.svg.replace('<svg ', `<svg fill="#${hit.hex}" `), color: `#${hit.hex}` });
    } else {
      marks.push({ kind: 'wordmark', name });
    }
  }
  if (icon) {
    const svg = (ICONS as readonly string[]).includes(icon) ? iconSvg(icon) : null;
    if (svg) marks.push({ kind: 'icon', name: icon, svg });
    else warn(`icon "${icon}" is not in the allowlist, not shown`);
  }
  return marks;
}
