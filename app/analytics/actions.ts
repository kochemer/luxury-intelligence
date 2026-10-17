'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { checkPassword, isValidSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/analytics/adminAuth';
import { retireInsight } from '@/lib/analytics/insights/store';

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const token = checkPassword(String(formData.get('password') ?? ''));
  if (!token) {
    // Slow down guessing.
    await new Promise(r => setTimeout(r, 1000));
    return 'Wrong password.';
  }
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/analytics',
    maxAge: SESSION_MAX_AGE,
  });
  redirect('/analytics');
}

export async function logout(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/analytics' });
  redirect('/analytics');
}

/** The × on an insight tile: retires it as the owner. Same session check as the page itself. */
export async function removeInsight(formData: FormData): Promise<void> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSession(session)) return;
  const raw = String(formData.get('id') ?? '');
  if (!/^\d{1,9}$/.test(raw)) return;
  const id = Number(raw);
  if (id <= 0) return;
  await retireInsight(id, 'owner');
  revalidatePath('/analytics');
}
