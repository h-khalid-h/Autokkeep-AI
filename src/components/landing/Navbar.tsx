'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { Button } from '@/components/ui';
import styles from './Navbar.module.css';

const navLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Demo', href: '/demo/shadow-audit' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleLinkClick = () => {
    setMobileOpen(false);
  };

  return (
    <nav
      className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <Link href="/" className={styles.logo} aria-label="Autokkeep Home">
        <Logo size={28} />
        <span>
          Auto<span className={styles.logoGradient}>kkeep</span>
        </span>
      </Link>

      {/* Desktop nav links */}
      <div className={styles.navLinks}>
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={styles.navLink}
            onClick={handleLinkClick}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Desktop actions */}
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" as={Link} href="/login">
          Log in
        </Button>
        <Button variant="primary" size="sm" as={Link} href="/signup">
          Start Free Trial
        </Button>
      </div>

      {/* Hamburger button */}
      <button
        className={`${styles.hamburger} ${mobileOpen ? styles.hamburgerOpen : ''}`}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle mobile menu"
        aria-expanded={mobileOpen}
      >
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
      </button>

      {/* Mobile overlay */}
      <div
        className={`${styles.mobileOverlay} ${mobileOpen ? styles.open : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile menu panel */}
      <div className={`${styles.mobileMenu} ${mobileOpen ? styles.open : ''}`}>
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={styles.mobileLink}
            onClick={handleLinkClick}
          >
            {link.label}
          </Link>
        ))}
        <div className={styles.mobileActions}>
          <Button variant="ghost" size="md" as={Link} href="/login" onClick={handleLinkClick}>
            Log in
          </Button>
          <Button variant="primary" size="md" as={Link} href="/signup" onClick={handleLinkClick}>
            Start Free Trial
          </Button>
        </div>
      </div>
    </nav>
  );
}
