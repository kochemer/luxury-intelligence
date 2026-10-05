'use client';

import { useState } from 'react';
import { track } from '@/lib/analytics';
import { identifySubscriber } from '@/lib/analytics/identity';

// ── Types ─────────────────────────────────────────────────────────────────────

type TierStatus =
  | 'idle'
  | 'loading'
  | 'success_digest'        // free signup confirmed with email
  | 'success_email_failed'  // subscribed but confirmation email didn't send
  | 'success_noemail'       // free signup acknowledged without email
  | 'pending'               // paid — Stripe not yet wired
  | 'error';

type TierState = {
  email:    string;
  status:   TierStatus;
  errorMsg: string;
};

const initState = (): TierState => ({ email: '', status: 'idle', errorMsg: '' });

// ── Shared sub-components ─────────────────────────────────────────────────────

function EmailField({
  value,
  onChange,
  required,
  disabled,
}: {
  value:    string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mb-5">
      <label className="block font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)] mb-2">
        Email{required ? '' : ' — optional'}
      </label>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder="your@email.com"
        autoComplete="email"
        className="w-full bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-2 font-sans text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/50 transition-colors duration-200 disabled:opacity-40"
      />
    </div>
  );
}

// Shared button class; variants applied at call site
const btnBase =
  'mt-auto w-full py-3 text-sm font-sans tracking-wider text-center rounded-[2px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

// ── Main component ────────────────────────────────────────────────────────────

