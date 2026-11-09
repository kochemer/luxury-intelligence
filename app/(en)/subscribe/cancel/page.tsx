import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Payment cancelled',
  robots: { index: false },
};

export default function SubscribeCancelPage() {
  return (
    <main className="w-full min-h-screen" style={{ background: 'var(--color-bg)' }}>

      {/* ── Narrow editorial container ── */}
      <section className="max-w-2xl mx-auto px-6 md:px-8 py-24 md:py-32">

        {/* Muted ornament */}
        <p
          className="font-mono text-[var(--color-text-secondary)]/40 text-2xl mb-10 select-none"
          aria-hidden="true"
        >
          ✦
        </p>

        {/* Overline */}
        <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-[var(--color-text-secondary)] mb-4">
          No payment taken
        </p>

        {/* Headline */}
        <h1 className="font-serif text-3xl md:text-4xl font-normal text-[var(--color-text-primary)] leading-tight mb-6">
          No problem — nothing was charged.
        </h1>

        {/* Body copy */}
        <div className="space-y-4 font-sans text-[15px] text-[var(--color-text-secondary)] leading-relaxed max-w-prose">
          <p>
            You left the checkout before completing payment. No subscription was created and
            no money was taken.
          </p>
          <p>
            The digest and archive remain freely accessible. If you change your mind, you can
            support the brief at any time.
          </p>
        </div>

        {/* Divider */}
        <div
          className="my-10 h-px"
          style={{ background: 'var(--color-border)' }}
        />

        {/* Navigation */}
        <div className="flex flex-wrap gap-6">
          <Link
            href="/subscribe"
            className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--color-accent)]
                       border border-[var(--color-accent)] px-5 py-2.5 rounded-[2px]
                       hover:bg-[var(--color-accent)] hover:text-white
                       transition-colors duration-200"
          >
            Try again →
          </Link>
          <Link
            href="/"
            className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)]
                       hover:text-[var(--color-text-primary)] transition-colors duration-200 py-2.5"
          >
            Back to digest →
          </Link>
        </div>

      </section>
    </main>
  );
}
