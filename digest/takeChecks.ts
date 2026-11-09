/**
 * Take-only checks for "The Week in Context" (see generateEditorialTake.ts).
 * Pure functions, no I/O, unit-tested in __tests__/digest.takeChecks.test.ts.
 *
 * They run in addition to findStyleProblems() and only on the weekly take:
 * findStyleProblems() also gates social posts and summaries, where words like
 * "checkout" are legitimate, so the jargon and readability rules live here.
 */

import { findJargon, findStyleProblems } from '../lib/llm/houseStyle';

// ── Formats ───────────────────────────────────────────────────────────────────
export type TakeFormatId = 'connection' | 'number' | 'split' | 'what-changed' | 'open-question' | 'watch';

export const TAKE_FORMATS: ReadonlyArray<{ id: TakeFormatId; description: string }> = [
  { id: 'connection', description: 'Two stories that look unrelated. The first paragraph states what links them; that link is the point.' },
  { id: 'number', description: 'One single figure leads the take (first or second sentence). The rest explains what it means. Not a list of figures.' },
  { id: 'split', description: 'Two companies making opposite bets on the same question. The first paragraph names both bets.' },
  { id: 'what-changed', description: 'Name the before and the after explicitly: how something worked until now, and what is different now.' },
  { id: 'open-question', description: 'The question appears in the first or second sentence. Then one named piece of evidence for each side, and no verdict.' },
  { id: 'watch', description: 'The date or decision to watch appears in the first paragraph, then why it matters. Only allowed when the stories contain a dated upcoming event or decision.' },
];

export const TAKE_FORMAT_IDS: ReadonlyArray<TakeFormatId> = TAKE_FORMATS.map(f => f.id);

export function isTakeFormat(value: unknown): value is TakeFormatId {
  return typeof value === 'string' && (TAKE_FORMAT_IDS as ReadonlyArray<string>).includes(value);
}

/** Formats the model may choose from: every format except those used in the previous weeks. */
export function allowedFormats(excluded: ReadonlyArray<string | null | undefined>): TakeFormatId[] {
  const ex = new Set(excluded.filter(Boolean));
  return TAKE_FORMAT_IDS.filter(id => !ex.has(id));
}

/** Null when `format` is known and not excluded; otherwise the reason it is rejected. */
export function formatProblem(format: unknown, excluded: ReadonlyArray<string | null | undefined>): string | null {
  if (!isTakeFormat(format)) return `unknown format "${String(format)}"`;
  if (excluded.includes(format)) return `format "${format}" was used in one of the previous 2 weeks`;
  return null;
}

// ── Pronouns and banned phrases ───────────────────────────────────────────────
/**
 * First and second person. "I" and "us" are case-sensitive so the country "US"
 * and the word "us" are told apart ("US retailers" passes; "tells us" fails).
 * Contractions (I'm, we're, you'll) are caught because \b falls before the apostrophe.
 */
const PRONOUN_CASE_INSENSITIVE = /\b(?:me|my|myself|we|our|ours|ourselves|you|your|yours|yourself|yourselves)\b/gi;
const PRONOUN_CASE_SENSITIVE = /\b(?:I|[Uu]s)\b/g;

export function findPronouns(text: string): string[] {
  const clean = text.replace(/[’‘]/g, "'");
  const found = [
    ...(clean.match(PRONOUN_CASE_INSENSITIVE) ?? []),
    ...(clean.match(PRONOUN_CASE_SENSITIVE) ?? []),
  ].map(w => w.toLowerCase());
  return [...new Set(found)];
}

const BANNED_PHRASES: ReadonlyArray<[RegExp, string]> = [
  [/\bnext quarter\b/i, 'next quarter'],
  [/\bstrongest objection\b/i, 'strongest objection'],
  [/\bI think\b/, 'I think'],
  [/\bI would\b/, 'I would'],
  [/\b(?:brands|operators|retailers|businesses|companies|teams|jewellers?|luxury) (?:should|must|need to)\b/i, 'advice to a group ("brands should")'],
];

export function findBannedPhrases(text: string): string[] {
  const clean = text.replace(/[’‘]/g, "'");
  return BANNED_PHRASES.filter(([re]) => re.test(clean)).map(([, label]) => label);
}

// ── Repeated opening ──────────────────────────────────────────────────────────
/** First `n` words, lowercased, punctuation stripped. */
export function openingWords(text: string, n = 3): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(' ');
}

/** True when the take opens with the same first 3 words as any of `previous`. */
export function repeatsOpening(text: string, previous: ReadonlyArray<string>): boolean {
  const mine = openingWords(text);
  if (!mine) return false;
  return previous.some(p => openingWords(p) === mine);
}

