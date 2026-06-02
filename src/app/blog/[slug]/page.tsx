import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { blogPosts } from '@/data/blogPosts';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) return {};
  return {
    title: `${post.title} | Autokkeep Blog`,
    description: post.metaDescription,
    openGraph: {
      title: post.title,
      description: post.metaDescription,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  return (
    <div className={styles.page}>
      <article className={styles.article}>
        {/* Back link */}
        <Link href="/blog" className={styles.backLink}>
          ← Back to Blog
        </Link>

        {/* Meta */}
        <div className={styles.meta}>
          <span className={styles.categoryBadge}>{post.category}</span>
          <span className={styles.metaText}>{post.date}</span>
          <span className={styles.metaText}>{post.readTime}</span>
        </div>

        {/* Title */}
        <h1 className={styles.title}>
          {post.title}
        </h1>

        {/* Content rendered as HTML */}
        <div
          className={`blog-content ${styles.content}`}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* CTA at bottom */}
        <div className={styles.ctaBox}>
          <h3 className={styles.ctaTitle}>
            Ready to automate your bookkeeping?
          </h3>
          <p className={styles.ctaBody}>
            Join our free 60-day pilot — no credit card required.
          </p>
          <Link
            href="/#cta"
            className={`btn btn-primary btn-lg ${styles.ctaButton}`}
          >
            Start Free Pilot
          </Link>
        </div>
      </article>
    </div>
  );
}
