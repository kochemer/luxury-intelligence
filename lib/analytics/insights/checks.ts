/**
 * Checks a proposed insight must pass before it is stored. The agent's output
 * has no human review (owner, 2026-10-16), so these are the review: a proposal
 * that fails any of them is dropped and nothing is written. A missing tile
 * costs little; a wrong number on the owner's dashboard costs trust.
 *
 * Pure: no I/O, no clock. The rules, in short:
 *
 *  - Evidence ids exist in the pack; at most MAX_EVIDENCE of them, and each is
 *    used (by a number in the text or by the chart), so citing is not a licence.
 *  - Chart values come only from referenced facts, never from the model.
 *  - Every number in the text equals a cited fact's value at the precision
 *    written, or is a percentage a/b·100 of two cited facts. No other arithmetic.
 *  - Every date in the text falls inside the periods of the cited facts.
 *  - Length limits, no URLs or email addresses.
 *  - Not a near-duplicate of an active or removed insight.
 *  - `retire` is required when MAX_ACTIVE are active, and must name one of them.
 */

import type {
  CheckedInsight, DataPack, EvidenceRef, ExistingInsight, Fact, InsightChart,
  InsightSource, InsightTile, Period, Proposal, SeriesFact,
} from './types';

export const MAX_ACTIVE = 6;
export const MAX_EVIDENCE = 8;
export const MAX_BARS = 5;
/** Share of the new evidence ids that may already appear in one existing insight. */
export const MAX_EVIDENCE_OVERLAP = 0.5;
export const LIMITS = { eyebrow: 32, hero: 8, unit: 16, summary: 90, detail: 180, chartLabel: 24 } as const;

export type CheckResult =
  | { ok: true; insight: CheckedInsight }
  | { ok: false; failures: string[] };

export interface PackIndex {
  facts: Map<string, Fact>;
  series: Map<string, SeriesFact>;
}

export function packIndex(pack: DataPack): PackIndex {
  return {
    facts: new Map(pack.facts.map(f => [f.id, f])),
    series: new Map(pack.series.map(s => [s.id, s])),
  };
}

// ── Numbers ──────────────────────────────────────────────────────────────────

/** Round half up after dropping binary noise (1.005 → 1.01 at 2 decimals). */
export function roundTo(x: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(Number((x * p).toPrecision(12))) / p;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export interface NumberToken {
  raw: string;
  base: number;
  decimals: number;
  percent: boolean;
  scale: number;
  /** "28 days" / "4 weeks": a duration, matched against the cited periods. */
  unit: 'days' | 'weeks' | null;
}

// Not preceded by a word character or a dot ("D7", "v1.2", ".5"); thousands
// separators, optional decimals, then % / percent, a k/m suffix, or a duration.
const NUMBER_RE = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(%|percent\b|per cent\b)|([kKmM])(?![A-Za-z])|\s+(days?|weeks?)\b)?/g;

export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const intPart = m[1]!.replace(/,/g, '');
    const decimals = m[2]?.length ?? 0;
    out.push({
      raw: m[0].trim(),
      base: Number(m[2] ? `${intPart}.${m[2]}` : intPart),
      decimals,
      percent: !!m[3],
      scale: m[4] ? (m[4].toLowerCase() === 'k' ? 1e3 : 1e6) : 1,
      unit: m[5] ? (m[5].toLowerCase().startsWith('d') ? 'days' : 'weeks') : null,
    });
  }
  return out;
}

/** Words that state a quantity without a digit. "one" is left out: it is mostly a pronoun. */
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozens?|hundreds?|thousands?|millions?|twice|thrice|double[sd]?|triple[sd]?|half|halves|thirds?|quarters?)\b/gi;

const periodDays = (p: Period) => (Date.parse(`${p.end}T00:00:00Z`) - Date.parse(`${p.start}T00:00:00Z`)) / 86_400_000 + 1;

interface Cited {
  id: string;
  value: number;
}

/** Which cited ids a written number is grounded in; empty = not grounded. */
function groundNumber(t: NumberToken, cited: Cited[]): string[] {
  const direct = cited.filter(c => same(roundTo(c.value / t.scale, t.decimals), roundTo(t.base, t.decimals)));
  const ids = direct.map(c => c.id);
  if (t.percent) {
    for (const a of cited) {
      for (const b of cited) {
        if (a === b || b.value === 0) continue;
        if (same(roundTo((a.value / b.value) * 100, t.decimals), roundTo(t.base, t.decimals))) ids.push(a.id, b.id);
      }
    }
  }
  return [...new Set(ids)];
}

