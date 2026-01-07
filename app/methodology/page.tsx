import Link from 'next/link';

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
        <div style={{
          position: 'absolute',
          zIndex: 0,
          top: 0, left: 0, width: '100%', height: '100%',
        }}>
        </div>
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
            How This Is Curated
          </h1>
          <div className="text-base md:text-lg text-gray-100 leading-relaxed max-w-xl mx-auto">
            How we select, rank, and summarize content each week
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* What This Is */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            What This Is
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
            A weekly curated brief across four topics: <strong className="text-gray-900">AI & Strategy</strong>, 
            <strong className="text-gray-900"> Ecommerce & Retail Tech</strong>, <strong className="text-gray-900"> Luxury & Consumer</strong>, 
            and <strong className="text-gray-900"> Jewellery Industry</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Each week, we select the most relevant articles, generate concise summaries, and present them in an easy-to-scan format.
          </p>
        </div>

        {/* Sources */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Sources
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
            We monitor RSS feeds and selected web pages from trusted industry publications, news sites, and expert blogs. 
            Articles are automatically ingested on a regular schedule.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Know a source we should include? <Link href="/feedback" className="text-blue-600 hover:text-blue-800 underline">Suggest a source</Link>.
          </p>
        </div>

        {/* How Items Are Chosen */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            How Items Are Chosen
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
            Articles are classified into one of four topic categories and scored based on <strong className="text-gray-900">relevance</strong>, 
            <strong className="text-gray-900"> recency</strong>, and <strong className="text-gray-900">source quality</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
            We apply diversity guards to avoid over-representing a single source, and articles that appear to be sponsored content or press releases receive lower scores.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            The highest-scoring articles in each category are selected for the weekly brief.
          </p>
        </div>

        {/* What AI Does */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            What AI Does
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
            AI generates summaries from the article's title, source, publication date, and available snippet or excerpt. 
            We do not scrape or read full articles.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
            Summaries are designed to help you quickly assess relevance, but they may miss important nuances or contain inaccuracies. 
            Always refer to the original article for complete information.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            AI is used only for summarization. Selection, ranking, and categorization are done algorithmically based on metadata and scoring rules.
          </p>
        </div>

        {/* Updates & Archive */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Updates & Archive
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
            New briefs are published weekly, covering Monday through Sunday (CET timezone). Each brief includes articles published during that week.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Past weekly briefs are available in the <Link href="/archive" className="text-blue-600 hover:text-blue-800 underline">archive</Link>.
          </p>
        </div>

        {/* Feedback */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Feedback
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Questions, suggestions, or issues? <Link href="/feedback" className="text-blue-600 hover:text-blue-800 underline">Share your feedback</Link>.
          </p>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-gray-200 pt-6 mt-8">
          <p className="text-sm text-gray-500 text-center">
            Not affiliated with any publishers. Links go to original sources.
          </p>
        </div>
      </section>
    </main>
  );
}



