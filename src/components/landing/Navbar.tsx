'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change / anchor click
  const handleLinkClick = () => {
    setMobileOpen(false);
  };

  const navLinks = [
    { label: 'Solution', href: '/#solution' },
    { label: 'How It Works', href: '/#architecture' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'About', href: '/about' },
    { label: 'Security', href: '/security' },
    { label: 'Resources', href: '/resources' },
    { label: 'Blog', href: '/blog' },
    { label: 'Partners', href: '/partners' },
  ];

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} role="navigation" aria-label="Main navigation">
      <Link href="/" className="navbar-logo" aria-label="Autokkeep Home">
        <Logo size={32} />
        <span>Auto<span className="text-gradient">kkeep</span></span>
      </Link>

      <div className={`navbar-links ${mobileOpen ? 'mobile-open' : ''}`}>
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href} className="navbar-link" onClick={handleLinkClick}>
            {link.label}
          </Link>
        ))}

        {/* Show CTA buttons in mobile menu too */}
        <div className="navbar-mobile-actions">
          <Link href="/dashboard" className="btn btn-ghost btn-sm" onClick={handleLinkClick}>
            Live Demo
          </Link>
          <a href="#cta" className="btn btn-primary btn-sm" onClick={handleLinkClick}>
            Request Access
          </a>
        </div>
      </div>

      <div className="navbar-actions">
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          Live Demo
        </Link>
        <a href="#cta" className="btn btn-primary btn-sm">
          Request Access
        </a>
      </div>

      {/* Mobile menu button — visible at ≤1024px */}
      <button
        className={`navbar-hamburger ${mobileOpen ? 'open' : ''}`}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle mobile menu"
        aria-expanded={mobileOpen}
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="navbar-mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </nav>
  );
}
