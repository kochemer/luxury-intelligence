import Link from 'next/link';
import type { Metadata } from 'next';
import FeedbackForm from '../components/FeedbackForm';

export const metadata: Metadata = {
  title: 'Write to Us – Feedback',
  description: 'Suggest a source, flag an issue, or share a thought about the Luxury Intelligence weekly digest.',
  robots: { index: false, follow: true },
};

export default function FeedbackPage() {
  const formAction =
    process.env.NEXT_PUBLIC_FEEDBACK_FORM_ACTION?.trim() ||
    'https://formspree.io/f/xwvpbnbz';

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>

      {/* Hero — left-aligned, consistent with other inner pages */}
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
            Correspondence
          </p>
          <h1 className="text-page-h1 font-bold mb-3" style={{ textShadow: '0 1px 4px rgba(18,30,49,0.15)' }}>
            Write to Us
          </h1>
          <p className="text-base text-gray-200 leading-relaxed max-w-xl">
            Suggest a source, flag an issue, or share a thought about the digest
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-5xl mx-auto px-4 md:px-8 py-14 md:py-20">
        <div className="max-w-xl">

          {formAction ? (
            /* Letter container */
            <div
              className="bg-[#faf8f2] rounded-sm p-8 md:p-10"
              style={{
                boxShadow: 'inset 0 0 0 1px rgba(139,105,20,0.12), 0 2px 20px rgba(0,0,0,0.06)',
              }}
            >
              {/* Letter header */}
              <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-[var(--color-accent)] mb-2">
                A Note to the Editor
              </p>
              <p className="font-sans text-sm text-[var(--color-text-secondary)] leading-relaxed mb-8 max-w-sm">
                Use this form to suggest sources, flag issues, or share anything else about the brief.
              </p>

              <FeedbackForm formAction={formAction} />
            </div>
          ) : (
            /* Not configured fallback */
            <div
              className="bg-[#faf8f2] rounded-sm p-8 md:p-10 text-center"
              style={{
                boxShadow: 'inset 0 0 0 1px rgba(139,105,20,0.12), 0 2px 20px rgba(0,0,0,0.06)',
              }}
            >
              <span className="block text-2xl text-[var(--color-accent)] mb-4 select-none" aria-hidden="true">✦</span>
              <p className="font-serif text-lg text-[var(--color-text-primary)] mb-2">
                The form is currently unavailable.
              </p>
              <p className="font-sans text-sm text-[var(--color-text-secondary)] mb-6">
                Please reach out directly by email.
              </p>
              <a
                href="mailto:luxuryintelligence@zohomail.eu?subject=Note%20to%20the%20Editor"
                className="font-sans text-sm tracking-wider text-[var(--color-accent)] border border-[var(--color-accent)] px-6 py-2.5 rounded-[2px] hover:bg-[var(--color-accent)] hover:text-white transition-colors duration-200 inline-block"
              >
                Send Email →
              </a>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-10 flex flex-wrap gap-4 items-center">
            <Link
              href="/about"
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
            >
              About →
            </Link>
            <Link
              href="/methodology"
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
            >
              Methodology →
            </Link>
            <Link
              href="/"
              className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
            >
              ← Home
            </Link>
          </div>

        </div>
      </section>
    </main>
  );
}
