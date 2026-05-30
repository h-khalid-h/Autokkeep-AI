import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import Providers from "@/components/Providers";
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autokkeep — Autonomous Bookkeeping for Modern Finance",
  description:
    "The end of the monthly close. Autokkeep automatically categorizes transactions, chases receipts, and syncs your ledger — so your books are always closed and audit-ready.",
  keywords: [
    "AI bookkeeping",
    "autonomous accounting",
    "automated ledger",
    "CPA automation",
    "real-time financials",
    "continuous close",
    "receipt automation",
    "GL categorization",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Autokkeep",
  },
  openGraph: {
    title: "Autokkeep — Autonomous Bookkeeping for Modern Finance",
    description:
      "Eliminate manual bookkeeping forever. AI-powered ledger management with 90%+ AI categorization accuracy.",
    type: "website",
    locale: "en_US",
    siteName: "Autokkeep",
    url: "https://autokkeep.com",
    images: [
      {
        url: "https://autokkeep.com/images/og-image.png",
        width: 1024,
        height: 1024,
        alt: "Autokkeep — Autonomous Bookkeeping Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Autokkeep — Autonomous Bookkeeping for Modern Finance",
    description:
      "The end of the monthly close. AI-native bookkeeping for modern businesses.",
    images: ["https://autokkeep.com/images/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

// JSON-LD Structured Data for SEO
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Autokkeep",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "AI-powered bookkeeping that automatically categorizes transactions, chases receipts, and syncs your ledger. Built for CPA firms and modern businesses.",
  url: "https://autokkeep.com",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "69",
    highPrice: "499",
    priceCurrency: "USD",
    offerCount: "6",
  },
  creator: {
    "@type": "Organization",
    name: "Autokkeep",
    url: "https://autokkeep.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/images/logo.png" />
        <meta name="theme-color" content="#071B4D" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <Providers>
          {/* Skip to main content — accessibility */}
          <a
            href="#main-content"
            className="skip-to-content"
            style={{
              position: 'absolute',
              left: '-9999px',
              top: 'auto',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              zIndex: 9999,
            }}
          >
            Skip to main content
          </a>
          <div id="main-content">{children}</div>
          <CookieConsent />
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}
