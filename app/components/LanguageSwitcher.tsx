'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const isSpanish = pathname?.startsWith('/es');

  // Get English path (remove /es prefix if present)
  const getEnglishPath = () => {
    if (!pathname) return '/';
    if (pathname.startsWith('/es')) {
      const withoutEs = pathname.replace('/es', '') || '/';
      return withoutEs;
    }
    return pathname;
  };

  // Get Spanish path (add /es prefix if not present)
  const getSpanishPath = () => {
    if (!pathname) return '/es';
    if (pathname.startsWith('/es')) {
      return pathname;
    }
    // For now, only home page has Spanish version
    if (pathname === '/') {
      return '/es';
    }
    // For other pages, just go to Spanish home
    return '/es';
  };

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <Link
        href={getEnglishPath()}
        className={`px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          !isSpanish
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
    </div>
  );
}

