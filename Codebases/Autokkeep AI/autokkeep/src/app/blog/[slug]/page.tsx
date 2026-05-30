import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { blogPosts } from '@/data/blogPosts';

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
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '120px 24px 80px',
    }}>
      <article style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Back link */}
        <Link href="/blog" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--accent-primary)',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 500,
          marginBottom: '32px',
        }}>
          ← Back to Blog
        </Link>

        {/* Meta */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
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

        {/* Title */}
        <h1 style={{
          fontSize: '2.25rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          marginBottom: '24px',
          letterSpacing: '-0.5px',
          lineHeight: 1.2,
        }}>
          {post.title}
        </h1>

        {/* Content rendered as HTML */}
        <div
          className="blog-content"
          dangerouslySetInnerHTML={{ __html: post.content }}
          style={{
            color: 'var(--text-secondary)',
            fontSize: '1.0625rem',
            lineHeight: 1.8,
          }}
        />

        {/* CTA at bottom */}
        <div style={{
          marginTop: '48px',
          padding: '32px',
          background: 'rgba(var(--accent-glow-rgb), 0.08)',
          border: '1px solid var(--border-accent)',
          borderRadius: '16px',
          textAlign: 'center',
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
            Ready to automate your bookkeeping?
          </h3>
          <p style={{ color: 'var(--text-tertiary)', marginBottom: '20px', fontSize: '0.9375rem' }}>
            Join our free 60-day pilot — no credit card required.
          </p>
          <Link
            href="/#cta"
            className="btn btn-primary btn-lg"
            style={{ display: 'inline-block' }}
          >
            Start Free Pilot
          </Link>
        </div>
      </article>
    </div>
  );
}
