'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const isSpanish = pathname?.startsWith('/es');
  const isDanish = pathname?.startsWith('/da');

  // Get English path (remove language prefix if present)
  const getEnglishPath = () => {
    if (!pathname) return '/';
    if (pathname.startsWith('/es') || pathname.startsWith('/da')) {
      const withoutLang = pathname.replace(/^\/(es|da)/, '') || '/';
      return withoutLang;
    }
    return pathname;
  };

  // Get Spanish path (add /es prefix if not present)
  const getSpanishPath = () => {
    if (!pathname) return '/es';
    if (pathname.startsWith('/es')) {
      return pathname;
    }
    if (pathname.startsWith('/da')) {
      return pathname.replace('/da', '/es');
    }
    // Handle all routes
    if (pathname === '/') {
      return '/es';
    }
    // For other pages, add /es prefix
    return `/es${pathname}`;
  };

  // Get Danish path (add /da prefix if not present)
  const getDanishPath = () => {
    if (!pathname) return '/da';
    if (pathname.startsWith('/da')) {
      return pathname;
    }
    if (pathname.startsWith('/es')) {
      return pathname.replace('/es', '/da');
    }
    // Handle all routes
    if (pathname === '/') {
      return '/da';
    }
    // For other pages, add /da prefix
    return `/da${pathname}`;
  };

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <Link
        href={getEnglishPath()}
        className={`px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          !isSpanish && !isDanish
            ? 'text-gray-900 font-semibold bg-gray-100'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
        aria-label="Switch to English"
      >
        Eng
      </Link>
      <span className="text-gray-300">|</span>
      <Link
        href={getSpanishPath()}
        className={`px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          isSpanish
            ? 'text-gray-900 font-semibold bg-gray-100'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
        aria-label="Switch to Spanish"
      >
        Esp
      </Link>
      <span className="text-gray-300">|</span>
      <Link
        href={getDanishPath()}
        className={`px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          isDanish
            ? 'text-gray-900 font-semibold bg-gray-100'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
        aria-label="Switch to Danish"
      >
        Da
      </Link>
    </div>
  );
}

