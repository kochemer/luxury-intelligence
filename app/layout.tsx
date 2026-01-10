import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AmplitudeInit from "./components/AmplitudeInit";
import LanguageSwitcher from "./components/LanguageSwitcher";
import JsonLd from "./components/JsonLd";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://luxury-intelligence.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Luxury Intelligence",
  description: "Luxury Ecommerce, Retail Technology & AI - Curated intelligence and AI-assisted summaries for luxury, ecommerce, and retail tech.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon.png",
  },
  openGraph: {
    siteName: "Luxury Intelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  alternates: {
    canonical: "/",
  },
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/archive", label: "Archive" },
  { href: "/subscribe", label: "Subscribe" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
  { href: "/support", label: "Support" },
  { href: "/feedback", label: "Feedback" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900`}
        style={{ fontFamily: "var(--font-geist-sans)", minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Luxury Intelligence",
            url: siteUrl,
            description: "Luxury Ecommerce, Retail Technology & AI - Curated intelligence and AI-assisted summaries for luxury, ecommerce, and retail tech.",
            inLanguage: "en",
            publisher: {
              "@type": "Organization",
              name: "Luxury Intelligence",
            },
          }}
        />
        <AmplitudeInit />
        {/* Sticky Header */}
        <header
          className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-gray-200"
          style={{
            boxShadow: "0 1px 10px 0 rgba(0,0,0,0.03)",
            position: 'relative',
          }}
        >
          {/* Language Switcher - Absolute top right */}
          <div className="absolute top-0 right-0 z-40 px-4 sm:px-6 py-2">
            <LanguageSwitcher />
          </div>
          {/* Luxury Intelligence - Absolute top left */}
          <div className="absolute top-0 left-0 z-40 px-4 sm:px-6 py-2">
            <span
              className="font-bold text-lg sm:text-xl tracking-tight"
              style={{ letterSpacing: "-0.01em" }}
            >
              Luxury Intelligence
            </span>
          </div>
          <nav className="max-w-3xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2">
              {/* Spacer to balance layout */}
            </div>
            <div className="flex items-center gap-4">
              <ul className="flex gap-3 sm:gap-5 text-sm sm:text-base font-medium">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:underline focus-visible:underline transition-colors px-1 py-0.5 rounded"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </header>

        {/* Main Layout Container */}
        <main className="flex-grow w-full">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-6 border-t border-gray-200 py-6 text-xs text-gray-500 bg-white/80 w-full">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-center gap-3 mb-2" style={{ whiteSpace: 'nowrap' }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:underline whitespace-nowrap"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="text-center">
              <span className="font-medium">AI-assisted summaries</span> &mdash; Not investment or business advice. Website built and maintained by AK.
            </div>
          </div>
        </footer>
        <SpeedInsights />
      </body>
    </html>
  );
}
