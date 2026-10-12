import Link from 'next/link';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Terms of use for luxury-intel.com, the Luxury Intelligence weekly digest, its emails, podcast and videos.',
  alternates: {
    canonical: `${siteUrl}/terms`,
  },
  openGraph: {
    title: 'Terms of Use – Luxury Intelligence',
    description: 'Terms of use for luxury-intel.com, the Luxury Intelligence weekly digest, its emails, podcast and videos.',
    images: [`${siteUrl}/api/og`],
  },
};

const link = 'text-[var(--color-accent)] underline underline-offset-2';

/**
 * Plain-language terms. Written 2026-10-12, mainly because YouTube's API
 * audit requires published terms that bind viewers of our embedded videos to
 * the YouTube Terms of Service. Keep "Last updated" current when editing.
 */
export default function TermsPage() {
  return (
    <main className="w-full min-h-screen bg-[var(--color-bg)]">
      <section className="max-w-3xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <h1 className="text-page-h1 font-bold mb-2 text-[var(--color-text-primary)]">Terms of Use</h1>
        <p className="text-meta text-[var(--color-text-secondary)] mb-10">Last updated 12 October 2026</p>

        <div className="space-y-6 text-body text-[var(--color-text-secondary)]">
          <p>
            These terms apply to luxury-intel.com and everything published under the Luxury Intelligence name:
            the weekly digest, its emails, the podcast and the videos. Luxury Intelligence is an independent
            publication run from Copenhagen, Denmark. By using the site or its services you accept these terms.
            Questions: <a href="mailto:feedback@luxury-intel.com?subject=Terms" className={link}>feedback@luxury-intel.com</a>.
          </p>

          <div>
            <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-2">What we publish</h2>
            <p>
              Each week we select news articles from other publications, link to them and add short AI-assisted
              summaries and commentary. The original articles belong to their publishers and are subject to their
              own terms. Nothing here is investment, legal or business advice. We work to be accurate but give no
              guarantee that every summary is complete or error-free; the linked source is the authority.
            </p>
          </div>

          <div>
            <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-2">Videos and YouTube</h2>
            <p>
              Our videos are hosted on YouTube and shown on this site with YouTube&apos;s embedded player. By
              watching them, here or on YouTube, you agree to be bound by the{' '}
              <a href="https://www.youtube.com/t/terms" className={link} target="_blank" rel="noopener">YouTube Terms of Service</a>,
              and YouTube&apos;s handling of your data is covered by the{' '}
              <a href="https://policies.google.com/privacy" className={link} target="_blank" rel="noopener">Google Privacy Policy</a>.
              Video narration is AI-generated, and brand names and logos appear only to identify the companies
              a story is about; they don&apos;t imply any endorsement.
            </p>
          </div>

          <div>
            <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-2">Subscriptions and support</h2>
            <p>
              The email digest is free. Paid supporter plans are optional and processed by Stripe; you can cancel at
              any time and the plan ends at the close of the current billing period. You can unsubscribe from emails
              with the link in every message.
            </p>
          </div>

          <div>
            <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-2">Using our content</h2>
            <p>
              You may read, share links to and quote short parts of our summaries and commentary with attribution to
              Luxury Intelligence and a link to luxury-intel.com. Please don&apos;t republish whole digests, scrape
              the site in bulk or use it in a way that disrupts the service.
            </p>
          </div>

          <div>
            <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-2">Liability</h2>
            <p>
              The service is provided as is. To the extent the law allows, Luxury Intelligence is not liable for
              losses arising from use of the site, the content or linked third-party sites. Nothing in these terms
              limits rights you have under mandatory consumer law.
            </p>
          </div>

          <div>
            <h2 className="text-section font-semibold text-[var(--color-text-primary)] mb-2">Privacy, changes and law</h2>
            <p>
              How we handle personal data is described in our{' '}
              <Link href="/about#privacy" className={link}>Privacy Policy</Link>. We may update these terms and will
              change the date above when we do. Danish law applies.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
