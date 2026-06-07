'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

// ─── Translations Registry ──────────────────────────────────────────────────

export type Language = 'en' | 'de' | 'fr' | 'pt' | 'es' | 'ja' | 'et' | 'ar';

export interface Translations {
  features: string;
  pricing: string;
  demo: string;
  login: string;
  startFreeTrial: string;
  watchDemo: string;
  heroHeading: string;
  heroSubheading: string;
  socialProof: string;
  howItWorks: string;
  connectBank: string;
  connectBankDesc: string;
  aiProcess: string;
  aiProcessDesc: string;
  approveAdjust: string;
  approveAdjustDesc: string;
  oneClickClose: string;
  oneClickCloseDesc: string;
  complianceHeading: string;
  complianceSubheading: string;
  ctaHeading: string;
  ctaSubheading: string;
  getStartedFree: string;
  copyright: string;
}

const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    features: 'Features',
    pricing: 'Pricing',
    demo: 'Demo',
    login: 'Log in',
    startFreeTrial: 'Start Free Trial',
    watchDemo: 'Watch Demo',
    heroHeading: 'Automate your bookkeeping, globally.',
    heroSubheading: 'AI-powered transaction categorization, real-time reconciliation, and zero-effort tax readiness.',
    socialProof: 'Trusted by 5,000+ businesses worldwide',
    howItWorks: 'How Autokkeep works',
    connectBank: 'Connect Bank',
    connectBankDesc: 'Secure bank connection via Plaid.',
    aiProcess: 'AI Processes Transactions',
    aiProcessDesc: 'Automatic categorization and receipt matching.',
    approveAdjust: 'Approve or Adjust',
    approveAdjustDesc: 'Review and adjust predictions on the dashboard.',
    oneClickClose: 'One-Click Close & Tax Sync',
    oneClickCloseDesc: 'Get your tax readiness report and sync instantly.',
    complianceHeading: 'Tailored compliance, automated operations',
    complianceSubheading: 'Built from the ground up for modern global companies.',
    ctaHeading: 'Ready to automate your bookkeeping?',
    ctaSubheading: 'Join thousands of businesses saving hours every week.',
    getStartedFree: 'Get Started Free',
    copyright: '© 2026 Autokkeep Inc. All rights reserved.',
  },
  de: {
    features: 'Funktionen',
    pricing: 'Preise',
    demo: 'Demo',
    login: 'Einloggen',
    startFreeTrial: 'Kostenlos testen',
    watchDemo: 'Demo ansehen',
    heroHeading: 'Automatisieren Sie Ihre Buchhaltung, weltweit.',
    heroSubheading: 'KI-gestützte Transaktionskategorisierung, Echtzeit-Abgleich und mühelose Steuervorbereitung.',
    socialProof: 'Vertraut von über 5.000 Unternehmen weltweit',
    howItWorks: 'So funktioniert Autokkeep',
    connectBank: 'Bank verbinden',
    connectBankDesc: 'Sichere Bankverbindung über Plaid.',
    aiProcess: 'KI verarbeitet Transaktionen',
    aiProcessDesc: 'Automatische Kategorisierung und Belegabgleich.',
    approveAdjust: 'Genehmigen oder Anpassen',
    approveAdjustDesc: 'Überprüfen und Anpassen von Vorhersagen im Dashboard.',
    oneClickClose: 'Monatsabschluss mit einem Klick',
    oneClickCloseDesc: 'Holen Sie sich Ihren Steuerbericht und synchronisieren Sie sofort.',
    complianceHeading: 'Maßgeschneiderte Compliance, automatisierte Abläufe',
    complianceSubheading: 'Von Grund auf für moderne globale Unternehmen entwickelt.',
    ctaHeading: 'Bereit, Ihre Buchhaltung zu automatisieren?',
    ctaSubheading: 'Schließen Sie sich Tausenden von Unternehmen an, die jede Woche Stunden sparen.',
    getStartedFree: 'Kostenlos starten',
    copyright: '© 2026 Autokkeep Inc. Alle Rechte vorbehalten.',
  },
  fr: {
    features: 'Fonctionnalités',
    pricing: 'Tarifs',
    demo: 'Démo',
    login: 'Se connecter',
    startFreeTrial: 'Essai gratuit',
    watchDemo: 'Voir la démo',
    heroHeading: 'Automatisez votre comptabilité, à l\'échelle mondiale.',
    heroSubheading: 'Catégorisation des transactions par IA, rapprochement en temps réel et préparation fiscale sans effort.',
    socialProof: 'Recommandé par plus de 5 000 entreprises dans le monde',
    howItWorks: 'Comment fonctionne Autokkeep',
    connectBank: 'Connecter la banque',
    connectBankDesc: 'Connexion bancaire sécurisée via Plaid.',
    aiProcess: 'L\'IA traite les transactions',
    aiProcessDesc: 'Catégorisation automatique et correspondance des reçus.',
    approveAdjust: 'Approuver ou Ajuster',
    approveAdjustDesc: 'Vérifiez et ajustez les prévisions sur le tableau de bord.',
    oneClickClose: 'Clôture en un clic & Sync fiscale',
    oneClickCloseDesc: 'Obtenez votre rapport de préparation fiscale et synchronisez instantanément.',
    complianceHeading: 'Conformité sur mesure, opérations automatisées',
    complianceSubheading: 'Conçu dès le départ pour les entreprises mondiales modernes.',
    ctaHeading: 'Prêt à automatiser votre comptabilité ?',
    ctaSubheading: 'Rejoignez des milliers d\'entreprises qui gagnent des heures chaque semaine.',
    getStartedFree: 'Commencer gratuitement',
    copyright: '© 2026 Autokkeep Inc. Tous droits réservés.',
  },
  pt: {
    features: 'Recursos',
    pricing: 'Preços',
    demo: 'Demonstração',
    login: 'Entrar',
    startFreeTrial: 'Iniciar teste grátis',
    watchDemo: 'Assistir demonstração',
    heroHeading: 'Automatize sua contabilidade, globalmente.',
    heroSubheading: 'Categorização de transações por IA, reconciliação em tempo real e preparação fiscal sem esforço.',
    socialProof: 'Utilizado por mais de 5.000 empresas em todo o mundo',
    howItWorks: 'Como funciona o Autokkeep',
    connectBank: 'Conectar Banco',
    connectBankDesc: 'Conexão bancária segura via Plaid.',
    aiProcess: 'IA Processa Transações',
    aiProcessDesc: 'Categorização automática e correspondência de recibos.',
    approveAdjust: 'Aprovar ou Ajustar',
    approveAdjustDesc: 'Revise e ajuste as previsões diretamente no painel.',
    oneClickClose: 'Fechamento Mensal em Um Clique',
    oneClickCloseDesc: 'Obtenha seu relatório fiscal e sincronize instantaneamente.',
    complianceHeading: 'Conformidade personalizada, operações automatizadas',
    complianceSubheading: 'Desenvolvido do zero para empresas globais modernas.',
    ctaHeading: 'Pronto para automatizar sua contabilidade?',
    ctaSubheading: 'Junte-se a milhares de empresas que economizam horas todas as semanas.',
    getStartedFree: 'Começar gratuitamente',
    copyright: '© 2026 Autokkeep Inc. Todos os direitos reservados.',
  },
  es: {
    features: 'Características',
    pricing: 'Precios',
    demo: 'Demostración',
    login: 'Iniciar sesión',
    startFreeTrial: 'Iniciar prueba gratis',
    watchDemo: 'Ver demostración',
    heroHeading: 'Automatice su contabilidad, globalmente.',
    heroSubheading: 'Categorización de transacciones por IA, conciliación en tiempo real y preparación fiscal sin esfuerzo.',
    socialProof: 'Con la confianza de más de 5,000 empresas en todo el mundo',
    howItWorks: 'Cómo funciona Autokkeep',
    connectBank: 'Conectar banco',
    connectBankDesc: 'Conexión bancaria segura a través de Plaid.',
    aiProcess: 'La IA procesa las transacciones',
    aiProcessDesc: 'Categorización automática y emparejamiento de recibos.',
    approveAdjust: 'Aprobar o ajustar',
    approveAdjustDesc: 'Revise y ajuste las predicciones en el panel de control.',
    oneClickClose: 'Cierre en un clic y sincronización fiscal',
    oneClickCloseDesc: 'Obtenga su informe de preparación fiscal y sincronice al instante.',
    complianceHeading: 'Cumplimiento a medida, operaciones automatizadas',
    complianceSubheading: 'Creado desde cero para las empresas globales modernas.',
    ctaHeading: '¿Listo para automatizar su contabilidad?',
    ctaSubheading: 'Únase a miles de empresas que ahorran horas cada semana.',
    getStartedFree: 'Comenzar gratis',
    copyright: '© 2026 Autokkeep Inc. Todos los derechos reservados.',
  },
  ja: {
    features: '機能',
    pricing: '料金',
    demo: 'デモ',
    login: 'ログイン',
    startFreeTrial: '無料トライアルを開始',
    watchDemo: 'デモを見る',
    heroHeading: '世界中、どこでも帳簿を自動化。',
    heroSubheading: 'AIによる取引の自動仕訳、リアルタイムの残高照合、そして手間いらずの確定申告準備。',
    socialProof: '世界中の5,000以上の企業に信頼されています',
    howItWorks: 'Autokkeepの仕組み',
    connectBank: '銀行口座の連携',
    connectBankDesc: 'Plaidを使用した安全な銀行連携。',
    aiProcess: 'AIによる取引処理',
    aiProcessDesc: '自動仕訳と領収書の自動照合。',
    approveAdjust: '承認または調整',
    approveAdjustDesc: 'ダッシュボードでAI予測を確認および調整。',
    oneClickClose: 'ワンクリック月次締め＆税務同期',
    oneClickCloseDesc: '税務申告準備レポートを瞬時に作成し同期。',
    complianceHeading: '地域特有のコンプライアンス、自動化された運用',
    complianceSubheading: '現代のグローバル企業のためにゼロから構築。',
    ctaHeading: '帳簿の自動化を始めましょう',
    ctaSubheading: '毎週数時間を節約している何千もの企業の一員になりましょう。',
    getStartedFree: '無料で始める',
    copyright: '© 2026 Autokkeep Inc. 無断転載を禁じます。',
  },
  et: {
    features: 'Funktsioonid',
    pricing: 'Hinnad',
    demo: 'Demo',
    login: 'Logi sisse',
    startFreeTrial: 'Alusta tasuta prooviperioodi',
    watchDemo: 'Vaata infot',
    heroHeading: 'Automatiseeri oma raamatupidamine, globaalselt.',
    heroSubheading: 'Tehisintellektiga tehingute kategoriseerimine, reaalajas lepitamine ja vaevata maksuvalmidus.',
    socialProof: 'Usaldatud rohkem kui 5000 ettevõtte poolt üle maailma',
    howItWorks: 'Kuidas Autokkeep töötab',
    connectBank: 'Ühenda pank',
    connectBankDesc: 'Turvaline pangaliides Plaid kaudu.',
    aiProcess: 'AI töötleb tehinguid',
    aiProcessDesc: 'Automaatne kategoriseerimine ja kviitungite sobitamine.',
    approveAdjust: 'Kinnita või korrigeeri',
    approveAdjustDesc: 'Vaata üle ja kohanda prognoose otse töölaualt.',
    oneClickClose: 'Ühe klikiga kuu sulgemine ja maksu-sync',
    oneClickCloseDesc: 'Loo maksuvalmiduse aruanne ja sünkrooni koheselt.',
    complianceHeading: 'Kohandatud vastavus, automatiseeritud toimingud',
    complianceSubheading: 'Loodud maast madalast kaasaegsete rahvusvaheliste ettevõtete jaoks.',
    ctaHeading: 'Kas oled valmis raamatupidamist automatiseerima?',
    ctaSubheading: 'Liitu tuhandete ettevõtetega, kes säästavad igal nädalal tunde.',
    getStartedFree: 'Alusta tasuta',
    copyright: '© 2026 Autokkeep Inc. Kõik õigused kaitstud.',
  },
  ar: {
    features: 'الميزات',
    pricing: 'الأسعار',
    demo: 'عرض توضيحي',
    login: 'تسجيل الدخول',
    startFreeTrial: 'بدء فترة تجريبية مجانية',
    watchDemo: 'مشاهدة العرض',
    heroHeading: 'أتمتة دفاتر الحسابات الخاصة بك، عالمياً.',
    heroSubheading: 'تصنيف المعاملات القائم على الذكاء الاصطناعي، والمطابقة في الوقت الفعلي، وجاهزية الضرائب بدون أي جهد.',
    socialProof: 'موثوق به من قِبل أكثر من 5,000 شركة حول العالم',
    howItWorks: 'كيف يعمل أوتوكيب',
    connectBank: 'ربط البنك',
    connectBankDesc: 'اتصال بنكي آمن عبر Plaid.',
    aiProcess: 'الذكاء الاصطناعي يعالج المعاملات',
    aiProcessDesc: 'تصنيف تلقائي ومطابقة الإيصالات.',
    approveAdjust: 'الموافقة أو التعديل',
    approveAdjustDesc: 'مراجعة وتعديل التوقعات على لوحة التحكم.',
    oneClickClose: 'إغلاق الشهر بنقرة واحدة ومزامنة الضرائب',
    oneClickCloseDesc: 'احصل على تقرير جاهزية الضرائب ومزامنته فوراً.',
    complianceHeading: 'امتثال مخصص، وعمليات مؤتمتة',
    complianceSubheading: 'تم بناؤه من الألف إلى الياء للشركات العالمية الحديثة.',
    ctaHeading: 'جاهز لأتمتة مسك الدفاتر الخاصة بك؟',
    ctaSubheading: 'انضم إلى آلاف الشركات التي توفر ساعات عمل كل أسبوع.',
    getStartedFree: 'البدء مجاناً',
    copyright: '© 2026 Autokkeep Inc. جميع الحقوق محفوظة.',
  },
};

