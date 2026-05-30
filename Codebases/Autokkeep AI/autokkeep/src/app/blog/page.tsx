import { Metadata } from 'next';
import Link from 'next/link';
import { blogPosts } from '@/data/blogPosts';

export const metadata: Metadata = {
  title: 'Blog | Autokkeep — AI Bookkeeping Insights for CPA Firms',
  description: 'Expert insights on AI bookkeeping automation, CPA firm efficiency, and the future of accounting technology.',
};

export default function BlogPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '120px 24px 80px',
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '12px',
          letterSpacing: '-0.5px',
        }}>
          Autokkeep Blog
        </h1>
        <p style={{
          fontSize: '1.125rem',
          color: 'rgba(255,255,255,0.5)',
          marginBottom: '48px',
          lineHeight: 1.6,
        }}>
          Insights on AI bookkeeping, CPA firm automation, and the future of accounting.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '16px',
                padding: '32px',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                display: 'block',
              }}
            >
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '12px',
                  color: 'var(--accent-primary)',
                  background: 'var(--accent-subtle)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontWeight: 500,
                }}>{post.category}</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>{post.date}</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>{post.readTime}</span>
              </div>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '8px',
                letterSpacing: '-0.3px',
              }}>
                {post.title}
              </h2>
              <p style={{
                fontSize: '0.9375rem',
                color: 'rgba(255,255,255,0.45)',
                lineHeight: 1.6,
              }}>
                {post.excerpt}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
