import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";

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
    "The end of the monthly close. Autokkeep is an AI-native bookkeeping engine that eliminates manual data entry with dual-engine automation — deterministic precision meets contextual AI intelligence.",
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
  openGraph: {
    title: "Autokkeep — Autonomous Bookkeeping for Modern Finance",
    description:
      "Eliminate manual bookkeeping forever. AI-powered ledger management with 99.9% system accuracy.",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}<CookieConsent /></body>
    </html>
  );
}