/** True when a duration like "28 days" is grounded by a cited period (it then uses no fact). */
function durationGrounded(t: NumberToken, periods: Period[]): boolean {
  return !!t.unit && periods.some(p => (t.unit === 'days' ? periodDays(p) === t.base : periodDays(p) / 7 === t.base));
}

// ── Dates ────────────────────────────────────────────────────────────────────

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DASH = '\\s*[–—-]\\s*';
const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const monthNum = (s: string) => MONTH_NUM[s.slice(0, 3).toLowerCase()]!;

/** What a date expression claims. Year-less expressions are tried against each year the cited facts span. */
type DateClaim =
  | { kind: 'week'; week: number; year?: number }
  | { kind: 'days'; d1: number; m1: number; d2: number; m2: number; year?: number }
  | { kind: 'months'; m1: number; m2: number; year?: number }
  | { kind: 'year'; year: number };

export interface DateExpr { raw: string; claim: DateClaim }

const DATE_PATTERNS: Array<{ re: RegExp; make: (m: RegExpMatchArray) => DateClaim }> = [
  { re: /\b(\d{4})-W(\d{2})\b/g, make: m => ({ kind: 'week', year: +m[1]!, week: +m[2]! }) },
  { re: /\b[Ww]eek (\d{1,2})\b|\bW(\d{1,2})\b/g, make: m => ({ kind: 'week', week: +(m[1] ?? m[2]!) }) },
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, make: m => ({ kind: 'days', year: +m[1]!, m1: +m[2]!, d1: +m[3]!, m2: +m[2]!, d2: +m[3]! }) },
  { re: new RegExp(`\\b(\\d{1,2})\\s+(${MONTH})${DASH}(\\d{1,2})\\s+(${MONTH})(?:\\s+(\\d{4}))?\\b`, 'g'),
    make: m => ({ kind: 'days', d1: +m[1]!, m1: monthNum(m[2]!), d2: +m[3]!, m2: monthNum(m[4]!), year: m[5] ? +m[5] : undefined }) },
  { re: new RegExp(`\\b(\\d{1,2})${DASH}(\\d{1,2})\\s+(${MONTH})(?:\\s+(\\d{4}))?\\b`, 'g'),
    make: m => ({ kind: 'days', d1: +m[1]!, d2: +m[2]!, m1: monthNum(m[3]!), m2: monthNum(m[3]!), year: m[4] ? +m[4] : undefined }) },
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH})(?:\\s+(\\d{4}))?\\b`, 'g'),
    make: m => ({ kind: 'days', d1: +m[1]!, d2: +m[1]!, m1: monthNum(m[2]!), m2: monthNum(m[2]!), year: m[3] ? +m[3] : undefined }) },
  { re: new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, 'g'),
    make: m => ({ kind: 'days', d1: +m[2]!, d2: +m[2]!, m1: monthNum(m[1]!), m2: monthNum(m[1]!), year: m[3] ? +m[3] : undefined }) },
  { re: new RegExp(`\\b(${MONTH})${DASH}(${MONTH})(?:\\s+(\\d{4}))?\\b`, 'g'),
    make: m => ({ kind: 'months', m1: monthNum(m[1]!), m2: monthNum(m[2]!), year: m[3] ? +m[3] : undefined }) },
  { re: new RegExp(`\\b(${MONTH})(?:\\s+(\\d{4}))?\\b`, 'g'),
    make: m => ({ kind: 'months', m1: monthNum(m[1]!), m2: monthNum(m[1]!), year: m[2] ? +m[2] : undefined }) },
];

/**
 * Finds the date expressions in `text`. Returns them with the text they came
 * from removed, so what is left can be read for counts. A bare four-digit year
 * that equals a cited fact value is left in the text as a count.
 */
export function extractDates(text: string, citedValues: number[] = []): { dates: DateExpr[]; rest: string } {
  const dates: DateExpr[] = [];
  let rest = text;
  for (const { re, make } of DATE_PATTERNS) {
    rest = rest.replace(re, (...args) => {
      const groups = args.slice(0, -2).filter(a => typeof a === 'string' || a === undefined) as string[];
      const m = Object.assign(groups, { index: 0 }) as unknown as RegExpMatchArray;
      dates.push({ raw: String(args[0]), claim: make(m) });
      return ' ';
    });
  }
  rest = rest.replace(/\b(20\d{2})\b/g, (whole, y: string) => {
    if (citedValues.includes(Number(y))) return whole;
    dates.push({ raw: whole, claim: { kind: 'year', year: Number(y) } });
    return ' ';
  });
  return { dates, rest };
}

const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const validDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Monday and Sunday of ISO week `w` of `y`, or null if the week doesn't exist. */
function isoWeek(y: number, w: number): Period | null {
  if (w < 1 || w > 53) return null;
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday1 = Date.UTC(y, 0, 4) - ((jan4.getUTCDay() + 6) % 7) * 86_400_000;
  const start = new Date(monday1 + (w - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
  // Week 53 only exists in some years: it must still start in year `y`.
  if (+start.slice(0, 4) > y) return null;
  return { start, end: addDays(start, 6) };
}

/** Merges periods that overlap or touch, so "Jan" and "Feb" facts cover "Jan–Feb". */
export function mergePeriods(periods: Period[]): Period[] {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const out: Period[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && p.start <= addDays(last.end, 1)) {
      if (p.end > last.end) last.end = p.end;
    } else out.push({ ...p });
  }
  return out;
}

const contains = (union: Period[], start: string, end: string) => union.some(u => u.start <= start && end <= u.end);

/**
 * Whether a date claim is covered by the cited periods. Days and weeks must lie
 * inside them. A month counts when its first day does (so a month still in
 * progress is fine, a month the data never reached is not); a year counts when
 * any cited period touches it.
 */
function dateCovered(claim: DateClaim, periods: Period[]): boolean {
  const union = mergePeriods(periods);
  const years = [...new Set(periods.flatMap(p => [+p.start.slice(0, 4), +p.end.slice(0, 4)]))];
  const tryYears = ('year' in claim && claim.year !== undefined) ? [claim.year] : years;
  switch (claim.kind) {
    case 'year':
      return periods.some(p => +p.start.slice(0, 4) <= claim.year && claim.year <= +p.end.slice(0, 4));
    case 'week':
      return tryYears.some(y => { const w = isoWeek(y, claim.week); return !!w && contains(union, w.start, w.end); });
    case 'days':
      return tryYears.some(y => {
        if (!validDay(y, claim.m1, claim.d1) || !validDay(y, claim.m2, claim.d2)) return false;
        const s = iso(y, claim.m1, claim.d1), e = iso(y, claim.m2, claim.d2);
        return s <= e && contains(union, s, e);
      });
    case 'months':
      return tryYears.some(y => {
        if (claim.m2 < claim.m1) return false;
        for (let m = claim.m1; m <= claim.m2; m++) {
          const first = iso(y, m, 1);
          if (!contains(union, first, first)) return false;
        }
        return true;
      });
  }
}

// ── Shape and text rules ─────────────────────────────────────────────────────

const URL_RE = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|org|net|io|dk|ai|co|app|dev|me|eu|uk|de|es)\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

const TEXT_FIELDS = ['eyebrow', 'hero', 'unit', 'summary', 'detail'] as const;
type TextField = typeof TEXT_FIELDS[number];

function textProblems(name: string, value: unknown, max: number): string[] {
  if (typeof value !== 'string' || !value.trim()) return [`${name} is empty or not text`];
  const out: string[] = [];
  if (value.trim().length > max) out.push(`${name} is ${value.trim().length} characters (max ${max})`);
  if (URL_RE.test(value)) out.push(`${name} contains a URL or domain name`);
  if (EMAIL_RE.test(value)) out.push(`${name} contains an email address`);
  if (/[\r\n\t<>`]/.test(value)) out.push(`${name} contains a line break, tab, tag or backtick`);
  return out;
}

