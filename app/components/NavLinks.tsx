'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getMessages, detectLocaleFromPathname } from '@/lib/i18n/messages';

/** Primary nav only: Home, Archive, About, Methodology + Subscribe CTA (filled button). */
export default function NavLinks() {
  const pathname = usePathname() || '/';
  const locale = detectLocaleFromPathname(pathname);
  const t = getMessages(locale);
  const prefix = locale === 'en' ? '' : `/${locale}`;

  const primaryLinks: { href: string; label: string; short?: string }[] = [
    { href: `${prefix}/` || '/', label: t.nav.home },
    { href: '/email-digest', label: t.nav.emailDigest },
    { href: `${prefix}/archive`, label: t.nav.archive },
    { href: '/markets/luxury', label: t.nav.luxuryMarket, short: t.nav.luxuryMarketShort },
    { href: '/markets/jewellery', label: t.nav.jewelleryMarket, short: t.nav.jewelleryMarketShort },
    { href: `${prefix}/about`, label: t.nav.about },
  ];

  return (
    <>
      {primaryLinks.map((link) => {
        const isActive = pathname.replace(/\/$/, '') === link.href.replace(/\/$/, '');
        return (
        <li key={link.href} className="whitespace-nowrap">
          <Link
            href={link.href}
            className={`link-underline px-2 py-2 md:px-1.5 md:py-0.5 rounded flex items-center min-h-[44px] md:min-h-0 text-[var(--color-text-primary)] hover:text-[var(--color-text-secondary)] no-underline relative ${isActive ? 'after:absolute after:bottom-[-2px] after:left-0 after:right-0 after:h-[2px] after:bg-[var(--color-accent)]' : ''}`}
            aria-label={link.short ? link.label : undefined}
          >
            {/* Full label from 1280px; shorter between 1024 and 1280 so the row fits. */}
            {link.short ? (
              <>
                <span className="xl:hidden">{link.short}</span>
                <span className="hidden xl:inline">{link.label}</span>
              </>
            ) : link.label}
          </Link>
        </li>
        );
      })}
      <li className="whitespace-nowrap ml-4 md:ml-6 pl-4 md:pl-6 border-l border-[var(--color-accent)] flex items-center">
        <Link
          href={`${prefix}/subscribe`}
          className="inline-flex items-center justify-center bg-[var(--color-accent)] text-white px-5 py-2 rounded-[3px] font-medium transition-colors transition-transform duration-200 hover:opacity-90 hover:scale-105 focus-visible:outline-none min-h-[44px] md:min-h-0"
        >
          {t.nav.subscribeCta}
        </Link>
      </li>
    </>
  );
}

/**
 * Footer: primary (Home, Archive, About, Methodology) + secondary (Email Digest, Support, Feedback).
 */
export function FooterNavLinks() {
  const pathname = usePathname() || '/';
  const locale = detectLocaleFromPathname(pathname);
  const t = getMessages(locale);
  const prefix = locale === 'en' ? '' : `/${locale}`;

  const primary = [
    { href: `${prefix}/` || '/', label: t.nav.home },
    { href: `${prefix}/archive`, label: t.nav.archive },
    { href: `${prefix}/about`, label: t.nav.about },
    { href: `${prefix}/methodology`, label: t.nav.methodology },
  ];
  const secondary = [
    { href: '/email-digest', label: t.nav.emailDigest },
    { href: '/markets/luxury', label: t.nav.luxuryMarket },
    { href: '/markets/jewellery', label: t.nav.jewelleryMarket },
    { href: `${prefix}/support`, label: t.nav.support },
    { href: `${prefix}/feedback`, label: t.nav.feedback },
  ];

  return (
    <>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {primary.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="link-underline hover:underline whitespace-nowrap py-1 min-h-[44px] sm:min-h-0 flex items-center"
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {secondary.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="link-underline hover:underline whitespace-nowrap py-1 min-h-[44px] sm:min-h-0 flex items-center"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </>
  );
}
