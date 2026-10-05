/**
 * Password gate for /analytics (server only).
 *
 * One shared password in the ANALYTICS_PASSWORD env var (set in Vercel, never
 * in the repo). Signing in sets an httpOnly cookie holding an HMAC derived
 * from the password, so changing the password signs everyone out. The cookie
 * is strictly necessary for the login, so it needs no consent.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'li_analytics_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function analyticsPassword(): string | null {
  const p = process.env.ANALYTICS_PASSWORD?.trim();
  return p ? p : null;
}

function sessionToken(password: string): string {
  return createHmac('sha256', password).update('li-analytics-session-v1').digest('hex');
}

function same(a: string, b: string): boolean {
  // Hash first so lengths match and nothing leaks through timing.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(attempt: string): string | null {
  const password = analyticsPassword();
  if (!password || !attempt) return null;
  return same(attempt, password) ? sessionToken(password) : null;
}

export function isValidSession(cookieValue: string | undefined): boolean {
  const password = analyticsPassword();
  if (!password || !cookieValue) return false;
  return same(cookieValue, sessionToken(password));
}
