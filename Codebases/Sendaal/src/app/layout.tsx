import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sendaal - The Global Settlement Layer",
  description: "Send a link. Get paid instantly. No bank codes, no borders, no 5-day delays.",
  openGraph: {
    title: "Sendaal - The Global Settlement Layer",
    description: "Moving value at the speed of light. The era of waiting for money is over.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
