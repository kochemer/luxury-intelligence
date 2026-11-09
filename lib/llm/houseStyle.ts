/**
 * House style for every model-written text readers see: The Week in Context,
 * pull-quote, article summaries, email digest, podcast script.
 *
 * Owner rule (2026-10-09): no "AI-isms". The prompt block states the rules;
 * findStyleProblems() catches the ones a regex can find reliably, so callers
 * can retry or drop a candidate. Rule of three and the tidy closing line have
 * no reliable pattern, so they are prompt-only. Dashes are rewritten, not
 * rejected (stripDashes), because that fix is mechanical.
 *
 * Plain-language rules (2026-11-09) are in the prompt block for all text. The
 * jargon check (findJargon) is NOT part of findStyleProblems: that function
 * gates social posts and summaries, where words like "checkout" are fine. Only
 * the weekly take runs findJargon (digest/takeChecks.ts).
 */

export const HOUSE_STYLE_RULES = `HOUSE STYLE: write like a person, not like an AI. Breaking any of these makes the text unusable.
- No false contrasts. Never "it's not X, it's Y", "X isn't A. It's B", "not just X, but Y" or ", not simply X". Say the claim directly.
- No rule of three. Do not list three things unless exactly three matter. Two is fine, one is better.
- No em dashes or en dashes. Use a comma, a colon or a full stop.
- No set-ups or colon reveals: "The result?", "Here's the thing:", "The catch:".
- Do not end paragraphs on a neat quotable summary line or a restatement. End on new information or the consequence.
- Never use: delve, tapestry, landscape, realm, robust, seamless, leverage, elevate, navigate, unlock, pivotal, testament, nuanced, underscore, showcase, foster, game-changer, ever-evolving.
- No inflated significance: "plays a crucial role", "stands as a testament to", "marks a pivotal moment".
- No trailing commentary clauses: ", highlighting ...", ", underscoring ...", ", reflecting ...".
- No hedge stacking: "it's worth noting", "may potentially", "it's important to note".
- No vague sources: "experts say", "many believe", "studies suggest". Name the source or drop the claim.
- No signposting: "let's dive in", "in today's fast-paced world", "in a world where", "in conclusion".
- No filler or flattering openers.
- Plain language (owner rule, 2026-11-09). Short sentences, about 15 words on average. Everyday words. One idea per sentence, with a concrete subject and verb. Name the company and the number. If a trade term cannot be avoided, explain it in the same sentence.
- No consulting or ecommerce jargon. Never use: agentic, omnichannel, DTC, D2C, clienteling, unit economics, go-to-market, value proposition, synergy, stack (as a tech noun), rails, verticalise or vertical integration, moat, flywheel, headwind, tailwind, playbook, touchpoint, friction, monetise, scalable, operationalise, north star, low-hanging fruit, double down, table stakes, customer journey, ecosystem. Say what actually happens instead.
- Plain text only: no bold, no headers, no emoji.`;

const STOCK_WORDS = [
  'delve', 'tapestry', 'landscape', 'realm', 'robust', 'seamless', 'leverage', 'elevate',
  'navigate', 'unlock', 'pivotal', 'testament', 'nuanced', 'underscore', 'showcase',
  'foster', 'game-changer', 'ever-evolving',
];

