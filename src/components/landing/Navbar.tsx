'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { Button } from '@/components/ui';
import { useLanding, Language, COUNTRY_ALLOWED_LANGUAGES } from '@/lib/context/LandingContext';
import styles from './Navbar.module.css';

const supportedCountries = [
  { code: 'Global', flag: '🌐', name: 'Global' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'IE', flag: '🇮🇪', name: 'Ireland' },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: 'FI', flag: '🇫🇮', name: 'Finland' },
  { code: 'EE', flag: '🇪🇪', name: 'Estonia' },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: 'LV', flag: '🇱🇻', name: 'Latvia' },
  { code: 'LT', flag: '🇱🇹', name: 'Lithuania' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: 'QA', flag: '🇶🇦', name: 'Qatar' },
  { code: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: 'HK', flag: '🇭🇰', name: 'Hong Kong' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico' }
];

const supportedLanguages = [
  { code: 'en', label: 'English (EN)' },
  { code: 'de', label: 'Deutsch (DE)' },
  { code: 'fr', label: 'Français (FR)' },
  { code: 'pt', label: 'Português (PT)' },
  { code: 'es', label: 'Español (ES)' },
  { code: 'ja', label: '日本語 (JA)' },
  { code: 'et', label: 'Eesti (ET)' },
  { code: 'ar', label: 'العربية (AR)' }
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { country, language, setCountry, setLanguage, t } = useLanding();
  const allowedCodes = (COUNTRY_ALLOWED_LANGUAGES[country] || ['en']) as string[];
  const visibleLanguages = supportedLanguages.filter((l) => allowedCodes.includes(l.code));

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
        <Link href="/#features" className={styles.navLink} onClick={handleLinkClick}>
          {t('features')}
        </Link>
        <Link href="/#pricing" className={styles.navLink} onClick={handleLinkClick}>
          {t('pricing')}
        </Link>
        <Link href="/demo/shadow-audit" className={styles.navLink} onClick={handleLinkClick}>
          {t('demo')}
        </Link>
      </div>

      {/* Desktop actions */}
      <div className={styles.actions}>
        {/* Country Selector */}
        <div className={styles.selectWrapper}>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={styles.select}
            aria-label="Select country"
          >
            {supportedCountries.map((c) => (
              <option key={c.code} value={c.code} className={styles.option}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Language Selector */}
        <div className={styles.selectWrapper}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className={styles.select}
            aria-label="Select language"
          >
            {visibleLanguages.map((l) => (
              <option key={l.code} value={l.code} className={styles.option}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <Button variant="ghost" size="sm" as={Link} href="/auth/login">
          {t('login')}
        </Button>
        <Button variant="primary" size="sm" as={Link} href="/auth/signup">
          {t('startFreeTrial')}
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
        <Link href="/#features" className={styles.mobileLink} onClick={handleLinkClick}>
          {t('features')}
        </Link>
        <Link href="/#pricing" className={styles.mobileLink} onClick={handleLinkClick}>
          {t('pricing')}
        </Link>
        <Link href="/demo/shadow-audit" className={styles.mobileLink} onClick={handleLinkClick}>
          {t('demo')}
        </Link>

        {/* Mobile Switchers */}
        <div className={styles.mobileSelectors}>
          <div className={styles.mobileSelectRow}>
            <span className={styles.selectLabel}>Country</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={styles.mobileSelect}
              aria-label="Select country"
            >
              {supportedCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.mobileSelectRow}>
            <span className={styles.selectLabel}>Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className={styles.mobileSelect}
              aria-label="Select language"
            >
              {visibleLanguages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.mobileActions}>
          <Button variant="ghost" size="md" as={Link} href="/auth/login" onClick={handleLinkClick}>
            {t('login')}
          </Button>
          <Button variant="primary" size="md" as={Link} href="/auth/signup" onClick={handleLinkClick}>
            {t('startFreeTrial')}
          </Button>
        </div>
      </div>
    </nav>
  );
}
