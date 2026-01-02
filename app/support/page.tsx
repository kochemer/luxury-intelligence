import Link from 'next/link';

export default function SupportPage() {
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
            Support & Contact
          </h1>
          <div style={{
            fontSize: '1.15rem',
            fontWeight: 400,
            color: '#e2ecfa',
            lineHeight: 1.7,
            maxWidth: 600,
            margin: '0 auto'
          }}>
            Get help, suggest sources, or report issues
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section style={{
        maxWidth: 900,
        margin: '3rem auto 4rem auto',
        padding: '0 1.5rem',
      }}>
        {/* Suggest Sources Card */}
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
            Suggest a Source
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1.5rem',
          }}>
            We're always looking to expand our coverage with high-quality sources. If you know of a publication, blog, 
            or news site that regularly publishes relevant content in our four focus areas, we'd love to hear about it.
          </p>
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
            }}>
              <strong>What we look for:</strong>
            </p>
            <ul style={{
              fontSize: '1.05rem',
              color: '#31353c',
              lineHeight: 1.7,
              margin: '0.5rem 0 0 0',
              paddingLeft: '1.5rem',
            }}>
              <li>Regular publication schedule (at least weekly)</li>
              <li>RSS feed or structured content available</li>
              <li>Relevance to AI, ecommerce, luxury, consumer goods, or jewellery</li>
              <li>High-quality, original content</li>
            </ul>
          </div>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
          }}>
            Please use the <Link href="/feedback" style={{ color: '#20678c', textDecoration: 'underline' }}>feedback form</Link> to 
            suggest sources. Include the publication name, URL, and RSS feed (if available).
          </p>
        </div>

        {/* Report Issues Card */}
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
            Report Issues
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1.5rem',
          }}>
            Found a broken link, incorrect categorization, or other issue? We appreciate your help in keeping the digest 
            accurate and useful.
          </p>
          <div style={{
            background: '#fff1e2',
            borderLeft: '4px solid #ffdfa9',
            borderRadius: 4,
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
          }}>
            <p style={{
              fontSize: '1.05rem',
              color: '#913d00',
              lineHeight: 1.7,
              margin: 0,
            }}>
              <strong>Common issues to report:</strong>
            </p>
            <ul style={{
              fontSize: '1.05rem',
              color: '#913d00',
              lineHeight: 1.7,
              margin: '0.5rem 0 0 0',
              paddingLeft: '1.5rem',
            }}>
              <li>Broken or incorrect article links</li>
              <li>Articles in the wrong category</li>
              <li>Missing or incorrect AI summaries</li>
              <li>Duplicate articles</li>
              <li>Technical errors or display issues</li>
            </ul>
          </div>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
          }}>
            Use the <Link href="/feedback" style={{ color: '#20678c', textDecoration: 'underline' }}>feedback form</Link> to 
            report issues. Please include as much detail as possible, such as the article title, week label, and a description 
            of the problem.
          </p>
        </div>

        {/* Contact Card */}
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
            Contact
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '1.5rem',
          }}>
            For general inquiries, questions, or feedback, please use the feedback form. We aim to respond to all 
            submissions within a few business days.
          </p>
          <div style={{
            background: '#f4f7fa',
            borderRadius: 8,
            padding: '1.5rem',
            border: '1px solid #e7ecf0',
          }}>
            <p style={{
              fontSize: '1.05rem',
              color: '#233442',
              lineHeight: 1.7,
              margin: 0,
              fontWeight: 500,
            }}>
              <Link href="/feedback" style={{
                color: '#20678c',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '1.1rem',
              }}>
                Submit Feedback →
              </Link>
            </p>
            <p style={{
              fontSize: '0.95rem',
              color: '#788189',
              lineHeight: 1.7,
              margin: '0.5rem 0 0 0',
            }}>
              Use this form for source suggestions, issue reports, general questions, or any other feedback.
            </p>
          </div>
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

