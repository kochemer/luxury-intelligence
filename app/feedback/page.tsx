import Link from 'next/link';

export default function FeedbackPage() {
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
            Feedback
          </h1>
          <div style={{
            fontSize: '1.15rem',
            fontWeight: 400,
            color: '#e2ecfa',
            lineHeight: 1.7,
            maxWidth: 600,
            margin: '0 auto'
          }}>
            Share your thoughts, suggestions, or report issues
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section style={{
        maxWidth: 900,
        margin: '3rem auto 4rem auto',
        padding: '0 1.5rem',
      }}>
        {/* Feedback Form Card */}
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
            Submit Feedback
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '2rem',
          }}>
            Use this form to suggest sources, report issues, ask questions, or share any other feedback about the digest.
          </p>

          {/* Form Placeholder - to be implemented in next prompt */}
          <div style={{
            background: '#f9fafb',
            borderRadius: 8,
            border: '1px dashed #d6dfec',
            padding: '3rem 2rem',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: '1.2rem',
              color: '#8a99ac',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}>
              Feedback Form
            </div>
            <div style={{
              fontSize: '1rem',
              color: '#bfcada',
            }}>
              Form implementation coming soon
            </div>
          </div>
        </div>

        {/* What to Include Card */}
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
            What to Include
          </h2>
          <div style={{
            marginBottom: '1.5rem',
          }}>
            <h3 style={{
              fontSize: '1.2rem',
              fontWeight: 600,
              color: '#233442',
              marginBottom: '0.75rem',
            }}>
              For Source Suggestions:
            </h3>
            <ul style={{
              fontSize: '1.05rem',
              color: '#5c6880',
              lineHeight: 1.7,
              margin: 0,
              paddingLeft: '1.5rem',
            }}>
              <li>Publication or website name</li>
              <li>URL</li>
              <li>RSS feed URL (if available)</li>
              <li>Brief description of why it's relevant</li>
            </ul>
          </div>
          <div style={{
            marginBottom: '1.5rem',
          }}>
            <h3 style={{
              fontSize: '1.2rem',
              fontWeight: 600,
              color: '#233442',
              marginBottom: '0.75rem',
            }}>
              For Issue Reports:
            </h3>
            <ul style={{
              fontSize: '1.05rem',
              color: '#5c6880',
              lineHeight: 1.7,
              margin: 0,
              paddingLeft: '1.5rem',
            }}>
              <li>Week label (e.g., 2026-W01)</li>
              <li>Article title or link</li>
              <li>Description of the issue</li>
              <li>Screenshots (if applicable)</li>
            </ul>
          </div>
          <div>
            <h3 style={{
              fontSize: '1.2rem',
              fontWeight: 600,
              color: '#233442',
              marginBottom: '0.75rem',
            }}>
              For General Feedback:
            </h3>
            <p style={{
              fontSize: '1.05rem',
              color: '#5c6880',
              lineHeight: 1.7,
              margin: 0,
            }}>
              Share any thoughts, suggestions, or questions you have about the digest. We value your input and use it 
              to improve the service.
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

