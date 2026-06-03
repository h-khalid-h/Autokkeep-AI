import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { articles, getArticleBySlug, getRelatedArticles, generateArticleMetadata } from '../articles';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return { title: 'Article Not Found — Autokkeep' };
  return generateArticleMetadata(article);
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const related = getRelatedArticles(slug, 3);

  return (
    <>
      <Navbar />
      <main>
        <article className={styles.article}>
          <div className={styles.articleHeader}>
            <Link href="/resources" className={styles.backLink}>
              ← Back to Resources
            </Link>
            <div className={styles.meta}>
              <span className={`badge badge-info`}>{article.category}</span>
              <span className={styles.metaText}>{article.date} · {article.readTime}</span>
            </div>
            <h1 className={styles.title}>{article.title}</h1>
            <p className={styles.excerpt}>{article.excerpt}</p>
          </div>

          <div className={styles.articleBody}>
            {article.content.map((paragraph, i) => {
              // Parse bold text (**text**)
              const parts = paragraph.split(/(\*\*[^*]+\*\*)/g);
              return (
                <p key={i} className={styles.paragraph}>
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return <strong key={j}>{part.slice(2, -2)}</strong>;
                    }
                    return <span key={j}>{part}</span>;
                  })}
                </p>
              );
            })}
          </div>
        </article>

        {/* Related Articles */}
        {related.length > 0 && (
          <section className={styles.relatedSection}>
            <div className={styles.relatedInner}>
              <h2 className={styles.relatedTitle}>Related Articles</h2>
              <div className={styles.relatedGrid}>
                {related.map((r) => (
                  <Link key={r.slug} href={`/resources/${r.slug}`} className={styles.relatedCard}>
                    <span className={`badge badge-info`}>{r.category}</span>
                    <h3 className={styles.relatedCardTitle}>{r.title}</h3>
                    <p className={styles.relatedCardExcerpt}>{r.excerpt}</p>
                    <span className={styles.relatedCardMeta}>{r.date} · {r.readTime}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
