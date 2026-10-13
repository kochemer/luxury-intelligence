import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import type { Metadata } from 'next';
import { formatDate, formatIssueLine } from '@/lib/utils/formatDate';
import { getCurrentDigestWeek } from '@/lib/utils/getCurrentDigestWeek';
import { getSiteUrl } from '@/lib/utils/siteUrl';
import type { EmailDigest, EmailDigestItem } from '@/lib/types';

// Lazy evaluation for dev mode compatibility
const getSiteUrlLazy = () => getSiteUrl();

/**
 * Extract summary bullets from an email digest item.
 * Filters out "implications" bullets and fills with summary sentences if needed.
 * 
 * Rules:
 * - Start from existing bullets
 * - Filter out implication/actionable bullets
 * - If < 3 bullets remain, fill from article summary
 * - Always return up to 3 bullets
 */
function extractSummaryBullets(item: EmailDigestItem): string[] {
  // Implication patterns to filter out (case-insensitive)
  const implicationPatterns = [
    /implication/i,
    /for retailers/i,
    /for brands/i,
    /what this means/i,
    /why it matters/i,
    /takeaway/i,
    /so what/i,
    /bottom line/i,
    /how to respond/i,
    /should consider/i,
    /must adapt/i,
    /should leverage/i,
    /can leverage/i,
    /must reassess/i,
    /strategists should/i,
    /retailers should/i,
    /retailers must/i,
    /retailers can/i,
  ];

  // Normalize and filter existing bullets
  let filteredBullets = item.bullets
    .map(b => {
      // Normalize: trim, strip leading "-", "•", numbering
      let normalized = b.trim();
      normalized = normalized.replace(/^[-•]\s*/, ''); // Remove leading bullet markers
      normalized = normalized.replace(/^\d+[.)]\s*/, ''); // Remove leading numbering
      return normalized;
    })
    .filter(b => {
      // Filter out empty or very short bullets
      if (b.length < 10) return false;
      // Filter out implication bullets
      return !implicationPatterns.some(pattern => pattern.test(b));
    });

  // If we have 3+ good bullets, return first 3
  if (filteredBullets.length >= 3) {
    return filteredBullets.slice(0, 3);
  }

  // If we need more bullets, extract from summary
  if (item.summary && item.summary.trim().length > 0) {
    // Split summary into sentences
    const sentences = item.summary
      .split(/[.!?]+\s+/)
      .map(s => s.trim())
      .filter(s => {
        // Filter out very short sentences
        if (s.length < 20) return false;
        // Filter out implication sentences
        return !implicationPatterns.some(pattern => pattern.test(s));
      });

    // Add sentences that aren't already in bullets
    for (const sentence of sentences) {
      if (filteredBullets.length >= 3) break;
      
      // Check if this sentence is already represented in existing bullets
      const isDuplicate = filteredBullets.some(bullet => {
        const bulletWords = bullet.toLowerCase().split(/\s+/);
        const sentenceWords = sentence.toLowerCase().split(/\s+/);
        // Check if >50% of words overlap (simple duplicate detection)
        const overlap = bulletWords.filter(w => sentenceWords.includes(w)).length;
        return overlap > Math.min(bulletWords.length, sentenceWords.length) * 0.5;
      });

      if (!isDuplicate) {
        filteredBullets.push(sentence);
      }
    }
  }

  // If still < 3 bullets and we have existing bullets, try to split long bullets
  if (filteredBullets.length < 3 && item.bullets.length > 0) {
    // Try to extract additional content from original bullets that were filtered out
    for (const originalBullet of item.bullets) {
      if (filteredBullets.length >= 3) break;
      
      const normalized = originalBullet.trim()
        .replace(/^[-•]\s*/, '')
        .replace(/^\d+[.)]\s*/, '');
      
      // Skip if it's an implication bullet or already included
      if (implicationPatterns.some(pattern => pattern.test(normalized))) continue;
      if (filteredBullets.some(b => {
        const bWords = b.toLowerCase().split(/\s+/);
        const nWords = normalized.toLowerCase().split(/\s+/);
        const overlap = bWords.filter(w => nWords.includes(w)).length;
        return overlap > Math.min(bWords.length, nWords.length) * 0.5;
      })) continue;
      
      // If the bullet is long enough and not already included, add it
      if (normalized.length >= 20) {
        filteredBullets.push(normalized);
      }
    }
  }

  // Final fallback: if we still don't have 3 bullets, use the title as context
  if (filteredBullets.length < 3 && item.title) {
    // Try to create a simple bullet from the title (if it's descriptive enough)
    const titleWords = item.title.split(/\s+/).length;
    if (titleWords >= 5 && titleWords <= 15) {
      // Only use title if it's not already represented in bullets
      const titleLower = item.title.toLowerCase();
      const isTitleDuplicate = filteredBullets.some(bullet => {
        const bulletLower = bullet.toLowerCase();
        return bulletLower.includes(titleLower) || titleLower.includes(bulletLower);
      });
      if (!isTitleDuplicate) {
        filteredBullets.push(item.title);
      }
    }
  }

  // Ensure we always return exactly 3 bullets (pad with generic if needed)
  while (filteredBullets.length < 3) {
    filteredBullets.push('Read the full article for complete details.');
  }

  return filteredBullets.slice(0, 3);
}

