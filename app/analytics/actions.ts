'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkPassword, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/analytics/adminAuth';

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
