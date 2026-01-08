import Link from 'next/link';
import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app";

export const metadata: Metadata = {
  title: 'Methodology – How Luxury Intelligence is curated',
  description: 'How the weekly AI, ecommerce, luxury and jewellery digest is collected, ranked and summarized.',
  alternates: {
    canonical: '/methodology',
  },
  openGraph: {
    title: 'Methodology – How Luxury Intelligence is curated',
    description: 'How the weekly AI, ecommerce, luxury and jewellery digest is collected, ranked and summarized.',
    images: [`${siteUrl}/og-default.svg`],
  },
  twitter: {
    title: 'Methodology – How Luxury Intelligence is curated',
    description: 'How the weekly AI, ecommerce, luxury and jewellery digest is collected, ranked and summarized.',
    images: [`${siteUrl}/og-default.svg`],
  },
};

export default function MethodologyPage() {
  return (
    <main style={{
      maxWidth: '100vw',
      minHeight: '100vh',
      fontFamily: 'system-ui, Arial, sans-serif',
      background: '#f7f9fb',
      margin: 0,
      padding: 0,
    }}>
      {/* Hero Section */}
      <section style={{
        position: 'relative',
        width: '100%',
        minHeight: 240,
        background: 'linear-gradient(120deg,#2e3741 50%, #4a5a6b 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div className="w-full max-w-[1200px] lg:max-w-[1400px] 2xl:max-w-[1560px] mx-auto px-4 md:px-8" style={{
          position: 'relative',
          zIndex: 2,
          color: '#fff',
          padding: '2rem 1.5rem 1.75rem 1.5rem',
          textAlign: 'center',
        }}>
          <h1 className="text-4xl md:text-5xl font-bold mb-3" style={{
            textShadow: '0 1px 4px rgba(18,30,49,0.15)'
          }}>
            Methodology
          </h1>
          <div className="text-base md:text-lg text-gray-100 leading-relaxed max-w-xl mx-auto">
            How the weekly digest is produced
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* What this site is */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            What this site is
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            A weekly curated industry intelligence digest covering <strong className="text-gray-900">AI & Strategy</strong>, <strong className="text-gray-900">Ecommerce & Retail Tech</strong>, <strong className="text-gray-900">Luxury & Consumer</strong>, and <strong className="text-gray-900">Jewellery Industry</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Each week, we select the most relevant articles, generate concise summaries, and present them in an easy-to-scan format.
          </p>
        </div>

        {/* How articles are collected */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            How articles are collected
          </h2>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed">
            <li>
              <strong className="text-gray-900">Sources:</strong> RSS feeds and selected web pages from trusted industry publications, news sites, and expert blogs.
            </li>
            <li>
              <strong className="text-gray-900">Ingestion:</strong> Articles are automatically ingested on a regular schedule using an append-only system.
            </li>
            <li>
              <strong className="text-gray-900">Deduplication:</strong> Duplicate articles are automatically identified and filtered to ensure each article appears only once.
            </li>
          </ul>
        </div>

        {/* How articles are selected */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            How articles are selected
          </h2>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed">
            <li>
              <strong className="text-gray-900">Weekly window:</strong> Monday through Sunday, Europe/Copenhagen timezone. Each digest covers articles published during that week.
            </li>
            <li>
              <strong className="text-gray-900">Categorization:</strong> Articles are classified into one of four topic categories using LLM-assisted classification.
            </li>
            <li>
              <strong className="text-gray-900">Ranking:</strong> Articles are scored based on relevance, recency, and source diversity. Diversity guards prevent over-representation of a single source.
            </li>
            <li>
              <strong className="text-gray-900">Top-N selection:</strong> The highest-scoring articles in each category are selected and published per category.
            </li>
          </ul>
        </div>

        {/* How AI is used */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            How AI is used
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            AI is used in two ways:
          </p>
          <ul className="space-y-3 text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            <li>
              <strong className="text-gray-900">Categorization:</strong> LLM-assisted classification helps assign articles to the appropriate topic category.
            </li>
            <li>
              <strong className="text-gray-900">Summaries:</strong> Short summaries are generated when article snippets are available, using only the title, source, publication date, and snippet.
            </li>
          </ul>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            <strong className="text-gray-900">What AI does not do:</strong>
          </p>
          <ul className="space-y-2 text-base md:text-lg text-gray-700 leading-relaxed mb-4">
            <li>• Full-article scraping or rewriting</li>
            <li>• Accessing paywalled content</li>
            <li>• Making editorial decisions (selection and ranking are algorithmic)</li>
          </ul>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            AI inputs are limited to metadata (title, source, date, snippet) and deterministic settings are used where possible to ensure consistency and explainability.
          </p>
        </div>

        {/* Transparency & feedback */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Transparency & feedback
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-3">
            Article selection is <strong className="text-gray-900">AI-augmented, explainable-first</strong>. We prioritize transparency in how articles are collected, categorized, and ranked.
          </p>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Questions, suggestions, or want to suggest a source? <Link href="/feedback" className="text-blue-700 hover:text-blue-800 underline font-medium">Share your feedback</Link>.
          </p>
        </div>

        {/* Update cadence */}
        <div className="mb-10 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Update cadence
          </h2>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Updated weekly. New briefs are published each week covering Monday through Sunday (CET timezone). Past weekly briefs are available in the <Link href="/archive" className="text-blue-700 hover:text-blue-800 underline">archive</Link>.
          </p>
        </div>

        {/* Footer note */}
        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500 text-center">
            Not affiliated with any publishers. Links go to original sources.
          </p>
        </div>
      </section>
    </main>
  );
}
