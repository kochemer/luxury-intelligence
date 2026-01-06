import Link from 'next/link';

export default function ThanksPage() {
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
            Thanks for the feedback
          </h1>
        </div>
      </section>

      {/* Content Section */}
      <section style={{
        maxWidth: 900,
        margin: '3rem auto 4rem auto',
        padding: '0 1.5rem',
        textAlign: 'center',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 24px 0 rgba(28,68,90,.06)',
          padding: '2.5rem 2rem',
          marginBottom: '2rem',
        }}>
          <p style={{
            fontSize: '1.05rem',
            color: '#5c6880',
            lineHeight: 1.7,
            marginBottom: '2rem',
          }}>
            We appreciate you taking the time to share your thoughts with us.
          </p>
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


