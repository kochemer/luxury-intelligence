/**
 * Formatting for the /analytics sections: durations, page names, "came from"
 * labels, chart axis labels, web-vital values and Copenhagen times. Pure, so
 * the server sections and the tests share it.
 */

import type { VitalMetric } from './amplitudeStats';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "57 s", "3 m 10 s", "1 h 2 m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} m`;
}

// ── Pages ────────────────────────────────────────────────────────────────────

/** "/" is Home, "/digest/…-week-41" (or "…2026-w41") is "Digest W41", the rest is capitalised. */
export function pageName(path: string): string {
  const p = path.split(/[?#]/)[0] || '/';
  if (p === '/' || p === '') return 'Home';
  const digest = /^\/digest\/.*(?:week-|-w)(\d{1,2})\/?$/i.exec(p);
  if (digest) return `Digest W${Number(digest[1])}`;
  const seg = p.split('/').filter(Boolean)[0] ?? '';
  let decoded = seg;
  try { decoded = decodeURIComponent(seg); } catch { /* keep the raw segment */ }
  const words = decoded.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Home';
}

/** Page names in order, with consecutive repeats merged: "Home → About → Home". */
export function pagePath(paths: string[]): string {
  const names: string[] = [];
  for (const p of paths) {
    const n = pageName(p);
    if (names[names.length - 1] !== n) names.push(n);
  }
  return names.join(' → ') || 'Home';
}

// ── Came from ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  newsletter: 'Newsletter',
  linkedin: 'LinkedIn',
  x: 'X',
  'chatgpt.com': 'ChatGPT',
};
const CONTENT_LABELS: Record<string, string> = {
  read_online_cta: 'read online',
  'issue-post': 'issue post',
  thread: 'thread',
  'story-tue': 'story Tue',
};

export const sourceLabel = (source: string): string => SOURCE_LABELS[source.toLowerCase()] ?? source;

const isCampaign = (s: string) => /^(\d{4}-)?w\d{1,2}$/i.test(s);

/** "2026-W41" becomes "W41". */
export const campaignLabel = (campaign: string): string => {
  const m = /^(?:\d{4}-)?(w\d{1,2})$/i.exec(campaign);
  return m ? m[1]!.toUpperCase() : campaign;
};

export const contentLabel = (content: string): string => CONTENT_LABELS[content.toLowerCase()] ?? content.replace(/[_-]+/g, ' ');

/** The muted "W41 · read online" part for a tagged visit; '' when there is no campaign or content. */
export function taggedNote(detail: string | undefined): string {
  const parts = (detail ?? '').split(' · ').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  let campaign = '';
  let content = '';
  if (parts.length >= 2) [campaign, content] = parts as [string, string];
  else if (isCampaign(parts[0]!)) campaign = parts[0]!;
  else content = parts[0]!;
  return [campaign && campaignLabel(campaign), content && contentLabel(content)].filter(Boolean).join(' · ');
}

export interface CameFromText { label: string; note?: string; title?: string }

/** `classify` maps a referring domain to a channel name (classifyReferrer). */
export function cameFromText(
  from: { kind: 'tagged' | 'site' | 'direct'; label: string; detail?: string },
  classify: (domain: string) => string,
): CameFromText {
  if (from.kind === 'tagged') {
    return { label: sourceLabel(from.label), note: taggedNote(from.detail) || undefined };
  }
  if (from.kind === 'site') return { label: classify(from.label), title: from.label };
  return { label: 'Direct / email / app' };
}

export const placeText = (city: string | null, country: string | null): string =>
  [city, country].filter(Boolean).join(', ') || 'Location unknown';

// ── Dates ────────────────────────────────────────────────────────────────────

/** "31 Jan" from YYYY-MM-DD. */
export function dayMonth(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''}`.trim();
}

/** "16 Oct 2026" from YYYY-MM-DD. */
export const dayMonthYear = (day: string): string => `${dayMonth(day)} ${day.slice(0, 4)}`;

const COPENHAGEN = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Copenhagen', weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** "Tue 13 Oct 08:31" in Copenhagen time, from an ISO timestamp. */
export function copenhagenWhen(iso: string): string {
  const p = Object.fromEntries(COPENHAGEN.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`;
}

// ── Insight chart axes ───────────────────────────────────────────────────────

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** True when consecutive labels are about a month apart (a series keyed by month start). */
export function isMonthlySeries(labels: string[]): boolean {
  if (labels.length < 2) return false;
  for (let i = 1; i < labels.length; i++) {
    const gap = dayNumber(labels[i]!) - dayNumber(labels[i - 1]!);
    if (!(gap >= 28 && gap <= 31)) return false;
  }
  return true;
}

/** "May" for a monthly series, "18 May" otherwise. */
export function axisLabel(day: string, monthly: boolean): string {
  return monthly ? (MONTHS[Number(day.split('-')[1]) - 1] ?? day) : dayMonth(day);
}

/** Tooltip for one bar: "Week of 18 May: 407", "May: 407". */
export function barTitle(day: string, value: number, monthly: boolean): string {
  return `${monthly ? '' : 'Week of '}${axisLabel(day, monthly)}: ${value.toLocaleString('en-GB')}`;
}

// ── Web vitals and visitors ──────────────────────────────────────────────────

/** "365 ms", "1.53 s", CLS "0.001". */
export function formatVital(metric: VitalMetric, value: number): string {
  if (metric === 'CLS') return value.toFixed(3);
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

/** Visitor letters by number of sessions (most first, ties by first appearance): A, B, C. */
export function visitorLetters(personIds: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const id of personIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const ordered = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
  return new Map(ordered.map((id, i) => [id, i < 26 ? String.fromCharCode(65 + i) : String(i + 1)]));
}
