import { Metadata } from 'next';
import Link from 'next/link';
import { blogPosts } from '@/data/blogPosts';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Blog | Autokkeep — AI Financial Operations Insights',
  description: 'Expert insights on AI-powered financial operations, small business automation, and the future of accounting technology.',
};

export default function BlogPage() {
  return (
    <div className={styles.page} data-scroll-reveal>
      <div className={styles.container}>
        <h1 className={styles.title}>
          Autokkeep Blog
        </h1>
        <p className={styles.subtitle}>
          Insights on AI financial operations, small business automation, and the future of accounting.
        </p>

        <div className={styles.postList} data-scroll-reveal>
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className={styles.postCard}
            >
              <div className={styles.postMeta}>
                <span className={styles.categoryBadge}>{post.category}</span>
                <span className={styles.metaText}>{post.date}</span>
                <span className={styles.metaText}>{post.readTime}</span>
              </div>
              <h2 className={styles.postTitle}>
                {post.title}
              </h2>
              <p className={styles.postExcerpt}>
                {post.excerpt}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
