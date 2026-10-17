'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getMessages, detectLocaleFromPathname } from '@/lib/i18n/messages';
import BrandPattern from './BrandPattern';
import GrainOverlay from './GrainOverlay';
import MastheadLockup from './MastheadLockup';
import { openConsentSettings } from '@/lib/analytics';
import { PROFILES } from '@/lib/socialProfiles';

export default function Footer() {
  const pathname = usePathname() || '/';
  const locale = detectLocaleFromPathname(pathname);
  const t = getMessages(locale);
  const prefix = locale === 'en' ? '' : `/${locale}`;

  const contentLinks = [
    { href: `${prefix}/` || '/', label: t.nav.home },
    { href: `${prefix}/archive`, label: t.nav.archive },
    { href: '/email-digest', label: t.nav.emailDigest },
  ];
  const aboutLinks = [
    { href: `${prefix}/methodology`, label: t.nav.methodology },
    { href: `${prefix}/about`, label: t.nav.about },
    { href: `${prefix}/feedback`, label: t.nav.feedback },
    { href: `${prefix}/support`, label: t.nav.support },
  ];

  return (
    <footer className="relative mt-auto w-full bg-[var(--color-deep)] text-[#E5E2DB] pt-16 pb-10 px-6 md:px-12 border-t-2 border-[var(--color-accent)] overflow-hidden">
      <BrandPattern variant="dark" />
      <GrainOverlay id="grain-footer" className="opacity-[0.05] md:opacity-[0.05] max-md:opacity-[0.03]" />
      <div className="relative max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-[2.5fr_1fr_1fr_1.5fr] gap-10 md:gap-8">
        {/* Col 1: Brand */}
        <div className="col-span-2 md:col-span-1 mb-8 md:mb-0">
          <MastheadLockup variant="footer" />
          <p className="text-meta text-[#999] mt-4">
            Weekly curated intelligence on AI, ecommerce & luxury
          </p>
          <p className="text-[12px] text-[#666] mt-6">© 2026</p>
        </div>

        {/* Col 2: Content */}
        <div className="mb-8 md:mb-0">
          <div className="text-[11px] tracking-widest text-[var(--color-accent)] uppercase mb-3">
            CONTENT
          </div>
          <ul className="space-y-2">
            {contentLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[14px] text-[#999] hover:text-[#FAF9F6] transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Col 3: About */}
        <div className="mb-8 md:mb-0">
          <div className="text-[11px] tracking-widest text-[var(--color-accent)] uppercase mb-3">
            ABOUT
          </div>
          <ul className="space-y-2">
            {aboutLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[14px] text-[#999] hover:text-[#FAF9F6] transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Col 4: CTA */}
        <div className="col-span-2 md:col-span-1 mb-8 md:mb-0">
          <div className="text-[11px] tracking-widest text-[var(--color-accent)] uppercase mb-3">
            {t.footer.stayInformed}
          </div>
          <p className="text-[14px] text-[#999] mb-4">
            {t.footer.stayInformedDesc}
          </p>
          <Link
            href={`${prefix}/subscribe`}
            className="inline-block bg-[var(--color-accent)] text-[var(--color-on-accent)] px-6 py-2.5 rounded-sm text-[14px] font-medium hover:opacity-90 transition-opacity"
          >
            {t.nav.subscribeCta}
          </Link>
        </div>
      </div>

      {/* Bottom disclaimer */}
      <div className="relative max-w-5xl mx-auto mt-12 pt-4 border-t border-white/10 text-[11px] text-[#666] text-center">
        {t.footer.disclaimer}
        <span className="mx-2">·</span>
        <Link href="/about#privacy" className="hover:text-[#999] transition-colors">
          {t.footer.privacy}
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-[#999] transition-colors">
          {t.footer.terms}
        </Link>
        <span className="mx-2">·</span>
        {/* Official YouTube icon, unaltered (brand guidelines): red play button, white triangle. */}
        <a
          href={PROFILES.youtube}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 align-middle hover:text-[#999] transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
            <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
            <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          {t.footer.youtube}
        </a>
        {([['Spotify', PROFILES.spotify], ['LinkedIn', PROFILES.linkedin], ['X', PROFILES.x]] as const).map(([label, href]) => (
          <span key={label}>
            <span className="mx-2">·</span>
            <a href={href} target="_blank" rel="noopener" className="align-middle hover:text-[#999] transition-colors">
              {label}
            </a>
          </span>
        ))}
        <span className="mx-2">·</span>
        <button
          type="button"
          onClick={openConsentSettings}
          className="hover:text-[#999] transition-colors underline-offset-2"
        >
          {t.footer.cookieSettings}
        </button>
      </div>
    </footer>
  );
}