const PATTERNS: Array<[RegExp, string]> = [
  // 1. False contrast, within a sentence and across two.
  [/\bnot (?:just|only|simply|merely) [^.;!?]{1,80}?[,;:]?\s*(?:but|it's|it is|they're)\b/i, 'false contrast ("not just X, but Y")'],
  [/,\s*not (?:just|simply|merely|only)\b/i, 'false contrast (", not simply X")'],
  [/\b(?:it|this|that)(?:'s| is) not (?:about )?[^.;!?]{1,60}[,;]\s*(?:it's|it is)\b/i, 'false contrast ("it\'s not X, it\'s Y")'],
  [/\b(?:isn't|aren't|wasn't|is not|are not)\b[^.!?]{0,80}[.!?]\s+(?:It's|It is|They're|They are|That's|This is)\b/, 'false contrast ("X isn\'t A. It\'s B")'],
  [/\b(?:isn't|aren't|wasn't|weren't|is not|are not)\b[^.!?]{0,60}[;,]\s*(?:it's|it is|they're|they are|that's)\b/i, 'false contrast ("isn\'t X; it\'s Y")'],
  [/\b(?:isn't|aren't|wasn't|weren't)\b[^.!?]{0,60}[.!?]\s+[^.!?]{0,40}\b(?:just|actually|really|simply)\b/i, 'false contrast ("X isn\'t A. Y is just B")'],
  // 4. Colon reveals.
  [/\bhere's the (?:thing|catch|kicker)\b/i, 'colon reveal ("here\'s the thing")'],
  [/\bThe (?:result|answer|catch|twist|verdict|kicker|takeaway)\?/, 'colon reveal ("The result?")'],
  // 7. Inflated significance.
  [/\bplays? an? (?:crucial|vital|pivotal|key|critical|central) role\b/i, 'inflated significance'],
  [/\b(?:stands|serves) as a testament\b|\ba testament to\b/i, 'inflated significance'],
  [/\bmarks? a (?:pivotal|defining|watershed|turning) (?:moment|point)\b/i, 'inflated significance'],
  // 8. Trailing -ing commentary.
  [/,\s+(?:highlighting|underscoring|showcasing|reflecting|signall?ing|emphasi[sz]ing|demonstrating|illustrating|cementing|solidifying|reinforcing)\b/i, 'trailing -ing clause'],
  // 10. Hedge stacking.
  [/\bit(?:'s| is) (?:worth noting|important to note|worth mentioning)\b|\b(?:may|could|might) potentially\b/i, 'hedge'],
  // 11. Vague attribution.
  [/\b(?:experts|observers|analysts|critics) (?:say|believe|suggest|note)\b|\bmany believe\b|\bstudies (?:suggest|show)\b/i, 'vague attribution'],
  // 12. Signposting.
  [/\blet's dive in\b|\bdive (?:into|deeper)\b|\bin today's fast-paced\b|\bin a world where\b|\bin conclusion\b|\bat the end of the day\b/i, 'signposting'],
  // 9. Sycophantic openers.
  [/^(?:great question|absolutely|certainly|of course)\b/i, 'filler opener'],
  // 13-15. Formatting.
  [/\*\*|^#{1,6}\s/m, 'markdown formatting'],
  [/\p{Extended_Pictographic}/u, 'emoji'],
];

/** Every house-style violation found in `text`, as short labels. Empty = clean. */
export function findStyleProblems(text: string): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  for (const w of STOCK_WORDS) {
    if (new RegExp(`\\b${w.replace('-', '[- ]')}\\w*`, 'i').test(lower)) problems.push(`stock word "${w}"`);
  }
  for (const [re, label] of PATTERNS) {
    if (re.test(text)) problems.push(label);
  }
  if (/[—–]/.test(text)) problems.push('dash');
  return [...new Set(problems)];
}

/**
 * Replace em and en dashes. A dash between numbers is a range and becomes a
 * hyphen ("2024–2025" → "2024-2025"); any other dash becomes a comma.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,.;:])/g, '$1');
}


/**
 * Consulting and ecommerce jargon the weekly take may not use. Each entry is a
 * label plus a word-bounded pattern, so "tail" and "backstack" do not match.
 * Not used by findStyleProblems on purpose (see the header comment).
 */
export const JARGON_TERMS: ReadonlyArray<{ term: string; pattern: RegExp }> = [
  { term: 'agentic', pattern: /\bagentic\b/i },
  { term: 'omnichannel', pattern: /\bomni-?channel\b/i },
  { term: 'DTC', pattern: /\bDTC\b/i },
  { term: 'D2C', pattern: /\bD2C\b/i },
  { term: 'clienteling', pattern: /\bclienteling\b/i },
  { term: 'unit economics', pattern: /\bunit economics\b/i },
  { term: 'go-to-market', pattern: /\bgo[- ]to[- ]market\b/i },
  { term: 'value proposition', pattern: /\bvalue propositions?\b/i },
  { term: 'synergy', pattern: /\bsynerg(?:y|ies|istic)\b/i },
  // "stack" as a tech noun only: "tech stack", "the stack", not "stack of boxes".
  { term: 'stack', pattern: /\b(?:tech|technology|software|data|commerce|ai|payments?|full|modern|composable|checkout)[- ]stacks?\b|\bthe stack\b/i },
  { term: 'rails', pattern: /\brails\b/i },
  { term: 'verticalise', pattern: /\bvertical(?:is|iz)\w*|\bvertical integration\b/i },
  { term: 'moat', pattern: /\bmoats?\b/i },
  { term: 'flywheel', pattern: /\bflywheels?\b/i },
  { term: 'headwind', pattern: /\bheadwinds?\b/i },
  { term: 'tailwind', pattern: /\btailwinds?\b/i },
  { term: 'playbook', pattern: /\bplaybooks?\b/i },
  { term: 'touchpoint', pattern: /\btouch-?points?\b/i },
  { term: 'friction', pattern: /\bfriction\b/i },
  { term: 'monetise', pattern: /\bmonet(?:is|iz)\w*/i },
  { term: 'scalable', pattern: /\bscalab(?:le|ility)\b/i },
  { term: 'operationalise', pattern: /\boperational(?:is|iz)\w*/i },
  { term: 'north star', pattern: /\bnorth star\b/i },
  { term: 'low-hanging fruit', pattern: /\blow[- ]hanging fruit\b/i },
  { term: 'double down', pattern: /\bdoubl(?:e|es|ed|ing) down\b/i },
  { term: 'table stakes', pattern: /\btable stakes\b/i },
  { term: 'customer journey', pattern: /\bcustomer journeys?\b/i },
  { term: 'ecosystem', pattern: /\becosystems?\b/i },
];

/** The jargon terms found in `text`, as their canonical labels. Empty = clean. */
export function findJargon(text: string): string[] {
  return JARGON_TERMS.filter(({ pattern }) => pattern.test(text)).map(({ term }) => term);
}
