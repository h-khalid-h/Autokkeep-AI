import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';


export const metadata: Metadata = {
  title: 'Resources — Autokkeep',
  description: 'Articles, guides, and insights for small businesses, startups, and accounting professionals on AI-powered financial operations, automated bookkeeping, and financial intelligence.',
};

const articles = [
  {
    date: 'May 2026',
    category: 'For Business Owners',
    title: '5 Financial Metrics Every Small Business Should Track Weekly',
    excerpt: 'Understanding revenue growth, cash runway, expense ratios, outstanding receivables, and burn rate isn\'t just for CFOs. These five metrics give SMB owners a real-time pulse on business health — and take minutes to review when automated.',
    readTime: '5 min read',
    featured: false,
  },
  {
    date: 'May 2026',
    category: 'For Startups',
    title: 'How AI is Replacing the $2,000/month Bookkeeper',
    excerpt: 'Startups are switching from manual bookkeeping to AI-powered financial operations — and saving thousands per month. Here\'s why founders who automate early build better financial habits and cleaner books from day one.',
    readTime: '6 min read',
    featured: false,
  },
  {
    date: 'April 2026',
    category: 'For Ecommerce',
    title: 'Multi-Currency Bookkeeping: What Every Global Seller Needs to Know',
    excerpt: 'Managing transactions across USD, EUR, GBP, and beyond without spreadsheet chaos is a real challenge for growing ecommerce businesses. Learn how automated reconciliation keeps your books clean across every currency.',
    readTime: '5 min read',
    featured: false,
  },
  {
    date: 'April 2026',
    category: 'Financial Ops',
    title: 'The Month-End Close Checklist: From 15 Days to 24 Hours',
    excerpt: 'The monthly close is the most dreaded ritual in finance. AI-powered close automation eliminates the scramble by continuously reconciling transactions, flagging anomalies, and preparing reports in real time.',
    readTime: '7 min read',
    featured: false,
  },
  {
    date: 'May 2026',
    category: 'Industry Analysis',
    title: 'Why Botkeeper and Bench Failed — And What It Means for AI Bookkeeping',
    excerpt: 'Both Botkeeper and Bench.co relied on hybrid AI + human models that couldn\'t scale. We analyze why, and how a pure AI-first approach with structured human oversight is the path forward.',
    readTime: '8 min read',
    featured: true,
  },
  {
    date: 'May 2026',
    category: 'Product',
    title: 'The Dual-Engine Architecture: Why We Don\'t Let AI Write Directly to Your Ledger',
    excerpt: 'Our deterministic filter handles 60% of transactions at zero AI cost. The probabilistic engine handles the rest with confidence scoring. Here\'s why this matters for accuracy and economics.',
    readTime: '6 min read',
    featured: false,
  },
  {
    date: 'April 2026',
    category: 'For CPAs',
    title: 'The CPA\'s Iron Man Suit: How AI Transforms Accounting Firms From Service to Scale',
    excerpt: 'One accountant managing 200+ clients instead of 50. Zero receipt chasing. Continuous operational close. This isn\'t science fiction — it\'s what AI-native bookkeeping enables today.',
    readTime: '7 min read',
    featured: false,
  },
  {
    date: 'April 2026',
    category: 'Technical',
    title: 'Confidence Scoring in Financial AI: Why 95% is the Right Threshold',
    excerpt: 'Binary AI decisions are dangerous in finance. Our confidence scoring system routes low-certainty transactions to human review while allowing high-confidence entries to auto-commit.',
    readTime: '5 min read',
    featured: false,
  },
  {
    date: 'March 2026',
    category: 'Market',
    title: 'The Accountant Shortage Crisis: 300,000 CPAs Have Left the Profession',
    excerpt: 'CPA exam candidates have declined 30%+, finance roles take 73 days to fill, and 75% of current CPAs could retire within 15 years. The numbers paint a clear picture.',
    readTime: '4 min read',
    featured: false,
  },
  {
    date: 'March 2026',
    category: 'Security',
    title: 'How We Protect Financial Data: Row-Level Security, Immutable Audit Trails, and Zero-Trust Architecture',
    excerpt: 'Financial data demands the highest security standards. Here\'s how Autokkeep implements bank-grade security with SOC 2 Type II readiness from day one.',
    readTime: '6 min read',
    featured: false,
  },
  {
    date: 'May 2026',
    category: 'CPA Practice',
    title: 'Value-Based Billing for AI-Augmented Accounting: Moving Beyond the Hourly Model',
    excerpt: 'When AI handles 80% of bookkeeping volume, hourly billing becomes unsustainable. Here\'s the framework for transitioning to value-based pricing that both firms and clients prefer.',
    readTime: '6 min read',
    featured: false,
  },
];

export default function ResourcesPage() {
  const featured = articles.find((a) => a.featured);
  const rest = articles.filter((a) => !a.featured);

  return (
    <>
      <Navbar />
      <main>
        <section className="section" style={{ paddingTop: 'calc(var(--header-height) + 80px)' }}>
          <div className="container">
            <div className="section-header">
              <div className="section-label">
                <span>📚</span> Resources
              </div>
              <h1 className="section-title">
                Insights on <span className="text-gradient">AI Financial Operations</span>
              </h1>
              <p className="section-subtitle">
                Guides for small businesses, startups, and accounting professionals on AI financial operations, automated bookkeeping, and the technology behind Autokkeep.
              </p>
            </div>

            {/* Featured Article */}
            {featured && (
              <div className="card-elevated" style={{
                padding: '40px',
                marginBottom: '48px',
                cursor: 'pointer',
              }}>
                <div className="badge badge-accent" style={{ marginBottom: '16px' }}>
                  ⭐ Featured
                </div>
                <div className="text-caption" style={{ marginBottom: '8px' }}>
                  {featured.date} · {featured.category} · {featured.readTime}
                </div>
                <h2 className="text-h2" style={{ marginBottom: '12px' }}>
                  {featured.title}
                </h2>
                <p className="text-body-lg" style={{ marginBottom: '20px', maxWidth: '700px' }}>
                  {featured.excerpt}
                </p>
                <span className="badge badge-accent">
                  Coming Soon
                </span>
              </div>
            )}

            {/* Article Grid */}
            <div className="grid-3" style={{ gap: '24px' }}>
              {rest.map((article) => (
                <article key={article.title} className="card" style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <div className="badge badge-info" style={{ alignSelf: 'flex-start', marginBottom: '16px' }}>
                    {article.category}
                  </div>
                  <div className="text-caption" style={{ marginBottom: '8px' }}>
                    {article.date} · {article.readTime}
                  </div>
                  <h3 className="text-h4" style={{ marginBottom: '12px', flex: 1 }}>
                    {article.title}
                  </h3>
                  <p className="text-body" style={{
                    marginBottom: '16px',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {article.excerpt}
                  </p>
                  <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                    Coming Soon
                  </span>
                </article>
              ))}
            </div>

            {/* Newsletter */}
            <div className="card-accent" style={{
              textAlign: 'center',
              padding: '48px',
              marginTop: '64px',
            }}>
              <h3 className="text-h3" style={{ marginBottom: '8px' }}>
                Stay in the Loop
              </h3>
              <p className="text-body" style={{ marginBottom: '24px' }}>
                Get monthly insights on AI financial operations, accounting industry trends, and Autokkeep product updates.
              </p>
              <p className="text-body" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                Newsletter coming soon.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
