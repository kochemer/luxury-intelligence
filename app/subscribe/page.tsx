import Link from 'next/link';
import SubscribePricing from '../components/SubscribePricing';

export default function SubscribePage() {
  // Safely read environment variable (server-side)
  // Fallback to Formspree endpoint if not configured
  const formAction =
    process.env.NEXT_PUBLIC_FEEDBACK_FORM_ACTION?.trim() ||
    'https://formspree.io/f/xwvpbnbz';

  return (
    <main className="w-full bg-[#f7f9fb] min-h-screen">
      {/* Hero */}
      <section className="w-full border-b border-gray-200 bg-gradient-to-r from-[#2e3741] via-[#394855] to-[#4a5a6b]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Weekly email digest
          </h1>
          <p className="text-sm sm:text-base text-gray-100 leading-relaxed mb-3 max-w-xl">
            A concise weekly briefing across{' '}
            <span className="font-semibold">AI & strategy</span>,{' '}
            <span className="font-semibold">ecommerce & retail tech</span>,{' '}
            <span className="font-semibold">luxury & consumer</span>, and{' '}
            <span className="font-semibold">jewellery</span>.
          </p>
          <p className="text-xs sm:text-sm text-gray-200 mb-6">
            Delivered once a week (covering Monday–Sunday, CET). No noise, just
            curated signals.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-[#2e3741]"
            >
              View latest digest
            </Link>
            <span className="text-gray-200 text-xs">or browse the archive</span>
            <Link
              href="/archive"
              className="text-xs font-medium text-yellow-200 underline underline-offset-4 hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-yellow-300 focus-visible:ring-offset-[#2e3741] rounded"
            >
              Archive
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-10">
        {/* Pricing + email capture */}
        <SubscribePricing formAction={formAction} />

        {/* What’s included */}
        <section aria-labelledby="whats-included-heading">
          <h2
            id="whats-included-heading"
            className="text-lg sm:text-xl font-semibold text-gray-900 mb-3"
          >
            What&apos;s included
          </h2>
          <div className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5 shadow-sm">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Top stories per category, curated from a broad source list.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Direct links to original sources for deeper reading.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Optional AI-assisted summaries to speed up scanning.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-[3px] text-green-500">●</span>
                <span>Archive access on the website so you can revisit past weeks.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="text-lg sm:text-xl font-semibold text-gray-900 mb-3"
          >
            FAQ
          </h2>
          <div className="space-y-4 text-sm text-gray-800">
            <div>
              <h3 className="font-medium text-gray-900">
                When do emails go out?
              </h3>
              <p className="mt-1 text-gray-700">
                The digest covers Monday–Sunday in Central European Time (CET).
                Emails are typically sent early in the following week once the
                weekly digest is built.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Can I cancel?</h3>
              <p className="mt-1 text-gray-700">
                Yes. Subscriptions will be cancellable at any time. For now,
                payments are not enabled—this page is a preview of the future
                subscription flow.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Is AI used?</h3>
              <p className="mt-1 text-gray-700">
                Yes, AI is used to help classify and summarise articles, but the
                underlying sources are always linked so you can read them in
                full. The goal is to reduce noise, not to replace original
                reporting.
              </p>
            </div>
          </div>
        </section>

        {/* Trust footer note */}
        <section className="border-t border-dashed border-gray-300 pt-4 text-xs text-gray-500">
          <p>
            Payments are <span className="font-semibold">not</span> enabled yet
            — this is a placeholder page while subscription options are tested.
          </p>
        </section>
      </section>
    </main>
  );
}



