'use client';

import { useActionState } from 'react';
import { login } from './actions';

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="max-w-sm mx-auto mt-10 flex flex-col gap-4">
      <label htmlFor="password" className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)]">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        className="border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none bg-transparent py-2 text-[var(--color-text-primary)]"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 py-3 text-sm tracking-wider rounded-[2px] bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
