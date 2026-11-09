import Link from 'next/link';
import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Support & Contact',
  description: 'Get help, suggest sources, or report issues with the Luxury Intelligence weekly digest.',
  alternates: {
    canonical: `${siteUrl}/support`,
  },
  openGraph: {
    title: 'Support & Contact – Luxury Intelligence',
    description: 'Get help, suggest sources, or report issues with the Luxury Intelligence weekly digest.',
    images: [`${siteUrl}/api/og`],
  },
};

export default function SupportPage() {
  return (
    <main style={{
      maxWidth: '100vw',
      minHeight: '100vh',
      fontFamily: 'system-ui, Arial, sans-serif',
      background: 'var(--color-bg)',
      margin: 0,
      padding: 0,
    }}>
      {/* Hero Section */}
      <section style={{
        position: 'relative',
        width: '100%',
        minHeight: 280,
        background: 'linear-gradient(120deg,#2e3741 40%, #637b8b 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderBottom: '8px solid #eaeaea'
      }}>
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6" style={{
          position: 'relative',
          zIndex: 2,
          color: '#fff',
          padding: '3rem 1.5rem 2.5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h1 className="text-page-h1 font-bold mb-4" style={{
            textShadow: '0 2px 8px rgba(18,30,49,0.20)'
          }}>
            Support & Contact
          </h1>
          <div className="text-body text-gray-200 max-w-2xl mx-auto">
            Get help, suggest sources, or report issues
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-prose mx-auto">
        {/* Suggest Sources Card */}
        <div className="bg-[var(--color-surface)] rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-section font-semibold text-gray-900 mb-4">
            Suggest a Source
          </h2>
          <p className="text-body text-gray-600 mb-6">
            We're always looking to expand our coverage with high-quality sources. If you know of a publication, blog, 
            or news site that regularly publishes relevant content in our four focus areas, we'd love to hear about it.
          </p>
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-4 mb-6">
            <p className="text-body text-gray-800 m-0 mb-2">
              <strong>What we look for:</strong>
            </p>
            <ul className="text-body text-gray-800 m-0 pl-6 list-disc">
              <li>Regular publication schedule (at least weekly)</li>
              <li>RSS feed or structured content available</li>
              <li>Relevance to AI, ecommerce, luxury, consumer goods, or jewellery</li>
              <li>High-quality, original content</li>
            </ul>
          </div>
          <p className="text-body text-gray-600">
            To suggest sources, please contact us with the publication name, URL, and RSS feed (if available).
          </p>
        </div>

        {/* Report Issues Card */}
        <div className="bg-[var(--color-surface)] rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-section font-semibold text-gray-900 mb-4">
            Report Issues
          </h2>
          <p className="text-body text-gray-600 mb-6">
            Found a broken link, incorrect categorization, or other issue? We appreciate your help in keeping the digest 
            accurate and useful.
          </p>
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded p-4 mb-6">
            <p className="text-body text-amber-900 m-0 mb-2">
              <strong>Common issues to report:</strong>
            </p>
            <ul className="text-body text-amber-900 m-0 pl-6 list-disc">
              <li>Broken or incorrect article links</li>
              <li>Articles in the wrong category</li>
              <li>Missing or incorrect AI summaries</li>
              <li>Duplicate articles</li>
              <li>Technical errors or display issues</li>
            </ul>
          </div>
          <p className="text-body text-gray-600">
            To report issues, please contact us with as much detail as possible, such as the article title, week label, and a description 
            of the problem.
          </p>
        </div>

        {/* Contact Card */}
        <div className="bg-[var(--color-surface)] rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-section font-semibold text-gray-900 mb-4">
            Contact
          </h2>
          <p className="text-body text-gray-600 mb-6">
            For general inquiries, questions, or feedback, please contact us. We aim to respond to all 
            inquiries within a few business days.
          </p>
        </div>

        {/* Navigation */}
        <div style={{
          textAlign: 'center',
          marginTop: '2.5rem',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
          }}>
            <Link href="/about" style={{
              fontWeight: 500,
              color: '#20678c',
              background: '#f4f7fa',
              borderRadius: 3,
              padding: '0.5rem 1.2rem',
              textDecoration: 'none',
              fontSize: '1rem',
              border: '1px solid #e7ecf0',
            }}>
              About
            </Link>
          </div>
          <Link href="/" style={{
            fontWeight: 500,
            color: '#06244c',
            background: '#fed236',
            borderRadius: 3,
            padding: '0.65rem 1.6rem',
            textDecoration: 'none',
            display: 'inline-block',
            transition: 'background 0.19s, color 0.16s',
            fontSize: '1.12rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.07)'
          }}>
            Back to Home
          </Link>
        </div>
        </div>
      </section>
    </main>
  );
}