const COUNTRY_LANGUAGES: Record<string, Language> = {
  DE: 'de',
  FR: 'fr',
  BR: 'pt',
  MX: 'es',
  JP: 'ja',
  EE: 'et',
  AE: 'ar',
  SA: 'ar',
  EG: 'ar',
  QA: 'ar',
  CH: 'de',
  NL: 'en',
  IE: 'en',
  SE: 'en',
  FI: 'en',
  PL: 'en',
  LV: 'en',
  LT: 'en',
  US: 'en',
  CA: 'en',
  GB: 'en',
  AU: 'en',
  IN: 'en',
  SG: 'en',
  HK: 'en',
  ZA: 'en',
  NG: 'en',
  Global: 'en',
};

export const COUNTRY_ALLOWED_LANGUAGES: Record<string, Language[]> = {
  Global: ['en'],
  US: ['en'],
  GB: ['en'],
  AU: ['en'],
  IE: ['en'],
  ZA: ['en'],
  SG: ['en'],
  HK: ['en'],
  NL: ['en'],
  SE: ['en'],
  FI: ['en'],
  PL: ['en'],
  LV: ['en'],
  LT: ['en'],
  NG: ['en'],
  KE: ['en'],
  IN: ['en'],
  CA: ['en', 'fr'],
  CH: ['en', 'de', 'fr'],
  DE: ['en', 'de'],
  FR: ['en', 'fr'],
  BR: ['en', 'pt'],
  MX: ['en', 'es'],
  JP: ['en', 'ja'],
  EE: ['en', 'et'],
  AE: ['en', 'ar'],
  SA: ['en', 'ar'],
  QA: ['en', 'ar'],
  EG: ['en', 'ar'],
};