const EMAIL_DIGEST_TITLE = 'Email Digest – Weekly Intelligence';
const EMAIL_DIGEST_DESCRIPTION = 'A single ranked list of the week\'s top articles with sharp insights for retail, luxury, and AI intelligence.';

export const metadata: Metadata = {
  title: EMAIL_DIGEST_TITLE,
  description: EMAIL_DIGEST_DESCRIPTION,
  alternates: {
    canonical: `${getSiteUrlLazy()}/email-digest`,
  },
  openGraph: {
    title: `${EMAIL_DIGEST_TITLE} | Luxury Intelligence`,
    description: EMAIL_DIGEST_DESCRIPTION,
    images: [`${getSiteUrlLazy()}/api/og`],
  },
  twitter: {
    title: `${EMAIL_DIGEST_TITLE} | Luxury Intelligence`,
    description: EMAIL_DIGEST_DESCRIPTION,
    images: [`${getSiteUrlLazy()}/api/og`],
  },
};

async function loadEmailDigest(weekLabel: string): Promise<EmailDigest | null> {
  try {
    const digestPath = path.join(process.cwd(), 'data', 'weeks', weekLabel, 'email-digest.json');
    const raw = await fs.readFile(digestPath, 'utf-8');
    return JSON.parse(raw) as EmailDigest;
  } catch (err: any) {
    // File not found is expected if digest hasn't been generated yet
    if (err?.code === 'ENOENT') {
      // Silently return null - this is expected behavior
      return null;
    }
    // Log other errors (permissions, parse errors, etc.)
    console.error(`Failed to load email digest for ${weekLabel}:`, err);
    return null;
  }
}

