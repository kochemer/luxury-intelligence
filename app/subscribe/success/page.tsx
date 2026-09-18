import type { Metadata } from 'next';
import Link from 'next/link';
import AnalyticsCheckoutComplete from '@/app/components/AnalyticsCheckoutComplete';

export const metadata: Metadata = {
  title: 'Support confirmed',
  robots: { index: false },
};

export default async function SubscribeSuccessPage({
  searchParams,
}: {
  // Next 15+: searchParams is a Promise. The sync signature only surfaced as a
  // type error once the build ran under webpack (next-pwa) on 2026-09-18.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = typeof params.plan === 'string' ? params.plan : null;

  const planLabel =
    plan === 'patron_monthly'
      ? 'Patron — €3 / month'
      : plan === 'supporter_monthly'
      ? 'Supporter — €1 / month'
      : null;

  return (
    <main className="w-full min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <AnalyticsCheckoutComplete plan={plan} />

      {/* ── Narrow editorial container ── */}
      <section className="max-w-2xl mx-auto px-6 md:px-8 py-24 md:py-32">

        {/* Gold ornament */}
        <p
          className="font-mono text-[var(--color-accent)] text-2xl mb-10 select-none"
          aria-hidden="true"
        >
          ✦
        </p>

        {/* Overline */}
        <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-[var(--color-accent)] mb-4">
          Support confirmed
        </p>

        {/* Headline */}
        <h1 className="font-serif text-3xl md:text-4xl font-normal text-[var(--color-text-primary)] leading-tight mb-6">
          Thank you for backing the brief.
        </h1>

        {/* Plan badge */}
        {planLabel && (
          <p className="inline-block font-mono text-[11px] tracking-[0.15em] uppercase px-3 py-1.5 mb-6
                         border border-[var(--color-accent)]/40 text-[var(--color-accent)]
                         rounded-[2px]">
            {planLabel}
          </p>
        )}

        {/* Body copy */}
        <div className="space-y-4 font-sans text-[15px] text-[var(--color-text-secondary)] leading-relaxed max-w-prose">
          <p>
            Your support is active. It covers the infrastructure that keeps Luxury Intelligence
            running each week — hosting, AI summarisation, and the tools that power each brief.
          </p>
          <p>
            The weekly digest will be sent to the email address you used at checkout, starting
            from the next issue.
          </p>
          <p>
            You can cancel at any time from the email Stripe sent you. No lock-in.
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
            href="/"
            className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--color-text-primary)]
                       border border-[var(--color-border)] px-5 py-2.5 rounded-[2px]
                       hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]
                       transition-colors duration-200"
          >
            Read latest digest →
          </Link>
          <Link
            href="/archive"
            className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)]
                       hover:text-[var(--color-text-primary)] transition-colors duration-200 py-2.5"
          >
            Browse archive →
          </Link>
        </div>

      </section>
    </main>
  );
}
