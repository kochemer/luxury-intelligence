import Link from 'next/link';

export default function AboutPage() {
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{
            textShadow: '0 2px 8px rgba(18,30,49,0.20)'
          }}>
            About This Brief
          </h1>
          <div className="text-lg md:text-xl text-gray-200 leading-relaxed max-w-2xl mx-auto">
            Understanding how we curate, score, and summarize the week's most important news
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* Purpose Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-4">
            Purpose
          </h2>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            Luxury Intelligence saves you hours of reading by curating the most relevant articles across four key sectors: 
            <strong className="text-gray-900"> AI & Strategy</strong>, 
            <strong className="text-gray-900"> Ecommerce & Retail Tech</strong>, 
            <strong className="text-gray-900"> Luxury & Consumer</strong>, and 
            <strong className="text-gray-900"> Jewellery Industry</strong>.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed">
            Each week, we automatically ingest articles from trusted sources, score them for relevance and recency, 
            generate AI-powered summaries, and present the top articles in an easy-to-scan format.
          </p>
        </div>

        {/* How It Works Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-8">
            How It Works
          </h2>
          
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#20678c',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}>
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Sources
                </h3>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  We monitor RSS feeds and web pages from trusted industry publications, news sites, and expert blogs. 
                  Articles are automatically ingested on a regular schedule.
                </p>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#20678c',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}>
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Scoring & Ranking
                </h3>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-3">
                  Each article is classified into one of four topic categories and scored based on <strong className="text-gray-900">relevance</strong>, <strong className="text-gray-900">recency</strong>, 
                  and <strong className="text-gray-900">source quality</strong>. The highest-scoring articles are selected for each weekly brief.
                </p>
                <p className="text-base md:text-lg text-gray-600 leading-relaxed">
                  Articles are ranked within each category by combining these factors: <strong className="text-gray-900">relevance</strong> measures how closely the content matches the category's focus, 
                  <strong className="text-gray-900"> recency</strong> prioritizes recent publications, and <strong className="text-gray-900">source quality</strong> reflects the publication's reputation and reliability. 
                  The top articles in each category are displayed in order of their combined score.
                </p>
              </div>
            </div>
          </div>

          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#20678c',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}>
                3
              </div>
              <div>
                <h3 style={{
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  color: '#233442',
                  marginBottom: '0.5rem',
                }}>
                  AI Summaries
                </h3>
                <p style={{
                  fontSize: '1.05rem',
                  color: '#5c6880',
                  lineHeight: 1.7,
                }}>
                  Selected articles receive AI-generated summaries that capture key points and insights, helping you 
                  quickly understand the article's relevance before deciding to read the full piece.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transparency & Disclaimer Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-6">
            Transparency & Disclaimer
          </h2>
          <div className="bg-blue-50 border-l-4 border-blue-600 rounded p-4 mb-6">
            <p className="text-base md:text-lg text-gray-800 leading-relaxed italic m-0">
              <strong>AI-Generated Content:</strong> Summaries are generated using AI and may contain inaccuracies or 
              miss important nuances. Always refer to the original article for complete information.
            </p>
          </div>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            <strong className="text-gray-900">Not Investment or Business Advice:</strong> This digest is for 
            informational purposes only. Articles and summaries are not intended as investment, legal, or business advice.
          </p>
          <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-4">
            <strong className="text-gray-900">Source Selection:</strong> Sources are selected based on relevance, 
            quality, and regular publication schedules. We aim to include diverse perspectives but cannot guarantee 
            comprehensive coverage of all relevant publications.
          </p>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
          }}>
            <strong style={{ color: '#233442' }}>Automated Process:</strong> This digest is generated automatically 
            through our ingestion, classification, and summarization pipeline. While we monitor for quality, the process 
            is largely automated and may occasionally include articles that don't perfectly match their assigned category.
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
            <Link href="/support" style={{
              fontWeight: 500,
              color: '#20678c',
              background: '#f4f7fa',
              borderRadius: 3,
              padding: '0.5rem 1.2rem',
              textDecoration: 'none',
              fontSize: '1rem',
              border: '1px solid #e7ecf0',
            }}>
              Support
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
      </section>
    </main>
  );
}