// ── The check ────────────────────────────────────────────────────────────────

export function checkProposal(
  proposal: Proposal,
  pack: DataPack,
  active: ExistingInsight[],
  removed: ExistingInsight[],
): CheckResult {
  const failures: string[] = [];
  const idx = packIndex(pack);
  const p = (proposal ?? {}) as Partial<Proposal>;

  // 1. Text and lengths
  for (const f of TEXT_FIELDS) failures.push(...textProblems(f, p[f], LIMITS[f]));

  // 2. Evidence ids
  const evidenceIds = Array.isArray(p.evidence) && p.evidence.every(e => typeof e === 'string')
    ? [...new Set(p.evidence as string[])] : null;
  if (!evidenceIds || evidenceIds.length === 0) failures.push('evidence must be a non-empty list of fact ids');
  else if (evidenceIds.length > MAX_EVIDENCE) failures.push(`evidence cites ${evidenceIds.length} ids (max ${MAX_EVIDENCE})`);
  const unknown = (evidenceIds ?? []).filter(id => !idx.facts.has(id) && !idx.series.has(id));
  for (const id of unknown) failures.push(`evidence id "${id}" is not in the data pack`);
  const known = (evidenceIds ?? []).filter(id => !unknown.includes(id));

  // 3. Chart: resolve references to numbers
  const used = new Set<string>();
  const chartLabels: string[] = [];
  let chart: InsightChart | undefined;
  let weeklyRef: { seriesId: string; value: number; key: string } | null = null;
  const needEvidence = (id: string, what: string): boolean => {
    if (!known.includes(id)) { failures.push(`chart ${what} "${id}" is not in evidence`); return false; }
    used.add(id);
    return true;
  };
  if (p.chart !== undefined) {
    const c = p.chart as unknown as Record<string, unknown>;
    if (c.kind === 'weekly') {
      const s = typeof c.seriesId === 'string' ? idx.series.get(c.seriesId) : undefined;
      if (!s) failures.push(`weekly chart series "${String(c.seriesId)}" is not a series in the data pack`);
      else if (needEvidence(s.id, 'series')) {
        const at = s.points.findIndex(pt => pt.key === c.highlight);
        if (at < 0) failures.push(`weekly chart highlight "${String(c.highlight)}" is not a point of ${s.id}`);
        else if (s.points.length < 2) failures.push(`weekly chart needs at least 2 points, ${s.id} has ${s.points.length}`);
        else {
          chart = { kind: 'weekly', labels: s.points.map(pt => pt.key), values: s.points.map(pt => pt.value), highlight: at };
          weeklyRef = { seriesId: s.id, value: s.points[at]!.value, key: s.points[at]!.key };
        }
      }
    } else if (c.kind === 'share') {
      const part = typeof c.partId === 'string' ? idx.facts.get(c.partId) : undefined;
      const whole = typeof c.wholeId === 'string' ? idx.facts.get(c.wholeId) : undefined;
      if (!part) failures.push(`share chart part "${String(c.partId)}" is not a fact in the data pack`);
      if (!whole) failures.push(`share chart whole "${String(c.wholeId)}" is not a fact in the data pack`);
      for (const k of ['partLabel', 'restLabel'] as const) {
        failures.push(...textProblems(`chart ${k}`, c[k], LIMITS.chartLabel));
        if (typeof c[k] === 'string') chartLabels.push(c[k] as string);
      }
      if (part && whole && needEvidence(part.id, 'part') && needEvidence(whole.id, 'whole')) {
        if (whole.value <= 0) failures.push('share chart whole must be above 0');
        else if (part.value > whole.value) failures.push(`share chart part (${part.id}) is larger than its whole (${whole.id})`);
        else if (typeof c.partLabel === 'string' && typeof c.restLabel === 'string') {
          chart = { kind: 'share', part: part.value, whole: whole.value, partLabel: c.partLabel.trim(), restLabel: c.restLabel.trim() };
        }
      }
    } else if (c.kind === 'bars') {
      const rows = Array.isArray(c.rows) ? c.rows as Array<Record<string, unknown>> : null;
      if (!rows || rows.length < 2) failures.push('bars chart needs at least 2 rows');
      else if (rows.length > MAX_BARS) failures.push(`bars chart has ${rows.length} rows (max ${MAX_BARS})`);
      else {
        const out: Array<{ label: string; value: number }> = [];
        let good = true;
        const seen = new Set<string>();
        for (const r of rows) {
          const f = typeof r?.factId === 'string' ? idx.facts.get(r.factId) : undefined;
          failures.push(...textProblems('chart row label', r?.label, LIMITS.chartLabel));
          if (typeof r?.label === 'string') chartLabels.push(r.label);
          if (!f) { failures.push(`bars chart fact "${String(r?.factId)}" is not a fact in the data pack`); good = false; continue; }
          if (seen.has(f.id)) { failures.push(`bars chart uses ${f.id} twice`); good = false; continue; }
          seen.add(f.id);
          if (!needEvidence(f.id, 'fact')) { good = false; continue; }
          if (typeof r.label === 'string') out.push({ label: r.label.trim(), value: f.value });
        }
        if (good && out.length === rows.length) chart = { kind: 'bars', rows: out };
      }
    } else failures.push(`chart kind "${String(c.kind)}" is not weekly, share or bars`);
  }

  // 4. Dates and numbers in the text (and chart labels), against cited facts only
  const cited: Cited[] = [];
  const periods: Period[] = [];
  for (const id of known) {
    const f = idx.facts.get(id);
    if (f) { cited.push({ id, value: f.value }); periods.push(f.period); continue; }
    const s = idx.series.get(id)!;
    periods.push(s.period);
    if (weeklyRef && weeklyRef.seriesId === id) cited.push({ id, value: weeklyRef.value });
  }
  const texts: Array<[string, string]> = [
    ...TEXT_FIELDS.filter(f => typeof p[f as TextField] === 'string').map(f => [f, p[f as TextField] as string] as [string, string]),
    ...chartLabels.map(l => ['chart label', l] as [string, string]),
  ];
  if (known.length > 0 && unknown.length === 0) {
    for (const [name, text] of texts) {
      const { dates, rest } = extractDates(text, cited.map(c => c.value));
      for (const d of dates) {
        if (!dateCovered(d.claim, periods)) {
          failures.push(`date "${d.raw.trim()}" in ${name} is outside the periods of the cited facts`);
        }
      }
      for (const w of rest.match(NUMBER_WORDS) ?? []) {
        failures.push(`${name} states a quantity in words ("${w}"); write the number so it can be checked`);
      }
      for (const t of extractNumbers(rest)) {
        if (durationGrounded(t, periods)) continue;
        const ids = groundNumber(t, cited);
        if (ids.length === 0) failures.push(`number "${t.raw}" in ${name} is not a cited fact's value${t.percent ? ' or a percentage of two cited facts' : ''}`);
        for (const id of ids) used.add(id);
      }
    }
    for (const id of known) {
      if (!used.has(id)) failures.push(`evidence "${id}" is not used by a number in the text or by the chart`);
    }
  }

  // 5. Near-duplicates: share of the NEW evidence ids that one existing insight already cites
  if (evidenceIds && evidenceIds.length > 0) {
    for (const [kind, list] of [['active', active], ['removed', removed]] as const) {
      for (const other of list) {
        const ids = new Set(other.evidence.map(e => e.id));
        const share = evidenceIds.filter(id => ids.has(id)).length / evidenceIds.length;
        if (share > MAX_EVIDENCE_OVERLAP) {
          failures.push(`near-duplicate of ${kind} insight ${other.id}: ${Math.round(share * 100)}% of the evidence is shared (max ${MAX_EVIDENCE_OVERLAP * 100}%)`);
        }
      }
    }
  }

  // 6. Retire rules
  if (active.length >= MAX_ACTIVE) {
    if (p.retire === undefined || p.retire === null) failures.push(`${active.length} insights are active, so one must be retired (retire is missing)`);
    else if (!active.some(a => a.id === p.retire)) failures.push(`retire ${String(p.retire)} is not an active insight`);
  } else if (p.retire !== undefined && p.retire !== null) {
    failures.push(`retire is not allowed with fewer than ${MAX_ACTIVE} active insights`);
  }

  if (failures.length > 0 || !evidenceIds) return { ok: false, failures };

  const tile: InsightTile = {
    eyebrow: p.eyebrow!.trim(), hero: p.hero!.trim(), unit: p.unit!.trim(),
    summary: p.summary!.trim(), detail: p.detail!.trim(),
    ...(chart ? { chart } : {}),
  };
  const evidence: EvidenceRef[] = known.map(id => {
    const f = idx.facts.get(id);
    if (f) return { id, value: f.value };
    return weeklyRef && weeklyRef.seriesId === id
      ? { id, value: weeklyRef.value, key: weeklyRef.key }
      : { id, value: null };
  });
  const sources = [...new Set(known.map(id => (idx.facts.get(id) ?? idx.series.get(id))!.source))] as InsightSource[];
  return { ok: true, insight: { tile, evidence, sources, ...(p.retire != null ? { retire: p.retire } : {}) } };
}
