import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Libre_Baskerville, DM_Sans, Courier_Prime, Cormorant_Garamond, IBM_Plex_Mono } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AmplitudeInit from "./components/AmplitudeInit";
import AnalyticsPageView from "./components/AnalyticsPageView";
import ConsentBanner from "./components/ConsentBanner";
import Header from "./components/Header";
import Footer from "./components/Footer";
import DisplayModeAttribute from "./components/DisplayModeAttribute";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";
import JsonLd from "./components/JsonLd";
import { buildRootGraphLd } from "@/lib/seo/jsonLd";
import CanonicalUrlValidator from "./components/CanonicalUrlValidator";
import { ThemeProvider } from "./context/ThemeContext";
import ScrollProgressBar from "./components/ScrollProgressBar";
import "./globals.css";

const libreBaskerville = Libre_Baskerville({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-libre-baskerville",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const courierPrime = Courier_Prime({
  weight: ["400"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-courier-prime",
});

const cormorantGaramond = Cormorant_Garamond({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-cormorant-garamond",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ibm-plex-mono",
});

import { getSiteUrl } from '@/lib/utils/siteUrl';

// Get site URL once at module load
const siteUrl = getSiteUrl();

// Runtime assertion in production: ensure canonical URLs are absolute and use correct domain
if (process.env.NODE_ENV === 'production') {
  const canonical = `${siteUrl}/`;
  if (!canonical.startsWith(siteUrl)) {
    console.error(`[Metadata Error] Canonical URL does not start with siteUrl: ${canonical} (siteUrl: ${siteUrl})`);
  }
  if (!canonical.startsWith('https://')) {
    console.error(`[Metadata Error] Canonical URL is not absolute HTTPS: ${canonical}`);
  }
  if (canonical.includes('vercel.app')) {
    console.error(`[Metadata Error] Canonical URL contains vercel.app domain: ${canonical}`);
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#8B6914",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: '%s | Luxury Intelligence',
    default: 'Weekly AI, Ecommerce & Luxury Industry Digest | Luxury Intelligence',
  },
  description: "Luxury Ecommerce, Retail Technology & AI - Curated intelligence and AI-assisted summaries for luxury, ecommerce, and retail tech.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon.png",
  },
  verification: {
    google: ["nCj2_xV15p2YQcO56omcCNw8q3VVE3L7Fa1uHasUGjg", "KaJ5edrq0bOoztSLgfyfhULos3k6tH3ztcyNIPolOlg"],
  },
  openGraph: {
    siteName: "Luxury Intelligence",
    type: "website",
    images: [{
      url: "/api/og",
      width: 1200,
      height: 630,
      alt: "Luxury Intelligence – Weekly AI, Ecommerce & Luxury Industry Digest",
    }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get('x-pathname') ?? '/';
  const lang = pathname.startsWith('/es') ? 'es' : pathname.startsWith('/da') ? 'da' : 'en';
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* Blocking script: apply saved theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${libreBaskerville.variable} ${dmSans.variable} ${geistMono.variable} ${courierPrime.variable} ${cormorantGaramond.variable} ${ibmPlexMono.variable} font-sans antialiased bg-[var(--color-bg)] text-[var(--color-text-primary)]`}
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        <ThemeProvider>
          {/* Root entity graph: WebSite, Organization and Person declared once,
              with @id, so every other page references them instead of
              re-declaring anonymous copies. See lib/seo/jsonLd.ts. */}
          <JsonLd data={buildRootGraphLd(siteUrl)} />
          <ScrollProgressBar />
          <CanonicalUrlValidator />
          <AmplitudeInit />
          <AnalyticsPageView />
          <DisplayModeAttribute />
          <ServiceWorkerRegistration />
          <Header />

          {/* Main Layout Container */}
          <main className="flex-grow w-full">
            {children}
          </main>

          {/* Footer (locale-aware, dark 3-column) */}
          <Footer />
          <ConsentBanner />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
