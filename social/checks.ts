/**
 * Checks every post must pass before it may be sent. Posting is fully
 * automatic with no human review (owner, 2026-10-14), so these are the review:
 * a post that fails any of them is dropped, never sent, and the owner is
 * emailed. A missing post costs little; a wrong one costs trust.
 *
 * All checks here are offline and pure. The live URL check runs at publish
 * time (social/publish.ts), because the issue page may not be deployed yet
 * when the plan is written.
 */

import { findStyleProblems } from '../lib/llm/houseStyle';
import type { SocialChannel } from './types';

/** X counts every URL as 23 characters, whatever its length. */
const X_URL_WEIGHT = 23;
/** Below X's 280 to leave room for counting differences (emoji, CJK). */
export const X_MAX = 275;
export const LINKEDIN_MIN = 500;
export const LINKEDIN_MAX = 2000;
const URL_RE = /https?:\/\/\S+/g;

export function xLength(text: string): number {
  return text.replace(URL_RE, 'x'.repeat(X_URL_WEIGHT)).length;
}

export function lengthProblems(channel: SocialChannel, parts: string[]): string[] {
  const problems: string[] = [];
  if (channel === 'x') {
    parts.forEach((p, i) => {
      if (xLength(p) > X_MAX) problems.push(`part ${i + 1} is ${xLength(p)} characters (max ${X_MAX})`);
      if (!p.trim()) problems.push(`part ${i + 1} is empty`);
    });
  } else {
    const len = parts.join('').length;
    if (len < LINKEDIN_MIN || len > LINKEDIN_MAX) problems.push(`LinkedIn post is ${len} characters (allowed ${LINKEDIN_MIN}-${LINKEDIN_MAX})`);
  }
  return problems;
}

export function hashtagProblems(channel: SocialChannel, parts: string[]): string[] {
  const count = (parts.join(' ').match(/(^|\s)#\w+/g) || []).length;
  const max = channel === 'linkedin' ? 3 : 0;
  return count > max ? [`${count} hashtags (max ${max})`] : [];
}

/**
 * PRODUCT.md: copy must never claim a human picked, read or reviewed an issue.
 * The model reads and ranks; "we read 2,000 articles" would be false.
 */
const HUMAN_CLAIMS: RegExp[] = [
  /\bhand[- ]?(?:picked|selected|curated)\b/i,
  /\b(?:human|editor)[- ]?(?:curated|picked|selected|reviewed)\b/i,
  /\bcurated by\b/i,
  /\breviewed by\b/i,
  /\bour (?:editors?|team|analysts?|writers?)\b/i,
  /\b(?:we|I) (?:read|picked|chose|selected|reviewed|curated|handpicked|went through|combed)\b/i,
  /\b(?:we|I)(?:'ve| have) (?:read|picked|chosen|selected|reviewed|curated)\b/i,
];

export function humanClaimProblems(text: string): string[] {
  return HUMAN_CLAIMS.some((re) => re.test(text)) ? ['claims a human picked, read or reviewed the issue'] : [];
}

export function styleProblems(text: string): string[] {
  // Hashtags are allowed on LinkedIn; the house-style markdown check reads a
  // leading "#" as a header.
  return findStyleProblems(text.replace(/(^|\s)#(\w)/g, '$1$2')).map((p) => `house style: ${p}`);
}

// ── Facts ────────────────────────────────────────────────────────

/** Numbers in `text`, normalised: "24,000" → "24000", "5.5%" → "5.5". */
export function numbersIn(text: string): string[] {
  const found = text.replace(URL_RE, ' ').match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return found.map((n) => n.replace(/,/g, '').replace(/\.$/, ''));
}

/**
 * Capitalised words that are not at the start of a sentence or line: in
 * practice brand, company, person and place names. Each must appear in the
 * source text, so the model cannot introduce a name the digest never mentioned.
 */
export function namesIn(text: string): string[] {
  const names: string[] = [];
  const clean = text.replace(URL_RE, ' ');
  const re = /([A-Z][\p{L}\d&'’.-]*[\p{L}\d])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const before = clean.slice(0, m.index).replace(/[\s"“‘'(]+$/u, '');
    const sentenceStart = before === '' || /[.!?:\n]$/.test(before);
    if (sentenceStart) continue;
    const word = m[1].replace(/['’]s$/u, '');
    if (!COMMON_CAPITALISED.has(word.toLowerCase())) names.push(word);
  }
  return names;
}

/** Capitalised words that are not claims about the world. */
const COMMON_CAPITALISED = new Set([
  'i', 'ai', 'ceo', 'cfo', 'cto', 'us', 'uk', 'eu', 'usa', 'gen', 'z', 'q1', 'q2', 'q3', 'q4',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'luxury', 'intelligence', 'full', 'free', 'read', 'issue', 'this', 'the', 'week',
  'linkedin', 'x', 'youtube', 'spotify',
]);

export function factProblems(text: string, sourceText: string): string[] {
  const problems: string[] = [];
  const sourceNumbers = new Set(numbersIn(sourceText));
  for (const n of numbersIn(text)) {
    if (!sourceNumbers.has(n)) problems.push(`number "${n}" is not in the digest`);
  }
  const sourceLower = sourceText.toLowerCase();
  for (const name of namesIn(text)) {
    if (!sourceLower.includes(name.toLowerCase())) problems.push(`name "${name}" is not in the digest`);
  }
  return [...new Set(problems)];
}

// ── Repeats ──────────────────────────────────────────────────────

function trigrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(URL_RE, ' ').match(/[\p{L}\d]+/gu) || [];
  const grams = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) grams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return grams;
}

/** Word-trigram Jaccard similarity, 0–1. */
export function similarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (!ga.size || !gb.size) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

export const REPEAT_THRESHOLD = 0.5;

/**
 * The lines code adds to every post (link lines, hashtags). They repeat by
 * design, so the repeat check ignores them.
 */
export function stripBoilerplate(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^(?:Read, listen or watch the full issue|The full issue|Full issue|More in this week's issue)\b.*https?:\/\//i.test(line.trim()))
    .filter((line) => !/^(?:#\w+\s*)+$/.test(line.trim()))
    .join('\n');
}

export function repeatProblems(text: string, earlierPosts: string[]): string[] {
  const mine = stripBoilerplate(text);
  const worst = Math.max(0, ...earlierPosts.map((p) => similarity(mine, stripBoilerplate(p))));
  return worst >= REPEAT_THRESHOLD ? [`repeats an earlier post (similarity ${worst.toFixed(2)})`] : [];
}

// ── All together ─────────────────────────────────────────────────

/**
 * Every offline problem with a post. `modelText` is the part the model wrote
 * (fact and honesty checks); `parts` is the final text with the links and
 * fixed lines added (length, hashtag and repeat checks).
 */
export function postProblems(args: {
  channel: SocialChannel;
  parts: string[];
  modelText: string;
  sourceText: string;
  earlierPosts: string[];
}): string[] {
  const { channel, parts, modelText, sourceText, earlierPosts } = args;
  return [
    ...lengthProblems(channel, parts),
    ...hashtagProblems(channel, parts),
    ...humanClaimProblems(parts.join('\n')),
    ...styleProblems(modelText),
    ...factProblems(modelText, sourceText),
    ...repeatProblems(parts.join('\n'), earlierPosts),
  ];
}
