'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { getMessages, detectLocaleFromPathname } from '@/lib/i18n/messages';
import NavLinks from './NavLinks';
import SearchBar from './SearchBar';
import LanguageSwitcher from './LanguageSwitcher';
import InstallPwaButton from './InstallPwaButton';
import { useTheme } from '@/app/context/ThemeContext';

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <span className="block w-5 h-4 relative">
      <span
        className={`absolute left-0 block w-5 h-0.5 bg-current transition-all duration-200 ${
          open ? 'top-1.5 rotate-45' : 'top-0'
        }`}
      />
      <span
        className={`absolute left-0 top-1.5 block w-5 h-0.5 bg-current transition-all duration-200 ${
          open ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <span
        className={`absolute left-0 block w-5 h-0.5 bg-current transition-all duration-200 ${
          open ? 'top-1.5 -rotate-45' : 'top-3'
        }`}
      />
    </span>
  );
}

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname() || '/';
  const locale = detectLocaleFromPathname(pathname);
  const t = getMessages(locale);
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const { isDark, toggleTheme } = useTheme();

  const primaryLinks = [
    { href: `${prefix}/` || '/', label: t.nav.home },
    { href: `${prefix}/archive`, label: t.nav.archive },
    { href: `${prefix}/competitor-watch`, label: t.nav.competitorWatch },
    { href: `${prefix}/about`, label: t.nav.about },
    { href: `${prefix}/methodology`, label: t.nav.methodology },
  ];
  const secondaryLinks = [
    { href: '/email-digest', label: t.nav.emailDigest },
    { href: `${prefix}/support`, label: t.nav.support },
    { href: `${prefix}/feedback`, label: t.nav.feedback },
  ];

  return (
    <header
      className="sticky top-0 z-30 bg-[var(--color-bg)]/85 backdrop-blur border-b border-[var(--color-accent)]"
      style={{ boxShadow: '0 1px 10px 0 rgba(0,0,0,0.03)' }}
    >
      {/* Desktop: Logo | Search | Nav | PWA | Notifications | Globe | Theme */}
      <div className="hidden md:flex md:items-center md:justify-between md:px-4 md:py-0.5 lg:px-6 md:h-14 gap-4">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
          <Image src="/favicon.png" alt="Luxury Intelligence" width={36} height={36} className="flex-shrink-0" />
          <span className="font-sans font-semibold text-base lg:text-lg tracking-tight">Luxury Intelligence</span>
        </Link>
        <div className="flex-1 min-w-0 max-w-[192px]">
          <SearchBar compact />
        </div>
        <nav className="flex items-center min-w-0 mx-2 lg:mx-4">
          <ul className="flex items-center gap-1 lg:gap-2 text-sm font-medium font-sans flex-wrap">
            <NavLinks />
          </ul>
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <InstallPwaButton />
          <LanguageSwitcher />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors rounded"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>

      {/* Mobile: Search bar on top, then Logo | Burger (utilities in drawer) */}
      <div className="flex flex-col md:hidden">
        <div className="px-4 py-2 border-b border-[var(--color-border)]/50">
          <SearchBar compact />
        </div>
        <div className="flex items-center justify-between px-4 py-2 h-14 min-h-[44px]">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0 min-h-[44px] items-center">
            <Image src="/favicon.png" alt="Luxury Intelligence" width={28} height={28} className="flex-shrink-0" />
            <span className="font-sans font-semibold text-base tracking-tight">Luxury Intelligence</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-light)] active:bg-[var(--color-accent-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] -mr-2"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            <HamburgerIcon open={mobileMenuOpen} />
          </button>
        </div>
      </div>

      {/* Mobile drawer: utilities, primary nav, secondary nav, Subscribe CTA */}
      {mobileMenuOpen && (
        <div
          className="md:hidden border-t border-[var(--color-accent)] bg-[var(--color-surface)] max-h-[85vh] overflow-y-auto"
          role="dialog"
          aria-label="Navigation menu"
        >
          <div className="px-4 py-4 space-y-6">
            {/* Utilities: PWA install, Language, Theme — 44px touch targets */}
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-[var(--color-border)]">
              <div className="min-h-[44px] flex items-center">
                <InstallPwaButton />
              </div>
              <LanguageSwitcher />
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-light)]"
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">Menu</p>
              <ul className="space-y-0">
                {primaryLinks.map((link) => {
                  const isActive = pathname.replace(/\/$/, '') === link.href.replace(/\/$/, '');
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`block py-3.5 min-h-[44px] flex items-center font-medium border-b border-[var(--color-border)] no-underline relative ${isActive ? 'text-[var(--color-accent)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--color-accent)]' : 'text-[var(--color-text-primary)] hover:text-[var(--color-accent)]'}`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
                <li className="pt-3">
                  <Link
                    href={`${prefix}/subscribe`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center bg-[var(--color-accent)] text-white px-5 py-3 min-h-[44px] rounded-[3px] font-medium w-full text-center transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {t.nav.subscribeCta}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">More</p>
              <ul className="space-y-0">
                {secondaryLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="link-underline block py-3.5 min-h-[44px] flex items-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-b border-[var(--color-border)] last:border-b-0"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
