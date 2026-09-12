import Image from 'next/image';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import type { Metadata } from 'next';
import SubscribePricing from '../components/SubscribePricing';
import AnalyticsSubscribeView from '../components/AnalyticsSubscribeView';
import { getSiteUrl } from '@/lib/utils/siteUrl';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Back the Brief – Support Plans',
  description: 'Support Luxury Intelligence with a free or paid subscription. Keep the weekly AI, ecommerce, luxury, and jewellery digest running.',
  alternates: {
    canonical: `${siteUrl}/subscribe`,
  },
  openGraph: {
    title: 'Back the Brief – Support Plans',
    description: 'Support Luxury Intelligence with a free or paid subscription. Keep the weekly AI, ecommerce, luxury, and jewellery digest running.',
    images: [`${siteUrl}/api/og`],
  },
};

// ── Resolve the most recent cover image available ─────────────────────────────

function getCurrentCover(): string | null {
  try {
    const dir = path.join(process.cwd(), 'data', 'digests');
    const files = fs
      .readdirSync(dir)
      .filter(f => /^\d{4}-W\d{2}\.json$/.test(f))
      .sort()
      .reverse();

    for (const file of files) {
      try {
        const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
          weekLabel?: string;
          coverImageUrl?: string;
        };
        // Prefer explicit coverImageUrl; fall back to derived public path
        if (json.coverImageUrl) return json.coverImageUrl;
        if (json.weekLabel) {
          const derived = `/weekly-images/${json.weekLabel}.png`;
          const abs = path.join(process.cwd(), 'public', derived);
          if (fs.existsSync(abs)) return derived;
        }
      } catch { /* skip malformed */ }
    }
    return null;
  } catch {
    return null;
  }
}

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQS = [
  {
    question: 'Is this a paid product?',
    answer:
      'Not currently. Payments are voluntary support to help cover running costs — hosting, AI summarisation, and infrastructure. The digest and archive remain freely accessible.',
  },
  {
    question: 'Will I get extra features for supporting?',
    answer:
      'No guaranteed extras today. If supporter perks are introduced later, they will be communicated clearly and in advance. Supporting right now is about keeping the brief going.',
  },
  {
    question: 'Can I cancel?',
    answer:
      'Yes — you can cancel anytime via Stripe\'s customer portal. No lock-in, no minimum period.',
  },
  {
    question: 'When does the digest go out?',
    answer:
      'The digest covers Monday through Sunday in Central European Time (CET/CEST). Issues are typically built and sent early in the following week once the pipeline has run.',
  },
  {
    question: 'Is AI used to write the content?',
    answer:
      'AI is used to classify and summarise articles, and to rank candidates for inclusion. It does not access paywalled content or rewrite source material. Every article links to the original source so you can read the full piece.',
  },
  {
    question: 'How many sources does the brief draw from?',
    answer:
      '~53 RSS feeds across six source tiers — global newswires, retail trade press, fashion and luxury publications, jewellery specialist titles, specialist technology feeds, and business commentary — supplemented by a web-discovery layer that catches relevant articles outside the feed list.',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubscribePage() {
  const currentCover = getCurrentCover();

  return (
    <main className="w-full min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <AnalyticsSubscribeView />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[var(--color-deep)]">
        {/* Blurred cover image background */}
        {currentCover && (
          <div
            className="absolute inset-0 scale-110"
            style={{ opacity: 0.15, filter: 'blur(12px)' }}
            aria-hidden="true"
          >
            <Image
              // Was a CSS background pulling the full 2.5 MB PNG for an image
              // that is blurred 12px and drawn at 15% opacity. quality={30} and
              // a small `sizes` are invisible through that treatment and cut
              // the download by well over 99%. Decorative, so alt is empty.
              src={currentCover}
              alt=""
              fill
              quality={30}
              sizes="(max-width: 768px) 100vw, 800px"
              className="object-cover object-center"
            />
          </div>
        )}
        {/* Dark gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#1a1f26]/80 via-[#1a1f26]/60 to-transparent" />

        <div className="relative z-10 max-w-5xl mx-auto px-8 md:px-16 py-20 md:py-28">
          <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-[var(--color-accent)] mb-5">
            Back the Brief
          </p>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white leading-tight mb-5 max-w-lg">
            You&apos;ve read this far.<br />Help us keep going.
          </h1>
          <p className="font-sans text-white/70 text-base max-w-md leading-relaxed mb-8">
            Luxury Intelligence is free. Your support covers the infrastructure — hosting, AI summarisation, and the tools that power each weekly brief.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/"
              className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/50 hover:text-white/80 transition-colors"
            >
              View latest digest →
            </Link>
            <Link
              href="/archive"
              className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/50 hover:text-white/80 transition-colors"
            >
              Browse archive →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Main content ── */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-14 md:py-20">

        {/* Pricing */}
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] mb-1">
            Support options
          </p>
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-text-primary)]">
            Choose your edition
          </h2>
          <SubscribePricing />
        </div>

        {/* What your support does */}
        <div className="mt-16 pt-14 border-t border-stone-200 dark:border-stone-700">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] mb-1">
            Where it goes
          </p>
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-text-primary)] mb-8">
            What your support covers
          </h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {[
              ['Hosting & infrastructure', 'Vercel deployment, domain, and CDN serving the digest to every reader each week.'],
              ['AI summarisation', 'The LLM API calls that classify articles, generate summaries, and rank candidates for each issue.'],
              ['Web discovery', 'Tavily search queries that surface relevant articles outside the curated RSS feed list.'],
              ['Podcast synthesis', 'ElevenLabs TTS that converts the weekly script into the podcast briefing.'],
            ].map(([label, desc]) => (
              <div key={label} className="flex gap-4">
                <span className="font-mono text-[var(--color-accent)] mt-0.5 shrink-0 select-none text-sm">—</span>
                <div>
                  <p className="font-sans font-medium text-[15px] text-[var(--color-text-primary)]">{label}</p>
                  <p className="font-sans text-sm text-[var(--color-text-secondary)] leading-relaxed mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </dl>
          <p className="mt-8 font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--color-text-secondary)] border-t border-stone-200 dark:border-stone-700 pt-5">
            Support does not unlock premium content — the digest and archive remain freely accessible.
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-16 pt-14 border-t border-stone-200 dark:border-stone-700">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] mb-1">
            Questions
          </p>
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-text-primary)] mb-8">
            FAQ
          </h2>
          <div className="divide-y divide-stone-200 dark:divide-stone-700">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group">
                <summary className="flex items-center justify-between py-5 cursor-pointer list-none gap-6">
                  <span className="font-serif text-[1rem] text-[var(--color-text-primary)] leading-snug">
                    {faq.question}
                  </span>
                  <span
                    className="font-mono text-[var(--color-accent)] text-xl shrink-0 transition-transform duration-200 group-open:rotate-45 select-none"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="font-sans text-[15px] text-[var(--color-text-secondary)] leading-relaxed pb-5 pr-8">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>

      </section>
    </main>
  );
}
