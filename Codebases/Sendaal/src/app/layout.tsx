import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sendaal - The Global Settlement Layer",
  description: "Send a link. Get paid instantly. No bank codes, no borders, no 5-day delays.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Simple Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-6 py-4 flex justify-between items-center">
            <Link href="/" className="text-xl font-bold hover:opacity-80 transition-opacity">
              Sendaal
            </Link>
            <div className="flex gap-4">
              <Link
                href="/create"
                className="px-4 py-2 text-sm font-medium hover:bg-accent rounded-lg transition-colors"
              >
                Create Link
              </Link>
              <Link
                href="/"
                className="px-4 py-2 text-sm font-medium text-primary border border-primary hover:bg-primary hover:text-primary-foreground rounded-lg transition-colors"
              >
                Join Waitlist
              </Link>
            </div>
          </div>
        </nav>

        <div className="pt-16">
          {children}
        </div>
      </body>
    </html>
  );
}
