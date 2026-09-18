import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';

const getSiteUrlLazy = () => getSiteUrl();

export const metadata: Metadata = {
  title: 'Methodology – How the brief is curated',
  description: 'How the weekly AI, ecommerce, luxury and jewellery digest is collected, ranked and summarized.',
  alternates: {
    canonical: `${getSiteUrlLazy()}/methodology`,
  },
  openGraph: {
    title: 'Methodology – How the brief is curated',
    description: 'How the weekly AI, ecommerce, luxury and jewellery digest is collected, ranked and summarized.',
    images: [`${getSiteUrlLazy()}/api/og`],
  },
  twitter: {
    title: 'Methodology – How the brief is curated',
    description: 'How the weekly AI, ecommerce, luxury and jewellery digest is collected, ranked and summarized.',
    images: [`${getSiteUrlLazy()}/api/og`],
  },
};

// ── Pipeline metadata (read at build / request time) ──────────────────────────

function getPipelineMeta(): { lastRunFormatted: string; issueCount: number } {
  try {
    const dir = path.join(process.cwd(), 'data', 'digests');
    const files = fs.readdirSync(dir).filter(f => /^\d{4}-W\d{2}\.json$/.test(f));
    const issueCount = files.length;

    // Find most recently built digest
    let latestBuiltAt = '';
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const json = JSON.parse(raw) as { builtAtISO?: string };
        if (json.builtAtISO && json.builtAtISO > latestBuiltAt) {
          latestBuiltAt = json.builtAtISO;
        }
      } catch { /* skip malformed */ }
    }

    const lastRunFormatted = latestBuiltAt
      ? new Date(latestBuiltAt).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'long', year: 'numeric',
          timeZone: 'Europe/Copenhagen',
        })
      : 'Unknown';

    return { lastRunFormatted, issueCount };
  } catch {
    return { lastRunFormatted: 'Unknown', issueCount: 0 };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Section = {
  label: string;
  content: React.ReactNode;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MethodologyPage() {
  const { lastRunFormatted, issueCount } = getPipelineMeta();

  const sections: Section[] = [
    {
      label: 'Product',
      content: (
        <p>
          A weekly curated intelligence digest covering{' '}
          <strong>AI & Strategy</strong>, <strong>Ecommerce & Retail Tech</strong>,{' '}
          <strong>Luxury & Consumer</strong>, and <strong>Jewellery Industry</strong>.
          Each issue presents eight ranked articles across four categories, delivered
          simultaneously to the web, by email, and as a podcast briefing.
        </p>
      ),
    },
    {
      label: 'Sources',
      content: (
        <div className="space-y-2">
          <p>
            ~53 RSS feeds across six source tiers — global newswires, retail trade press,
            fashion and luxury publications, jewellery specialist titles, specialist
            technology feeds, and business commentary. Two static page scrapers supplement
            the feed list.
          </p>
          <p>
            A <strong>Tavily web-discovery</strong> layer runs in parallel each cycle,
            using LLM-generated search queries per category to surface high-quality articles
            that fall outside the curated feed list.
          </p>
        </div>
      ),
    },
    {
      label: 'Ingestion',
      content: (
        <p>
          Articles are ingested on an automated schedule into an append-only store.
          Duplicate detection runs on URL and title similarity — each article appears
          at most once regardless of how many feeds publish it.
        </p>
      ),
    },
    {
      label: 'Weekly window',
      content: (
        <p>
          Monday 00:00 through Sunday 23:59, <strong>Europe/Copenhagen</strong> timezone
          (CET/CEST). Each digest covers only articles with a publication date that falls
          within that window.
        </p>
      ),
    },
    {
      label: 'Classification',
      content: (
        <p>
          Articles are assigned to one of four topic categories using a deterministic
          keyword and source heuristic. Source-level overrides take priority (e.g. a
          jewellery trade publication is always assigned to Jewellery Industry regardless
          of article content). Classification uses no LLM inference and is fully
          auditable.
        </p>
      ),
    },
    {
      label: 'Ranking',
      content: (
        <div className="space-y-2">
          <p>
            A deterministic pre-score is computed for each article:{' '}
            <strong>recency weight</strong> (constant baseline),{' '}
            <strong>source tier weight</strong> (0–0.15), and{' '}
            <strong>keyword relevance boost</strong> (0.05 per match). Low-signal
            markers carry a −0.20 penalty.
          </p>
          <p>
            The top 100 candidates per category are then passed to{' '}
            <code className="text-[12px] bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded font-mono">o4-mini</code>{' '}
            (reasoning model), which applies editorial criteria —
            business materiality, originality, timeliness — to select the final
            7 articles per category. A hard diversity guard caps any single source
            at 3 articles per category.
          </p>
        </div>
      ),
    },
    {
      label: 'AI — what it does',
      content: (
        <ul className="space-y-2">
          {[
            'Reranks pre-scored article candidates using editorial criteria (o4-mini)',
            'Generates concise web summaries from title, source, date, and snippet only — no full article required',
            'Generates email digest bullets (3 per article) from up to 8,000 characters of the full fetched article text',
            'Produces the weekly one-sentence insight via a two-stage process: one model generates four candidates each through a distinct analytical lens (Implication, Paradox, Reframe, Pattern); a second model (gpt-4.1) judges and selects the most original',
            'Scripts the podcast briefing (~12–15 min) from the top 8 articles',
            'Generates the weekly cover image via a SceneDirector prompt pipeline',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-[var(--color-text-secondary)]">
              <span className="font-mono text-[var(--color-accent)] mt-0.5 shrink-0 select-none">+</span>
              <span className="text-[15px] leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: "AI — what it doesn't",
      content: (
        <ul className="space-y-2">
          {[
            'Accessing paywalled or subscription-gated content — articles that cannot be fetched are skipped entirely',
            'Human curation or manual editorial override of ranked results',
            'Rewriting or editorialising source material — email bullets reflect the article as published',
            'Generating content not grounded in a published source article',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-[var(--color-text-secondary)]">
              <span className="font-mono text-[var(--color-accent)] mt-0.5 shrink-0 select-none">—</span>
              <span className="text-[15px] leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: 'Cadence',
      content: (
        <p>
          Published weekly. The pipeline runs automatically each week; new issues appear
          in the <Link href="/archive" className="text-[var(--color-accent)] underline underline-offset-2 hover:opacity-75 transition-opacity">archive</Link> as
          soon as they are built. Subscribers receive the email digest on the same
          schedule.
        </p>
      ),
    },
    {
      label: 'Transparency',
      content: (
        <div className="space-y-2">
          <p>
            Article selection is <strong>AI-augmented, explainable-first</strong>.
            Every ranking signal is deterministic and logged; the LLM reranker sees
            only pre-scored candidates and applies editorial criteria, not preference.
          </p>
          <p>
            We are not affiliated with any publisher. All links go to original source
            articles. Summaries are AI-generated and may miss nuances — always read
            the full piece for complete information.
          </p>
          <p>
            Questions or source suggestions?{' '}
            <Link href="/feedback" className="text-[var(--color-accent)] underline underline-offset-2 hover:opacity-75 transition-opacity font-medium">
              Share your feedback →
            </Link>
          </p>
        </div>
      ),
    },
  ];

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>

      {/* Hero — left-aligned */}
      <section
        className="relative w-full"
        style={{
          minHeight: 220,
          background: 'linear-gradient(120deg,#2e3741 50%, #4a5a6b 100%)',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div className="w-full max-w-5xl mx-auto px-8 md:px-16 py-12 relative z-10 text-white">
          <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/50 mb-3">
            Operational Document
          </p>
          <h1 className="text-page-h1 font-bold mb-3" style={{ textShadow: '0 1px 4px rgba(18,30,49,0.15)' }}>
            Methodology
          </h1>
          <p className="text-base text-gray-200 leading-relaxed max-w-xl">
            How the weekly digest is collected, ranked, and published
          </p>
        </div>
      </section>

      {/* Audit document */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-16">

        <dl className="divide-y divide-stone-200 dark:divide-stone-700">
          {sections.map((section) => (
            <div
              key={section.label}
              className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 md:gap-8 py-8"
            >
              <dt className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--color-accent)] pt-1">
                {section.label}
              </dt>
              <dd className="text-[15px] leading-relaxed text-[var(--color-text-primary)] [&_strong]:text-[var(--color-text-primary)] [&_strong]:font-semibold [&_p]:mb-0">
                {section.content}
              </dd>
            </div>
          ))}
        </dl>

        {/* Pipeline metadata footer */}
        <div className="border-t border-stone-200 dark:border-stone-700 mt-8 pt-6 pb-4">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)]">
            Pipeline last run: {lastRunFormatted} · CET ·{' '}
            <span className="text-[var(--color-accent)]">{issueCount} issues archived</span>
          </p>
        </div>

      </section>
    </main>
  );
}
