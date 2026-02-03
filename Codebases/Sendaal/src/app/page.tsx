import { WaitlistForm } from "@/components/WaitlistForm";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl mx-auto space-y-12 text-center">
        {/* Logo/Brand */}
        <div className="space-y-4">
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Sendaal
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-light">
            The Global Settlement Layer
          </p>
        </div>

        {/* Hero Message */}
        <div className="space-y-6 max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold leading-tight">
            The era of waiting for money is over.
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Send a link. Get paid instantly. No bank codes, no borders, no 5-day delays.
            Sendaal is the world&apos;s first universal settlement layer for the global economy.
          </p>
        </div>

        {/* Value Props */}
        <div className="grid md:grid-cols-3 gap-8 pt-8">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg">Settlement in Seconds, Not Days</h3>
            <p className="text-sm text-muted-foreground">
              Stop living in the &quot;pending&quot; lane. High-speed liquidity for a high-speed world.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg">The &quot;Zero-Friction&quot; Pay-Link</h3>
            <p className="text-sm text-muted-foreground">
              Your clients don&apos;t need to download an app. The shortest distance between &quot;Invoice Sent&quot; and &quot;Funds Received.&quot;
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg">Built for the Programmable Future</h3>
            <p className="text-sm text-muted-foreground">
              More than a wallet; it&apos;s infrastructure. Secure, transparent, and truly borderless.
            </p>
          </div>
        </div>


        {/* Waitlist Form */}
        <div className="pt-12 space-y-4">
          <WaitlistForm />
          <div className="flex items-center gap-4">
            <div className="flex-1 border-t border-border/40" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border/40" />
          </div>
          <a href="/create" className="block">
            <button className="w-full px-6 py-3 bg-background border border-border hover:bg-accent text-foreground rounded-lg font-medium transition-colors">
              Create a Payment Link
            </button>
          </a>
        </div>
      </div>
    </main>
  );
}
