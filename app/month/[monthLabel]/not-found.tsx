import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Digest Not Found</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        The requested monthly digest could not be found. The month label may be invalid or the digest has not been built yet.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link
          href="/archive"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: '#0066cc',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
          }}
        >
          View Archive
        </Link>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: '#f0f0f0',
            color: '#333',
            textDecoration: 'none',
            borderRadius: '6px',
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}






