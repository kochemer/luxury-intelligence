import { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/utils/siteUrl';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  
  // Ensure sitemap URL is absolute and canonical
  const sitemapUrl = siteUrl.startsWith('http')
    ? `${siteUrl}/sitemap.xml`
    : `https://luxury-intel.com/sitemap.xml`;

  // In production, ensure we're using the canonical domain
  if (process.env.NODE_ENV === 'production' && !sitemapUrl.startsWith('https://luxury-intel.com')) {
    console.warn(`[Robots] Warning: sitemap URL is ${sitemapUrl}, expected https://luxury-intel.com/sitemap.xml in production`);
  }

  // Noindex utility paths that should not be crawled at all. These are already
  // marked `robots: { index: false }` at the page level and are excluded from the
  // sitemap, so disallowing them stops crawl-budget waste and keeps them out of
  // Google's "Crawled – currently not indexed" report. Only locale utility pages
  // and /search are listed — English /subscribe & /support stay indexable.
  const disallowedPaths = [
    '/search',
    '/es/subscribe',
    '/da/subscribe',
    '/es/support',
    '/da/support',
    '/es/feedback',
    '/da/feedback',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: disallowedPaths,
      },
      // Explicit Allow for known AI crawler bots — positive GEO signal
      {
        userAgent: [
          'GPTBot',        // OpenAI / ChatGPT Search
          'ChatGPT-User',  // ChatGPT browsing
          'ClaudeBot',     // Anthropic Claude
          'anthropic-ai',  // Anthropic general
          'PerplexityBot', // Perplexity AI
          'Google-Extended', // Google Gemini training + AI Overviews
          'Applebot',      // Apple Intelligence / Siri
          'Amazonbot',     // Amazon Alexa / AWS AI
        ],
        allow: '/',
      },
    ],
    sitemap: sitemapUrl,
  };
}


