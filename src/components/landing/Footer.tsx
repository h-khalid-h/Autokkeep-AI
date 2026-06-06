'use client';

import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { useLanding } from '@/lib/context/LandingContext';
import styles from './Footer.module.css';

interface FooterTexts {
  brandDesc: string;
  product: string;
  company: string;
  legal: string;
  about: string;
  blog: string;
  careers: string;
  contact: string;
  privacy: string;
  terms: string;
  security: string;
  changelog: string;
}

const LOCAL_FOOTER: Record<string, FooterTexts> = {
  en: {
    brandDesc: 'AI-powered bookkeeping that categorizes transactions, chases receipts, and closes your books automatically.',
    product: 'Product',
    company: 'Company',
    legal: 'Legal',
    about: 'About',
    blog: 'Blog',
    careers: 'Careers',
    contact: 'Contact',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    security: 'Security',
    changelog: 'Changelog',
  },
  de: {
    brandDesc: 'KI-gestützte Buchhaltung, die Transaktionen kategorisiert, Belege anfordert und Ihre Bücher automatisch schließt.',
    product: 'Produkt',
    company: 'Unternehmen',
    legal: 'Rechtliches',
    about: 'Über uns',
    blog: 'Blog',
    careers: 'Karriere',
    contact: 'Kontakt',
    privacy: 'Datenschutz',
    terms: 'AGB',
    security: 'Sicherheit',
    changelog: 'Änderungsprotokoll',
  },
  fr: {
    brandDesc: 'Comptabilité optimisée par IA qui catégorise les transactions, relance les reçus et clôture automatiquement vos livres.',
    product: 'Produit',
    company: 'Entreprise',
    legal: 'Mentions légales',
    about: 'À propos',
    blog: 'Blog',
    careers: 'Recrutement',
    contact: 'Contact',
    privacy: 'Confidentialité',
    terms: 'Conditions',
    security: 'Sécurité',
    changelog: 'Notes de mise à jour',
  },
  pt: {
    brandDesc: 'Contabilidade por IA que categoriza transações, solicita recibos e fecha seus livros automaticamente.',
    product: 'Produto',
    company: 'Empresa',
    legal: 'Legal',
    about: 'Sobre',
    blog: 'Blog',
    careers: 'Carreiras',
    contact: 'Contato',
    privacy: 'Privacidade',
    terms: 'Termos',
    security: 'Segurança',
    changelog: 'Notas de versão',
  },
  es: {
    brandDesc: 'Contabilidad inteligente con IA que clasifica gastos, busca recibos y cierra libros automáticamente.',
    product: 'Producto',
    company: 'Compañía',
    legal: 'Legal',
    about: 'Nosotros',
    blog: 'Blog',
    careers: 'Empleo',
    contact: 'Contacto',
    privacy: 'Privacidad',
    terms: 'Condiciones',
    security: 'Seguridad',
    changelog: 'Historial de cambios',
  },
  ja: {
    brandDesc: 'AI仕訳・記帳が取引を自动分類し、領収書の回収から月次締めまでをシームレスに完結させます。',
    product: '製品',
    company: '会社案内',
    legal: '法務関連',
    about: '会社概要',
    blog: 'ブログ',
    careers: '採用情報',
    contact: 'お問い合わせ',
    privacy: 'プライバシーポリシー',
    terms: '利用規約',
    security: 'セキュリティ方針',
    changelog: '更新履歴',
  },
  et: {
    brandDesc: 'AI-toega raamatupidamine, mis kategoriseerib tehinguid, kogub kviitungeid ja sulgeb su raamatud automaatselt.',
    product: 'Toode',
    company: 'Ettevõte',
    legal: 'Õiguslik',
    about: 'Meist',
    blog: 'Blogi',
    careers: 'Karjäär',
    contact: 'Kontakt',
    privacy: 'Privaatsuspoliitika',
    terms: 'Kasutustingimused',
    security: 'Turvalisus',
    changelog: 'Muudatuste logi',
  },
  ar: {
    brandDesc: 'برنامج مسك الدفاتر بالذكاء الاصطناعي لتصنيف المعاملات ومطابقة الإيصالات وإقفال الحسابات تلقائياً.',
    product: 'المنتج',
    company: 'الشركة',
    legal: 'القانونية',
    about: 'عن أوتوكيب',
    blog: 'المدونة',
    careers: 'الوظائف',
    contact: 'اتصل بنا',
    privacy: 'سياسة الخصوصية',
    terms: 'شروط الخدمة',
    security: 'الأمان',
    changelog: 'سجل التغييرات',
  },
};

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { language, t } = useLanding();
  const texts = LOCAL_FOOTER[language] || LOCAL_FOOTER.en;

  const linkGroups = [
    {
      title: texts.product,
      links: [
        { label: t('features'), href: '/#features' },
        { label: t('pricing'), href: '/#pricing' },
        { label: t('demo'), href: '/demo/shadow-audit' },
        { label: texts.changelog, href: '/changelog' },
      ],
    },
    {
      title: texts.company,
      links: [
        { label: texts.about, href: '/about' },
        { label: texts.blog, href: '/blog' },
        { label: texts.careers, href: '/careers' },
        { label: texts.contact, href: '/contact' },
      ],
    },
    {
      title: texts.legal,
      links: [
        { label: texts.privacy, href: '/privacy' },
        { label: texts.terms, href: '/terms' },
        { label: texts.security, href: '/security' },
      ],
    },
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.top}>
          {/* Brand column */}
          <div className={styles.brand}>
            <Link href="/" className={styles.logo} aria-label="Autokkeep Home">
              <Logo size={24} />
              <span>
                Auto<span className={styles.logoGradient}>kkeep</span>
              </span>
            </Link>
            <p className={styles.brandDesc}>
              {texts.brandDesc}
            </p>
          </div>

          {/* Link columns */}
          {linkGroups.map((group) => (
            <div key={group.title} className={styles.linkGroup}>
              <p className={styles.linkGroupTitle}>{group.title}</p>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href} className={styles.link}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className={styles.bottom}>
          <p className={styles.copyright}>
            © {currentYear} Autokkeep. {t('copyright')}
          </p>
          <div className={styles.bottomLinks}>
            <Link href="/privacy" className={styles.bottomLink}>
              {texts.privacy}
            </Link>
            <Link href="/terms" className={styles.bottomLink}>
              {texts.terms}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
