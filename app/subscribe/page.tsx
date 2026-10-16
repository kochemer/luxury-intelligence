import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import type { Metadata } from 'next';
import SubscribePricing from '../components/SubscribePricing';
import FreeSubscribeForm from '../components/FreeSubscribeForm';
import AnalyticsSubscribeView from '../components/AnalyticsSubscribeView';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import { displaySourceName } from '@/lib/utils/sourceName';
import { weekLabelToSlug } from '@/lib/utils/weekSlug';
import type { WeeklyDigest } from '@/lib/types';

const siteUrl = getSiteUrl();

const TITLE = 'Subscribe – The free weekly briefing';
const DESCRIPTION = 'The week’s most important stories in ecommerce, AI, luxury and jewellery, ranked and summarised every Monday. Free by email; optional support keeps it running.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${siteUrl}/subscribe`,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    images: [`${siteUrl}/api/og`],
  },
};

// ── The latest issue, shown as a sample of what arrives ───────────────────────

function getLatestDigest(): WeeklyDigest | null {
  try {
    const dir = path.join(process.cwd(), 'data', 'digests');
    const latest = fs
      .readdirSync(dir)
      .filter(f => /^\d{4}-W\d{2}\.json$/.test(f))
      .sort()
      .pop();
    return latest ? (JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8')) as WeeklyDigest) : null;
  } catch {
    return null;
  }
}

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQS = [
  {
    question: 'When does it arrive?',
    answer:
      'Every Monday morning, Copenhagen time. Each issue covers the Monday to Sunday that just ended.',
  },
  {
    question: 'Who writes it?',
    answer:
      'AI. It selects, ranks and summarises the articles and writes the weekly insight and Spotlight, with automated quality checks. No one reviews an issue by hand before it goes out. Every story links to the original article, and paywalled pieces are skipped rather than paraphrased.',
  },
  {
    question: 'Is it really free?',
    answer:
      'Yes. The weekly email, the site and the archive are free. Paid support is voluntary and unlocks nothing extra; it helps cover hosting and AI costs.',
  },
  {
    question: 'Can I unsubscribe or cancel support?',
    answer:
      'Yes. Every email has a one-click unsubscribe link. Support can be cancelled any time through Stripe’s customer portal, with no minimum period.',
  },
  {
    question: 'How many sources does it draw from?',
    answer:
      '~53 RSS feeds across global newswires, retail trade press, fashion and luxury publications, jewellery specialist titles, technology feeds and business commentary, plus a web-discovery layer that catches relevant articles outside the feed list.',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubscribePage() {
  const digest = getLatestDigest();
  const sample = digest
    ? (['Ecommerce_Retail_Tech', 'AI_and_Strategy', 'Luxury_and_Consumer'] as const)
        .map(key => digest.topics[key]?.top?.[0])
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
    : [];

  return (
    <main className="w-full min-h-screen bg-[var(--color-bg)]">
      <AnalyticsSubscribeView />

      {/* ── Hero: the free signup, and a real sample of what arrives ── */}
      <section className="bg-[var(--color-deep)]">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-14 md:py-20 grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-12 items-center">
          <div>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[var(--color-on-deep)] leading-tight mb-5 max-w-xl">
              The week in ecommerce, AI, luxury and jewellery. Every Monday, free.
            </h1>
            <p className="text-lg text-[var(--color-on-deep-muted)] max-w-lg leading-relaxed mb-8">
              28 stories ranked from about 2,000 articles, each with a two-line summary, plus the week&rsquo;s insight and the Spotlight. A five-minute read.
            </p>
            <FreeSubscribeForm tone="dark" placement="subscribe_hero" />
          </div>

          {digest && (
            <figure className="bg-[var(--color-bg)] rounded-sm p-6 md:p-8 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.6)]">
              <figcaption className="text-sm text-[var(--color-text-secondary)] mb-4">
                From the latest issue ({digest.weekLabel.replace('-', ' ')})
              </figcaption>
              {digest.oneSentenceSummary && (
                <blockquote className="font-serif italic text-xl leading-snug text-[var(--color-text-primary)] mb-6">
                  {digest.oneSentenceSummary}
                </blockquote>
              )}
              <ul className="divide-y divide-[var(--color-border)]">
                {sample.map(article => (
                  <li key={article.id} className="py-3">
                    <p className="text-[15px] font-medium leading-snug text-[var(--color-text-primary)]">{article.title}</p>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">{displaySourceName(article.source)}</p>
                  </li>
                ))}
              </ul>
              <Link
                href={`/digest/${weekLabelToSlug(digest.weekLabel)}`}
                className="mt-4 inline-flex items-center min-h-11 text-sm font-medium text-[var(--color-accent)] underline underline-offset-4 hover:opacity-80"
              >
                Read the whole issue
              </Link>
            </figure>
          )}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 md:px-8 py-14 md:py-20">

        {/* ── Optional support ── */}
        <div>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold text-[var(--color-text-primary)]">
            Want to help keep it running?
          </h2>
          <p className="mt-3 text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            The briefing stays free for everyone. If it&rsquo;s useful to you, a small monthly contribution covers hosting and AI costs. Support unlocks nothing extra.
          </p>
          <SubscribePricing includeFree={false} />
        </div>

        {/* ── What support covers ── */}
        <div className="mt-16 pt-14 border-t border-[var(--color-border)]">
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-text-primary)] mb-8">
            What support covers
          </h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {[
              ['Hosting & infrastructure', 'Vercel deployment, domain, and CDN serving the digest to every reader each week.'],
              ['AI summarisation', 'The LLM API calls that classify articles, generate summaries, and rank candidates for each issue.'],
              ['Web discovery', 'Tavily search queries that surface relevant articles outside the curated RSS feed list.'],
              ['Podcast synthesis', 'OpenAI text-to-speech that voices the weekly script as the podcast briefing.'],
            ].map(([label, desc]) => (
              <div key={label}>
                <dt className="font-sans font-medium text-[15px] text-[var(--color-text-primary)]">{label}</dt>
                <dd className="font-sans text-sm text-[var(--color-text-secondary)] leading-relaxed mt-1">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── FAQ ── */}
        <div className="mt-16 pt-14 border-t border-[var(--color-border)]">
          <h2 className="font-serif text-2xl font-semibold text-[var(--color-text-primary)] mb-8">
            Questions
          </h2>
          <div className="divide-y divide-[var(--color-border)]">
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
