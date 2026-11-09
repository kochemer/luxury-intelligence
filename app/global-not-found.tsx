import RootShell from '@/app/components/RootShell';

export const metadata = {
  title: '404: This page could not be found.',
  robots: { index: false },
};

/**
 * Used for URLs that match no route. With several root layouts there is no
 * single layout to wrap Next's default 404, so this renders the same page
 * inside the shared shell (header, footer, theme). Needs
 * experimental.globalNotFound in next.config.ts. Status stays 404.
 */
export default function GlobalNotFound() {
  return (
    <RootShell lang="en">
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <h1 style={{ display: 'inline-block', margin: '0 20px 0 0', paddingRight: 23, fontSize: 24, fontWeight: 500, verticalAlign: 'top', lineHeight: '49px', borderRight: '1px solid rgba(128,128,128,.3)' }}>
          404
        </h1>
        <div style={{ display: 'inline-block' }}>
          <h2 style={{ fontSize: 14, fontWeight: 400, lineHeight: '49px', margin: 0 }}>
            This page could not be found.
          </h2>
        </div>
      </div>
    </RootShell>
  );
}
