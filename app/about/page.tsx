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
        <div style={{
          position: 'relative',
          zIndex: 2,
          color: '#fff',
          width: '100%',
          maxWidth: 900,
          margin: '0 auto',
          padding: '3rem 1.5rem 2.5rem 1.5rem',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '1rem',
            textShadow: '0 2px 8px rgba(18,30,49,0.20)'
          }}>
            About This Digest
          </h1>
          <div style={{
            fontSize: '1.15rem',
            fontWeight: 400,
            color: '#e2ecfa',
            lineHeight: 1.7,
            maxWidth: 600,
            margin: '0 auto'
          }}>
            Understanding how we curate, score, and summarize the week's most important news
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section style={{
        maxWidth: 900,
        margin: '3rem auto 4rem auto',
        padding: '0 1.5rem',
      }}>
        {/* Purpose Card */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 24px 0 rgba(28,68,90,.06)',
          padding: '2.5rem 2rem',
          marginBottom: '2rem',
        }}>
          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 600,
            color: '#143c42',
            marginBottom: '1rem',
          }}>
            Purpose
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1rem',
          }}>
            The AI Weekly Digest saves you hours of reading by curating the most relevant articles across four key sectors: 
            <strong style={{ color: '#233442' }}> AI & Strategy</strong>, 
            <strong style={{ color: '#233442' }}> Ecommerce & Retail Tech</strong>, 
            <strong style={{ color: '#233442' }}> Luxury & Consumer</strong>, and 
            <strong style={{ color: '#233442' }}> Jewellery Industry</strong>.
          </p>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
          }}>
            Each week, we automatically ingest articles from trusted sources, score them for relevance and recency, 
            generate AI-powered summaries, and present the top articles in an easy-to-scan format.
          </p>
        </div>

        {/* How It Works Card */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 24px 0 rgba(28,68,90,.06)',
          padding: '2.5rem 2rem',
          marginBottom: '2rem',
        }}>
          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 600,
            color: '#143c42',
            marginBottom: '1.5rem',
          }}>
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
                <h3 style={{
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  color: '#233442',
                  marginBottom: '0.5rem',
                }}>
                  Sources
                </h3>
                <p style={{
                  fontSize: '1.05rem',
                  color: '#5c6880',
                  lineHeight: 1.7,
                }}>
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
                <h3 style={{
                  fontSize: '1.3rem',
                  fontWeight: 600,
                  color: '#233442',
                  marginBottom: '0.5rem',
                }}>
                  Scoring
                </h3>
                <p style={{
                  fontSize: '1.05rem',
                  color: '#5c6880',
                  lineHeight: 1.7,
                }}>
                  Each article is classified into one of four topic categories and scored based on relevance, recency, 
                  and source quality. The highest-scoring articles are selected for each weekly digest.
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
        <div style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 24px 0 rgba(28,68,90,.06)',
          padding: '2.5rem 2rem',
          marginBottom: '2rem',
        }}>
          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 600,
            color: '#143c42',
            marginBottom: '1rem',
          }}>
            Transparency & Disclaimer
          </h2>
          <div style={{
            background: '#f4f7fa',
            borderLeft: '4px solid #3a7b9c',
            borderRadius: 4,
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
          }}>
            <p style={{
              fontSize: '1.05rem',
              color: '#31353c',
              lineHeight: 1.7,
              margin: 0,
              fontStyle: 'italic',
            }}>
              <strong>AI-Generated Content:</strong> Summaries are generated using AI and may contain inaccuracies or 
              miss important nuances. Always refer to the original article for complete information.
            </p>
          </div>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1rem',
          }}>
            <strong style={{ color: '#233442' }}>Not Investment or Business Advice:</strong> This digest is for 
            informational purposes only. Articles and summaries are not intended as investment, legal, or business advice.
          </p>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1rem',
          }}>
            <strong style={{ color: '#233442' }}>Source Selection:</strong> Sources are selected based on relevance, 
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
            <Link href="/feedback" style={{
              fontWeight: 500,
              color: '#20678c',
              background: '#f4f7fa',
              borderRadius: 3,
              padding: '0.5rem 1.2rem',
              textDecoration: 'none',
              fontSize: '1rem',
              border: '1px solid #e7ecf0',
            }}>
              Feedback
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

