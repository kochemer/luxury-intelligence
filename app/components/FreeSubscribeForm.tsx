'use client';

/**
 * FreeSubscribeForm: the one free-signup form, used on the homepage (hero and
 * end of page) and at the top of /subscribe.
 *
 * Email is required: the old Free card made it optional and answered an empty
 * submit with "Understood.", which subscribed nobody. Posts to
 * /api/subscribe/free like SubscribePricing did.
 */

import { useId, useState } from 'react';
import { track } from '@/lib/analytics';
import { identifySubscriber } from '@/lib/analytics/identity';

type Status = 'idle' | 'loading' | 'success' | 'success_email_failed' | 'error';

type Props = {
  /** 'dark' sits on the navy hero, 'light' on cream or white */
  tone?: 'dark' | 'light';
  buttonLabel?: string;
  /** Where the form sits, for analytics */
  placement: string;
};

export default function FreeSubscribeForm({ tone = 'light', buttonLabel = 'Get the Monday issue', placement }: Props) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const dark = tone === 'dark';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/subscribe/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; emailFailed?: boolean; error?: string };
      if (!data.ok) {
        setStatus('error');
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      track('checkout_start', { plan: 'free', has_email: true, placement });
      void identifySubscriber(email.trim(), 'free');
      setStatus(data.emailFailed ? 'success_email_failed' : 'success');
    } catch {
      setStatus('error');
      setError('Network error. Please try again.');
    }
  }

  if (status === 'success' || status === 'success_email_failed') {
    return (
      <div role="status" className={dark ? 'text-white' : 'text-[var(--color-text-primary)]'}>
        <p className="font-serif italic text-xl">You&rsquo;re on the list.</p>
        <p className={`text-sm mt-1 ${dark ? 'text-white/80' : 'text-[var(--color-text-secondary)]'}`}>
          {status === 'success'
            ? 'Next Monday’s issue will be in your inbox.'
            : 'We couldn’t send the confirmation email. Check your spam folder, or write to us via the feedback page.'}
        </p>
      </div>
    );
  }

  const inputClass = dark
    ? 'bg-white/10 border-white/40 text-white placeholder:text-white/70 focus:border-white'
    : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]';

  return (
    <form onSubmit={onSubmit} noValidate={false} className="w-full max-w-md">
      <label htmlFor={`${id}-email`} className={`block text-sm font-medium mb-2 ${dark ? 'text-white/90' : 'text-[var(--color-text-primary)]'}`}>
        Your email
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading'}
          aria-invalid={status === 'error'}
          aria-describedby={status === 'error' ? `${id}-error` : `${id}-hint`}
          className={`flex-1 min-h-12 px-4 rounded-sm border text-base transition-colors ${inputClass}`}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="min-h-12 px-5 rounded-sm bg-[var(--color-accent)] text-[var(--color-on-accent)] font-medium text-base whitespace-nowrap hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {status === 'loading' ? 'Subscribing…' : buttonLabel}
        </button>
      </div>
      {status === 'error' ? (
        <p id={`${id}-error`} role="alert" className={`text-sm mt-2 ${dark ? 'text-white' : 'text-red-700'}`}>
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className={`text-sm mt-2 ${dark ? 'text-white/75' : 'text-[var(--color-text-secondary)]'}`}>
          Free, every Monday. Unsubscribe in one click.
        </p>
      )}
    </form>
  );
}
