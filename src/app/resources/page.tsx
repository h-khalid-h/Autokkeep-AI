import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { articles } from './articles';
import styles from './page.module.css';


export const metadata: Metadata = {
  title: 'Resources — Autokkeep',
  description: 'Articles, guides, and insights for small businesses, startups, and accounting professionals on AI-powered financial operations, automated bookkeeping, and financial intelligence.',
};

export default function ResourcesPage() {
  const featured = articles.find((a) => a.featured);
  const rest = articles.filter((a) => !a.featured);

  return (
    <>
      <Navbar />
      <main>
        <section className={`section ${styles.section}`}>
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
              <Link href={`/resources/${featured.slug}`} className={styles.featuredLink}>
                <div className={`card-elevated ${styles.featuredCard}`}>
                  <div className={`badge badge-accent ${styles.featuredBadge}`}>
                    ⭐ Featured
                  </div>
                  <div className={`text-caption ${styles.featuredMeta}`}>
                    {featured.date} · {featured.category} · {featured.readTime}
                  </div>
                  <h2 className={`text-h2 ${styles.featuredTitle}`}>
                    {featured.title}
                  </h2>
                  <p className={`text-body-lg ${styles.featuredExcerpt}`}>
                    {featured.excerpt}
                  </p>
                  <span className={styles.readMore}>
                    Read Article →
                  </span>
                </div>
              </Link>
            )}

            {/* Article Grid */}
            <div className={`grid-3 ${styles.articleGrid}`}>
              {rest.map((article) => (
                <Link
                  key={article.slug}
                  href={`/resources/${article.slug}`}
                  className={styles.articleLink}
                >
                  <article className={`card ${styles.articleCard}`}>
                    <div className={`badge badge-info ${styles.articleBadge}`}>
                      {article.category}
                    </div>
                    <div className={`text-caption ${styles.articleMeta}`}>
                      {article.date} · {article.readTime}
                    </div>
                    <h3 className={`text-h4 ${styles.articleTitle}`}>
                      {article.title}
                    </h3>
                    <p className={`text-body ${styles.articleExcerpt}`}>
                      {article.excerpt}
                    </p>
                    <span className={styles.readMore}>
                      Read Article →
                    </span>
                  </article>
                </Link>
              ))}
            </div>

            {/* Newsletter */}
            <div className={`card-accent ${styles.newsletter}`}>
              <h3 className={`text-h3 ${styles.newsletterTitle}`}>
                Stay in the Loop
              </h3>
              <p className={`text-body ${styles.newsletterBody}`}>
                Get monthly insights on AI financial operations, accounting industry trends, and Autokkeep product updates.
              </p>
              <form
                className={styles.newsletterForm}
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  type="email"
                  placeholder="your@email.com"
                  className={styles.newsletterInput}
                  aria-label="Email address for newsletter"
                />
                <button type="submit" className={styles.newsletterButton}>
                  Subscribe
                </button>
              </form>
              <p className={styles.newsletterDisclaimer}>
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
