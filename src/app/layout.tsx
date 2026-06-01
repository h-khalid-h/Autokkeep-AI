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
  title: "Autokkeep — AI Financial Operations for Small Business",
  description:
    "Understand your business finances without understanding accounting. Autokkeep automatically categorizes transactions, monitors financial health, and delivers AI-powered insights.",
  keywords: [
    "AI financial operations",
    "automated bookkeeping",
    "automated ledger",
    "small business finance",
    "real-time financials",
    "continuous close",
    "receipt automation",
    "GL categorization",
    "financial operations",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Autokkeep",
  },
  openGraph: {
    title: "Autokkeep — AI Financial Operations for Small Business",
    description:
      "Understand your finances without understanding accounting. AI-powered financial management with 95%+ categorization accuracy.",
    type: "website",
    locale: "en_US",
    siteName: "Autokkeep",
    url: "https://autokkeep.com",
    images: [
      {
        url: "https://autokkeep.com/images/og-image.png",
        width: 1024,
        height: 1024,
        alt: "Autokkeep — AI Financial Operations Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Autokkeep — AI Financial Operations for Small Business",
    description:
      "Understand your business finances without understanding accounting. AI-powered financial intelligence.",
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
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Autokkeep",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description:
        "AI-powered financial operations that automatically categorizes transactions, monitors financial health, and delivers actionable insights. Built for small businesses.",
      url: "https://autokkeep.com",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "29",
        highPrice: "299",
        priceCurrency: "USD",
        offerCount: "3",
      },
      creator: {
        "@id": "https://autokkeep.com/#organization",
      },
    },
    {
      "@type": "Organization",
      "@id": "https://autokkeep.com/#organization",
      name: "Autokkeep",
      url: "https://autokkeep.com",
      logo: {
        "@type": "ImageObject",
        url: "https://autokkeep.com/images/logo.png",
      },
      description:
        "The AI Financial Operations Platform for Small Businesses. Understand your business finances without understanding accounting.",
      foundingDate: "2024",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@autokkeep.com",
      },
    },
  ],
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
        <a href="#main-content" className="skip-to-content">Skip to main content</a>
        <Providers>
          <main id="main-content">{children}</main>
          <CookieConsent />
          <Analytics />
          <SpeedInsights />
        </Providers>
        <div aria-live="polite" aria-atomic="true" className="sr-only" id="notification-live-region" />
      </body>
    </html>
  );
}
