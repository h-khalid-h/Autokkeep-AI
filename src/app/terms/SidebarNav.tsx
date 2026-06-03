'use client';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

interface SidebarNavProps {
  sections: { id: string; title: string }[];
}

export default function SidebarNav({ sections }: SidebarNavProps) {
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className={styles.sidebar}>
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={`${styles.sidebarLink} ${activeSection === section.id ? styles.sidebarLinkActive : ''}`}
        >
          {section.title}
        </a>
      ))}
    </nav>
  );
}
