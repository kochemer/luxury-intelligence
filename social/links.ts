/**
 * Links that go into posts. Every one carries UTM tags so the 8-week review
 * can count sign-ups per channel and per format.
 *
 * Hardcoded canonical URL, never getSiteUrl(): that resolves to localhost in
 * dev, and these links are published (same rule as the SEO monitor, CLAUDE.md).
 */

import { weekLabelToSlug } from '../lib/utils/weekSlug';
import type { SocialChannel } from './types';

export const CANONICAL_URL = 'https://luxury-intel.com';

export function withSocialUtms(url: string, channel: SocialChannel, week: string, content: string): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', channel);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', week);
  u.searchParams.set('utm_content', content);
  return u.toString();
}

/** The issue's page, e.g. /digest/october-2026-week-41. */
export function issueUrl(week: string, channel: SocialChannel, content: string): string {
  return withSocialUtms(`${CANONICAL_URL}/digest/${weekLabelToSlug(week)}`, channel, week, content);
}

/** Absolute URL of a site path such as the cover image `/weekly-images/2026-W41.png`. */
export function absoluteUrl(path: string): string {
  return path.startsWith('http') ? path : `${CANONICAL_URL}${path}`;
}