export default async function EmailDigestPage() {
  // Use shared utility to get current digest week (synchronized with home page)
  const weekLabel = getCurrentDigestWeek();
  const digest = await loadEmailDigest(weekLabel);

  return (
    <main className="w-full font-sans">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Editorial page header */}
        <p className="text-[11px] tracking-[0.3em] uppercase text-[var(--color-accent)] font-sans font-semibold mb-1">
          {formatIssueLine(weekLabel).toUpperCase()}
        </p>
        <h1 className="font-serif text-page-h1 font-bold text-[var(--color-text-primary)] mb-0">
          Email Digest
        </h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-2">
          A single ranked list of the week&apos;s top articles with sharp insights for retail, luxury, and AI intelligence.
        </p>
        <hr className="border-[var(--color-accent)] border-t-2 my-6" />

        {!digest ? (
          <div className="bg-[var(--color-accent-light)] border-l-4 border-[var(--color-accent)] p-5 rounded-sm">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              Email digest not generated yet
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              No email digest found for week {weekLabel}.
            </p>
            <div className="bg-[var(--color-accent-light)] rounded p-3 font-mono text-sm text-[var(--color-text-primary)]">
              npm run email-digest -- --week={weekLabel}
            </div>
          </div>
        ) : (
          <>
            {/* Week sub-header */}
            {digest.generatedAt && (
              <p className="text-meta text-[var(--color-text-secondary)] mb-8">
                Generated {formatDate(digest.generatedAt)}
              </p>
            )}

            {/* Weekly quote (same pull-quote as the web digest) */}
            {digest.weeklyQuote && (
              <p className="mb-8 font-serif text-[1.125rem] text-center text-[var(--color-text-primary)] leading-relaxed italic">
                &ldquo;{digest.weeklyQuote}&rdquo;
              </p>
            )}

            {/* Ranked List — tiered prominence */}
            {(() => {
              const lead      = digest.items.find(i => i.rank === 1);
              const secondary = digest.items.filter(i => i.rank >= 2 && i.rank <= 5);
              const tertiary  = digest.items.filter(i => i.rank >= 6);

              return (
                <div>
                  {/* ── LEAD STORY ── */}
                  {lead && (
                    <article className="border-l-2 border-[var(--color-accent)] pl-6 py-8 mb-10">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-accent)]">
                          Lead Story
                        </span>
                        <span className="text-[10px] text-[var(--color-text-secondary)] font-sans">
                          {lead.source}
                        </span>
                      </div>
                      <h2 className="font-serif text-[1.875rem] leading-tight tracking-[-0.02em] text-[var(--color-text-primary)] mb-4">
                        <a
                          href={lead.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[var(--color-accent)] transition-colors"
                        >
                          {lead.title}
                        </a>
                      </h2>
                      <p className="font-sans text-base leading-relaxed text-[var(--color-text-secondary)] max-w-2xl mb-4">
                        {extractSummaryBullets(lead)[0]}
                      </p>
                      <a
                        href={lead.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-sans text-sm text-[var(--color-accent)] hover:underline"
                      >
                        Read full article →
                      </a>
                    </article>
                  )}

                  {/* ── SECONDARY (ranks 2–4) ── */}
                  {secondary.length > 0 && (
                    <div className="grid md:grid-cols-2 gap-8 mb-10 pt-8 border-t border-[var(--color-border)]">
                      {secondary.map(item => {
                        const bullets = extractSummaryBullets(item).slice(0, 2);
                        return (
                          <article key={item.rank}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-accent)] opacity-60">
                                {String(item.rank).padStart(2, '0')}
                              </span>
                              <span className="text-[10px] text-[var(--color-text-secondary)] font-sans uppercase tracking-wider">
                                {item.source}
                              </span>
                            </div>
                            <h3 className="font-serif text-xl leading-snug tracking-[-0.01em] text-[var(--color-text-primary)] mb-3">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-[var(--color-accent)] transition-colors"
                              >
                                {item.title}
                              </a>
                            </h3>
                            <div className="space-y-1.5">
                              {bullets.map((b, idx) => (
                                <p key={idx} className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                                  <span className="text-[var(--color-accent)] opacity-50 mr-1.5">—</span>{b}
                                </p>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {/* ── TERTIARY (ranks 5+) ── */}
                  {tertiary.length > 0 && (
                    <div className="border-t border-[var(--color-border)] pt-6">
                      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-secondary)] mb-4">
                        Also This Week
                      </p>
                      <div className="space-y-0">
                        {tertiary.map(item => (
                          <a
                            key={item.rank}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-baseline justify-between py-3 border-b border-[var(--color-border)] group hover:bg-[var(--color-accent-light)] px-2 -mx-2 transition-colors rounded-sm"
                          >
                            <span className="font-sans text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors leading-snug pr-4">
                              {item.title}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--color-text-secondary)] shrink-0 uppercase tracking-wider">
                              {item.source}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </main>
  );
}