export default function SubscribePricing() {
  const [free,    setFree]    = useState<TierState>(initState());
  const [monthly, setMonthly] = useState<TierState>(initState());
  const [yearly,  setYearly]  = useState<TierState>(initState());

  // ── Free signup handler ───────────────────────────────────────────────────

  async function handleFree(e: React.FormEvent) {
    e.preventDefault();
    setFree(s => ({ ...s, status: 'loading', errorMsg: '' }));

    try {
      const res  = await fetch('/api/subscribe/free', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: free.email.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; withDigest?: boolean; emailFailed?: boolean; error?: string };

      if (!data.ok) {
        setFree(s => ({ ...s, status: 'error', errorMsg: data.error ?? 'Something went wrong.' }));
        return;
      }

      track('checkout_start', { plan: 'free', has_email: !!free.email.trim() });
      if (free.email.trim()) {
        void identifySubscriber(free.email.trim(), 'free');
      }

      if (!data.withDigest) {
        setFree(s => ({ ...s, status: 'success_noemail' }));
      } else if (data.emailFailed) {
        setFree(s => ({ ...s, status: 'success_email_failed' }));
      } else {
        setFree(s => ({ ...s, status: 'success_digest' }));
      }
    } catch {
      setFree(s => ({ ...s, status: 'error', errorMsg: 'Network error. Please try again.' }));
    }
  }

  // ── Paid placeholder handler ──────────────────────────────────────────────
  // Step 3 will replace the fetch body with a Stripe checkout redirect.

  async function handlePaid(
    plan: 'supporter_monthly' | 'patron_monthly',
    state: TierState,
    setState: React.Dispatch<React.SetStateAction<TierState>>,
  ) {
    setState(s => ({ ...s, status: 'loading', errorMsg: '' }));

    try {
      const res  = await fetch('/api/subscribe/paid', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: state.email.trim(), plan }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        pending?: boolean;
        checkoutUrl?: string; // populated in Step 3
        error?: string;
      };

      if (data.ok && data.checkoutUrl) {
        // Step 3: redirect to Stripe checkout
        track('checkout_start', { plan });
        if (state.email.trim()) {
          void identifySubscriber(state.email.trim(), plan);
        }
        window.location.href = data.checkoutUrl;
        return;
      }

      if (data.pending) {
        track('checkout_start', { plan, pending: true });
        setState(s => ({ ...s, status: 'pending' }));
        return;
      }

      setState(s => ({
        ...s,
        status:   'error',
        errorMsg: data.error ?? 'Something went wrong.',
      }));
    } catch {
      setState(s => ({ ...s, status: 'error', errorMsg: 'Network error. Please try again.' }));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">

      {/* ── Free / Subscriber ─────────────────────────────────────────── */}
      <div className="border border-stone-200 dark:border-stone-700 rounded-[2px] p-6 flex flex-col bg-[var(--color-surface)]">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] mb-5">
          Digest — Subscriber
        </p>
        <div className="mb-1">
          <span className="font-serif text-5xl font-light text-[var(--color-text-primary)]">Free</span>
        </div>
        <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-3 mb-6 leading-relaxed">
          The weekly brief, direct to your inbox. No payment required.
        </p>

        {/* Success — with email */}
        {free.status === 'success_digest' && (
          <div className="text-center py-6">
            <span className="block font-mono text-[var(--color-accent)] text-xl mb-3 select-none">✦</span>
            <p className="font-serif italic text-[var(--color-text-primary)]">You&apos;re on the list.</p>
            <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-1">
              Look out for next week&apos;s issue.
            </p>
          </div>
        )}

        {/* Success — subscribed but confirmation email failed */}
        {free.status === 'success_email_failed' && (
          <div className="text-center py-6">
            <span className="block font-mono text-[var(--color-accent)] text-xl mb-3 select-none">✦</span>
            <p className="font-serif italic text-[var(--color-text-primary)]">You&apos;re on the list.</p>
            <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-1">
              We couldn&apos;t send a confirmation email — please check your spam folder or contact us.
            </p>
          </div>
        )}

        {/* Success — no email */}
        {free.status === 'success_noemail' && (
          <div className="text-center py-6">
            <span className="block font-mono text-[var(--color-accent)] text-xl mb-3 select-none">✦</span>
            <p className="font-serif italic text-[var(--color-text-primary)]">Understood.</p>
            <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-1">
              The digest is always at{' '}
              <span className="text-[var(--color-accent)]">luxury-intel.com</span>
            </p>
          </div>
        )}

        {/* Form — idle / loading / error */}
        {(free.status === 'idle' || free.status === 'loading' || free.status === 'error') && (
          <form onSubmit={handleFree} className="flex flex-col flex-1">
            <EmailField
              value={free.email}
              onChange={v => setFree(s => ({ ...s, email: v }))}
              disabled={free.status === 'loading'}
            />
            {free.status === 'error' && (
              <p className="font-sans text-xs text-red-600 -mt-3 mb-3">{free.errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={free.status === 'loading'}
              className={`${btnBase} border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white`}
            >
              {free.status === 'loading' ? 'Subscribing…' : 'Subscribe →'}
            </button>
          </form>
        )}
      </div>

      {/* ── Edition 01 — Monthly ──────────────────────────────────────── */}
      <div className="border border-stone-200 dark:border-stone-700 rounded-[2px] p-6 flex flex-col bg-[var(--color-surface)] hover:border-[var(--color-accent)] transition-colors duration-200">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] mb-5">
          Edition 01 — Reader
        </p>
        <div className="mb-1">
          <span className="font-serif text-5xl font-light text-[var(--color-text-primary)]">€1</span>
          <span className="text-base text-[var(--color-text-secondary)] ml-1">/mo</span>
        </div>
        <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-3 mb-6 leading-relaxed">
          Covers roughly one week of AI summarisation costs. Every reader who supports helps keep the brief running.
        </p>

        {/* Pending state */}
        {monthly.status === 'pending' && (
          <div className="text-center py-6">
            <span className="block font-mono text-[var(--color-accent)] text-xl mb-3 select-none">◎</span>
            <p className="font-serif italic text-[var(--color-text-primary)]">Coming soon.</p>
            <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-1">
              Payment integration is in progress — we&apos;ll have it live shortly.
            </p>
          </div>
        )}

        {/* Form */}
        {(monthly.status === 'idle' || monthly.status === 'loading' || monthly.status === 'error') && (
          <form
            onSubmit={e => { e.preventDefault(); void handlePaid('supporter_monthly', monthly, setMonthly); }}
            className="flex flex-col flex-1"
          >
            <EmailField
              value={monthly.email}
              onChange={v => setMonthly(s => ({ ...s, email: v }))}
              required
              disabled={monthly.status === 'loading'}
            />
            {monthly.status === 'error' && (
              <p className="font-sans text-xs text-red-600 -mt-3 mb-3">{monthly.errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={monthly.status === 'loading'}
              className={`${btnBase} border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white`}
            >
              {monthly.status === 'loading' ? 'Working…' : 'Support at €1'}
            </button>
          </form>
        )}
      </div>

      {/* ── Edition 02 — Patron ──────────────────────────────────────── */}
      <div className="border-2 border-[var(--color-accent)] rounded-[2px] p-6 flex flex-col bg-[var(--color-accent-light)] relative">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-accent)] mb-5">
          Edition 02 — Patron
        </p>
        <div className="mb-1">
          <span className="font-serif text-5xl font-light text-[var(--color-text-primary)]">€3</span>
          <span className="text-base text-[var(--color-text-secondary)] ml-1">/mo</span>
        </div>
        <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-3 mb-6 leading-relaxed">
          The contribution that makes a meaningful difference. Covers a full month of infrastructure and keeps the brief running for everyone.
        </p>

        {/* Pending state */}
        {yearly.status === 'pending' && (
          <div className="text-center py-6">
            <span className="block font-mono text-[var(--color-accent)] text-xl mb-3 select-none">◎</span>
            <p className="font-serif italic text-[var(--color-text-primary)]">Coming soon.</p>
            <p className="font-sans text-sm text-[var(--color-text-secondary)] mt-1">
              Payment integration is in progress — we&apos;ll have it live shortly.
            </p>
          </div>
        )}

        {/* Form */}
        {(yearly.status === 'idle' || yearly.status === 'loading' || yearly.status === 'error') && (
          <form
            onSubmit={e => { e.preventDefault(); void handlePaid('patron_monthly', yearly, setYearly); }}
            className="flex flex-col flex-1"
          >
            <EmailField
              value={yearly.email}
              onChange={v => setYearly(s => ({ ...s, email: v }))}
              required
              disabled={yearly.status === 'loading'}
            />
            {yearly.status === 'error' && (
              <p className="font-sans text-xs text-red-600 -mt-3 mb-3">{yearly.errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={yearly.status === 'loading'}
              className={`${btnBase} bg-[var(--color-accent)] text-white hover:opacity-90 font-medium`}
            >
              {yearly.status === 'loading' ? 'Working…' : 'Support at €3'}
            </button>
          </form>
        )}
      </div>

    </div>
    <p className="mt-4 font-sans text-xs text-[var(--color-text-secondary)]">
      We use your email only to send the digest and manage your plan; payments are handled by Stripe.
      Unsubscribe any time. <a href="/about#privacy" className="underline underline-offset-2 hover:text-[var(--color-accent)]">Privacy details</a>.
    </p>
    </>
  );
}
