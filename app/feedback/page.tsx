import Link from 'next/link';

export default function FeedbackPage() {
  // Safely read environment variable (server-side)
  // Fallback to Formspree endpoint if not configured
  const formAction = process.env.NEXT_PUBLIC_FEEDBACK_FORM_ACTION?.trim() || 'https://formspree.io/f/xwvpbnbz';

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
        {formAction ? (
          /* Feedback Form Card - when configured */
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
            <form method="POST" action={formAction} style={{ marginBottom: '1.5rem' }}>
              {/* Honeypot field - hidden from humans */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                style={{
                  position: 'absolute',
                  left: '-9999px',
                  width: '1px',
                  height: '1px',
                  opacity: 0,
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              />

              <div style={{ marginBottom: '1.75rem' }}>
                <label
                  htmlFor="name"
                  style={{
                    display: 'block',
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: '#233442',
                    marginBottom: '0.5rem',
                  }}
                >
                  Name <span style={{ color: '#8a99ac', fontWeight: 400, fontSize: '0.95rem' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    fontSize: '1rem',
                    border: '1px solid #e7ecf0',
                    borderRadius: 8,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.75rem' }}>
                <label
                  htmlFor="email"
                  style={{
                    display: 'block',
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: '#233442',
                    marginBottom: '0.5rem',
                  }}
                >
                  Email <span style={{ color: '#8a99ac', fontWeight: 400, fontSize: '0.95rem' }}>(optional)</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    fontSize: '1rem',
                    border: '1px solid #e7ecf0',
                    borderRadius: 8,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.75rem' }}>
                <label
                  htmlFor="message"
                  style={{
                    display: 'block',
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: '#233442',
                    marginBottom: '0.5rem',
                  }}
                >
                  Message <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={7}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    fontSize: '1rem',
                    border: '1px solid #e7ecf0',
                    borderRadius: 8,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    lineHeight: 1.6,
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  fontWeight: 600,
                  color: '#fff',
                  background: '#20678c',
                  borderRadius: 8,
                  padding: '0.875rem 2rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  width: '100%',
                  boxShadow: '0 2px 8px 0 rgba(32, 103, 140, 0.2)',
                }}
              >
                Submit Feedback
              </button>

              <p style={{
                fontSize: '0.95rem',
                color: '#788189',
                lineHeight: 1.6,
                marginTop: '1.5rem',
                textAlign: 'center',
              }}>
                Submissions are sent to the site owner.
              </p>
            </form>
          </div>
        ) : (
          /* Not Configured Message - with mailto fallback */
          <div style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 2px 24px 0 rgba(28,68,90,.06)',
            padding: '2.5rem 2rem',
            marginBottom: '2rem',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem',
            }}>
              📧
            </div>
            <h2 style={{
              fontSize: '1.8rem',
              fontWeight: 600,
              color: '#143c42',
              marginBottom: '1rem',
            }}>
              Feedback Form Not Configured
            </h2>
            <p style={{
              fontSize: '1.05rem',
              color: '#5c6880',
              lineHeight: 1.7,
              marginBottom: '2rem',
            }}>
              The feedback form is currently not available. Please contact us directly via email.
            </p>
            <a
              href="mailto:feedback@example.com?subject=Feedback%20for%20Luxury%20Intelligence"
              style={{
                display: 'inline-block',
                fontWeight: 600,
                color: '#fff',
                background: '#20678c',
                borderRadius: 8,
                padding: '0.875rem 2rem',
                textDecoration: 'none',
                fontSize: '1.1rem',
                boxShadow: '0 2px 8px 0 rgba(32, 103, 140, 0.2)',
              }}
            >
              Send Email
            </a>
          </div>
        )}

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
