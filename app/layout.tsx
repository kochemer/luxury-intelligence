import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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

export const metadata: Metadata = {
  title: "Luxury Intelligence",
  description: "Luxury Ecommerce, Retail Technology & AI - Curated intelligence and AI-assisted summaries for luxury, ecommerce, and retail tech.",
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/archive", label: "Archive" },
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
        {/* Sticky Header */}
        <header
          className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-gray-200"
          style={{
            boxShadow: "0 1px 10px 0 rgba(0,0,0,0.03)",
          }}
        >
          <nav className="max-w-3xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2">
              <span
                className="font-bold text-lg sm:text-xl tracking-tight"
                style={{ letterSpacing: "-0.01em" }}
              >
                Luxury Intelligence
              </span>
            </div>
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
          </nav>
        </header>

        {/* Main Layout Container */}
        <main className="flex-grow w-full flex justify-center">
          <div className="w-full max-w-3xl px-4 sm:px-6 py-8">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-6 border-t border-gray-200 py-6 text-xs text-gray-500 bg-white/80 w-full">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>
              <span className="font-medium">AI-assisted summaries</span> &mdash; Not investment or business advice.
            </div>
            <div className="flex gap-4 items-center">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:underline"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
