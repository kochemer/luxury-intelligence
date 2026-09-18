import type { NextConfig } from "next";
import withPWA from "next-pwa";
import { promises as fs } from 'fs';
import path from 'path';
import { weekLabelToSlug } from './lib/utils/weekSlug';

/**
 * Generate 308 permanent redirects for all known /week/YYYY-Www → /digest/slug.
 * Evaluated at build time. Future weeks (added after deployment) are handled
 * by the server-side permanentRedirect in app/week/[weekLabel]/page.tsx.
 */
async function buildWeekRedirects() {
  try {
    const digestsDir = path.join(process.cwd(), 'data', 'digests');
    const files      = await fs.readdir(digestsDir);
    const weekLabels = files
      .filter(f => /^\d{4}-W\d{1,2}\.json$/.test(f))
      .map(f => f.replace('.json', ''));

    return weekLabels.map(weekLabel => ({
      source:      `/week/${weekLabel}`,
      destination: `/digest/${weekLabelToSlug(weekLabel)}`,
      permanent:   true,
    }));
  } catch {
    return [];
  }
}

const securityHeaders = [
  // Prevent the site being embedded in iframes (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stop browsers guessing content types (MIME sniffing attacks)
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Force HTTPS for 2 years, include subdomains
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Limit referrer info sent to third parties
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unused browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Exclude large local data files from serverless function bundles.
  // data/weeks/ and data/articles.json are only needed at pipeline-build time
  // (runs locally), not at Vercel request time. Without this, api/build-digest
  // pulls in ~250 MB of raw article data and exceeds Vercel's function size limit.
  outputFileTracingExcludes: {
    '/api/build-digest': [
      './data/weeks/**',
      './data/articles.json',
    ],
  },
  // Permanent 308 redirects: /week/YYYY-Www → /digest/month-yyyy-week-n
  redirects: buildWeekRedirects,
  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  // Use webpack explicitly for next-pwa compatibility (next-pwa requires webpack)
  webpack: (config, { isServer }) => {
    return config;
  },
  // Empty turbopack config to silence Next.js 16 warning (we use webpack for next-pwa)
  turbopack: {},
};

// `publicExcludes` is documented in next-pwa's README but missing from its
// bundled typings, hence the assertion.
const pwaConfig = withPWA({
  dest: "public",
  // Registration is owned by app/components/ServiceWorkerRegistration.tsx (it
  // handles stale registrations and bounded retries). Letting next-pwa also
  // inject its own register script meant two owners racing on first load.
  register: false,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Never precache media. next-pwa precaches everything under public/ by
  // default, which put podcast MP3s (~15 MB each) and weekly cover PNGs
  // (~2.5 MB each) into the install step: every first visit downloaded ~75 MB
  // in the background, and one failed fetch failed the whole install. These
  // files are served normally and cached by the runtime rules on demand.
  publicExcludes: [
    "!podcast/**/*",
    "!weekly-images/**/*",
    "!push-sw.js",
    "!icons/README.md",
    "!*.svg",
    "!*.txt",
  ],
  // Web push was retired from the UI on 2026-09-18 (roadmap F2.4); the
  // handlers in public/push-sw.js are no longer imported into the worker.
} as Parameters<typeof withPWA>[0]);

export default pwaConfig(nextConfig);