// ── Readability ───────────────────────────────────────────────────────────────
export function splitSentences(text: string): string[] {
  // A full stop inside a number ("$5.7 billion") is not followed by a space, so
  // splitting on punctuation + whitespace keeps decimals intact.
  return text
    .split(/(?<=[.!?])["')”’]*\s+/)
    .map(s => s.trim())
    .filter(s => /[a-z0-9]/i.test(s));
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Rough English syllable count: vowel groups, minus a silent final "e". Digits count as 2. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return 0;
  if (/\d/.test(w)) return 2;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export type Readability = { grade: number; avgSentenceWords: number; sentences: number; words: number };

/** Flesch-Kincaid grade level plus average sentence length in words. */
export function readability(text: string): Readability {
  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter(w => /[a-z0-9]/i.test(w));
  if (!sentences.length || !words.length) return { grade: 0, avgSentenceWords: 0, sentences: 0, words: 0 };
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  const avg = words.length / sentences.length;
  const grade = 0.39 * avg + 11.8 * (syllables / words.length) - 15.59;
  return { grade, avgSentenceWords: avg, sentences: sentences.length, words: words.length };
}

/**
 * Calibrated 2026-11-09 on the 10 committed takes W35..W45 (W44 does not exist)
 * and the owner's W45 target example. Numbers (FK grade / avg sentence words):
 * - W35 15.1/26.6, W36 14.9/30.3, W37 10.6/17.9, W38 13.1/21.4, W39 12.7/17.4,
 *   W40 11.6/17.6, W41 14.0/17.3, W42 14.2/18.0, W43 11.9/15.3, W45 12.5/17.7
 *   (all 10 old takes are above grade 10.5; 9 of 10 average over 17 words).
 * - W45 target example (split format): 5.9 / 11.1.
 * Threshold: grade 9 (the example passes by 3 points, every old take fails) and
 * average sentence 17 words (owner asked for about 15; 9 of 10 old takes fail).
 */
export const MAX_FK_GRADE = 9;
export const MAX_AVG_SENTENCE_WORDS = 17;

export function readabilityProblems(text: string): string[] {
  const r = readability(text);
  const problems: string[] = [];
  if (r.grade > MAX_FK_GRADE) problems.push(`hard to read: reading grade ${r.grade.toFixed(1)}, keep it at ${MAX_FK_GRADE} or below by using shorter sentences and simpler words`);
  if (r.avgSentenceWords > MAX_AVG_SENTENCE_WORDS) problems.push(`sentences too long: average ${r.avgSentenceWords.toFixed(1)} words, keep it at ${MAX_AVG_SENTENCE_WORDS} or fewer`);
  return problems;
}

// ── Everything together ───────────────────────────────────────────────────────
/**
 * Every problem in a take: house style (findStyleProblems) plus the take-only
 * checks. `previousTakes` are the earlier published takes, for the opening check.
 */
export function findTakeProblems(text: string, previousTakes: ReadonlyArray<string> = []): string[] {
  const problems = [...findStyleProblems(text)];
  const pronouns = findPronouns(text);
  if (pronouns.length) problems.push(`first or second person (${pronouns.join(', ')}): the text must be neutral`);
  for (const phrase of findBannedPhrases(text)) problems.push(`banned phrase "${phrase}"`);
  if (repeatsOpening(text, previousTakes)) problems.push('opens with the same first three words as a previous week: open differently');
  for (const f of findFiller(text)) problems.push(`filler phrase "${f}": say the specific thing instead`);
  const jargon = findJargon(text);
  if (jargon.length) problems.push(`jargon (${jargon.join(', ')}): say what happens in plain words`);
  problems.push(...readabilityProblems(text));
  return problems;
}

// ── Filler (take only) ────────────────────────────────────────────────────────
/** Empty linking phrases the first round of samples leaned on. Not in findStyleProblems. */
const FILLER: ReadonlyArray<[RegExp, string]> = [
  [/\bconcerns?\b/i, 'concerns'],
  [/\bdevelopments?\b/i, 'developments'],
  [/\bis changing too\b|\bare changing too\b/i, 'is changing too'],
  [/\balso finding\b|\bare also finding\b/i, 'also finding'],
];

export function findFiller(text: string): string[] {
  return FILLER.filter(([re]) => re.test(text)).map(([, label]) => label);
}

// ── Judge pass ────────────────────────────────────────────────────────────────
/** What the judge model returns about a take and its declared format. */
export type JudgeResult = {
  point: string | null;
  luxuryConsequence: boolean;
  followsFormat: boolean;
  roundUp: boolean;
  endingRestates: boolean;
};

/** Parse the judge's JSON defensively. Null when it is not usable (the judge is then skipped). */
export function parseJudge(raw: unknown): JudgeResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const bools = ['luxuryConsequence', 'followsFormat', 'roundUp', 'endingRestates'] as const;
  if (!bools.every(k => typeof r[k] === 'boolean')) return null;
  const point = typeof r.point === 'string' && r.point.trim() ? r.point.trim() : null;
  return {
    point,
    luxuryConsequence: r.luxuryConsequence as boolean,
    followsFormat: r.followsFormat as boolean,
    roundUp: r.roundUp as boolean,
    endingRestates: r.endingRestates as boolean,
  };
}

/** Problem labels for the fix pass. Empty = the judge is satisfied. */
export function judgeProblems(j: JudgeResult | null, format?: string | null): string[] {
  if (!j) return [];
  const out: string[] = [];
  if (!j.point) out.push('no single clear point in the first two sentences: state one specific claim the stories support, then support it');
  if (j.roundUp) out.push('reads as a round-up of separate items: keep only the 2 or 3 stories that serve one point and cut the rest');
  if (!j.luxuryConsequence) out.push('never says what the point means for a luxury or jewellery business: add one plain sentence of consequence (not advice)');
  if (!j.followsFormat) out.push(`does not follow the "${format ?? 'declared'}" format: ${(TAKE_FORMATS.find(f => f.id === format)?.description) ?? 'restructure to the declared format'}`);
  if (j.endingRestates) out.push('the last sentence restates an earlier one: end on new information or the consequence');
  return out;
}