// ─── Context Definition ──────────────────────────────────────────────────────

interface LandingContextValue {
  country: string;
  language: Language;
  dir: 'ltr' | 'rtl';
  setCountry: (country: string) => void;
  setLanguage: (language: Language) => void;
  t: (key: keyof Translations) => string;
}

const LandingContext = createContext<LandingContextValue | undefined>(undefined);

export function LandingProvider({ children }: { children: React.ReactNode }) {
  // Read cached geo from sessionStorage via lazy initializers to avoid
  // setState-during-effect lint violations.
  const getCachedGeo = (): { detectedCountry: string; detectedLanguage: Language } | null => {
    try {
      const cached = sessionStorage.getItem('autokkeep_landing_geo');
      if (cached) return JSON.parse(cached);
    } catch (_e) { /* ignore */ }
    return null;
  };

  const [country, setCountryState] = useState(() => {
    return getCachedGeo()?.detectedCountry ?? 'Global';
  });
  const [language, setLanguageState] = useState<Language>(() => {
    return getCachedGeo()?.detectedLanguage ?? 'en';
  });
  const [dir, setDir] = useState<'ltr' | 'rtl'>(() => {
    const lang = getCachedGeo()?.detectedLanguage;
    return lang === 'ar' ? 'rtl' : 'ltr';
  });

  // Detect country on mount (only if no cached value)
  useEffect(() => {
    // If we already have cached geo data, skip detection
    if (getCachedGeo()) return;

    const detect = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error();
        const data = await res.json();
        const code = (data.country_code || '').toUpperCase();
        
        // Check if supported
        const isSupported = code in COUNTRY_LANGUAGES;
        const finalCountry = isSupported ? code : 'Global';
        const finalLang = COUNTRY_LANGUAGES[finalCountry] || 'en';

        setCountryState(finalCountry);
        setLanguageState(finalLang);
        setDir(finalLang === 'ar' ? 'rtl' : 'ltr');

        sessionStorage.setItem(
          'autokkeep_landing_geo',
          JSON.stringify({ detectedCountry: finalCountry, detectedLanguage: finalLang })
        );
      } catch (_err) {
        // Fallback silently to Global/en
        setCountryState('Global');
        setLanguageState('en');
        setDir('ltr');
      }
    };

    void detect();
  }, []);

  const setCountry = (c: string) => {
    setCountryState(c);
    // Auto-switch language based on country select
    const associatedLang = COUNTRY_LANGUAGES[c] || 'en';
    setLanguageState(associatedLang);
    setDir(associatedLang === 'ar' ? 'rtl' : 'ltr');
    
    sessionStorage.setItem(
      'autokkeep_landing_geo',
      JSON.stringify({ detectedCountry: c, detectedLanguage: associatedLang })
    );
  };

  const setLanguage = (l: Language) => {
    const allowed = COUNTRY_ALLOWED_LANGUAGES[country] || ['en'];
    if (!allowed.includes(l)) return;
    setLanguageState(l);
    setDir(l === 'ar' ? 'rtl' : 'ltr');
    
    sessionStorage.setItem(
      'autokkeep_landing_geo',
      JSON.stringify({ detectedCountry: country, detectedLanguage: l })
    );
  };

  const t = (key: keyof Translations): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || '';
  };

  return (
    <LandingContext.Provider value={{ country, language, dir, setCountry, setLanguage, t }}>
      {children}
    </LandingContext.Provider>
  );
}

export function useLanding() {
  const context = useContext(LandingContext);
  if (!context) {
    throw new Error('useLanding must be used within a LandingProvider');
  }
  return context;
}
