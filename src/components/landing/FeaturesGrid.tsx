'use client';

import { Card } from '@/components/ui';
import { useLanding } from '@/lib/context/LandingContext';
import { getTaxRules } from '@/lib/tax/rules';
import styles from './FeaturesGrid.module.css';

// ─── Localized Translations Dictionary ──────────────────────────────────────

interface FeatureTexts {
  label: string;
  heading: string;
  subheading: string;
  aiCatTitle: string;
  aiCatDesc: string;
  receiptChaseTitle: string;
  receiptChaseDesc: string;
  monthEndTitle: string;
  monthEndDesc: string;
  finHealthTitle: string;
  finHealthDesc: string;
  taxReadyTitle: string;
  multiEntityTitle: string;
  multiEntityDesc: string;
}

const TRANSLATED_TEXTS: Record<string, FeatureTexts> = {
  en: {
    label: 'Features',
    heading: 'Everything your books need',
    subheading: 'From daily transaction categorization to year-end tax prep, Autokkeep handles it all.',
    aiCatTitle: 'AI Categorization',
    aiCatDesc: 'Machine learning classifies every transaction with 98%+ accuracy, learning your unique patterns over time.',
    receiptChaseTitle: 'Receipt Chase',
    receiptChaseDesc: 'Automatically requests missing receipts from vendors and matches them to transactions.',
    monthEndTitle: 'Month-End Close',
    monthEndDesc: 'Reconcile, review, and close your books automatically at the end of every month.',
    finHealthTitle: 'Financial Health',
    finHealthDesc: 'Real-time dashboards with cash flow monitoring, burn rate tracking, and anomaly detection.',
    taxReadyTitle: 'Tax Readiness',
    multiEntityTitle: 'Multi-Entity',
    multiEntityDesc: 'Manage multiple businesses or subsidiaries from a single dashboard with consolidated views.',
  },
  de: {
    label: 'Funktionen',
    heading: 'Alles, was Ihre Bücher brauchen',
    subheading: 'Von der täglichen Kategorisierung bis zur Steuervorbereitung erledigt Autokkeep alles.',
    aiCatTitle: 'KI-Kategorisierung',
    aiCatDesc: 'Maschinelles Lernen klassifiziert jede Transaktion mit über 98% Genauigkeit und lernt Ihre Muster.',
    receiptChaseTitle: 'Belegaufforderung',
    receiptChaseDesc: 'Fordert fehlende Belege automatisch von Lieferanten an und ordnet sie zu.',
    monthEndTitle: 'Monatsabschluss',
    monthEndDesc: 'Gleichen Sie Ihre Bücher am Ende jedes Monats automatisch ab und schließen Sie sie.',
    finHealthTitle: 'Finanzanalyse',
    finHealthDesc: 'Echtzeit-Dashboards zur Cashflow-Überwachung, Burn-Rate-Tracking und Anomalie-Erkennung.',
    taxReadyTitle: 'Steuerbereitschaft',
    multiEntityTitle: 'Mehrere Einheiten',
    multiEntityDesc: 'Verwalten Sie mehrere Unternehmen oder Filialen über ein einziges Dashboard.',
  },
  fr: {
    label: 'Fonctionnalités',
    heading: 'Tout ce dont vos comptes ont besoin',
    subheading: 'De la catégorisation quotidienne à la préparation fiscale de fin d\'année, Autokkeep gère tout.',
    aiCatTitle: 'Catégorisation IA',
    aiCatDesc: 'L\'apprentissage automatique classe chaque transaction avec plus de 98 % de précision.',
    receiptChaseTitle: 'Suivi des reçus',
    receiptChaseDesc: 'Demande automatiquement les reçus manquants aux fournisseurs et les associe.',
    monthEndTitle: 'Clôture mensuelle',
    monthEndDesc: 'Rapprochez, examinez et clôturez automatiquement vos comptes à la fin de chaque mois.',
    finHealthTitle: 'Santé financière',
    finHealthDesc: 'Tableaux de bord en temps réel avec suivi des flux de trésorerie et détection des anomalies.',
    taxReadyTitle: 'Préparation fiscale',
    multiEntityTitle: 'Multi-entités',
    multiEntityDesc: 'Gérez plusieurs entreprises ou filiales à partir d\'un tableau de bord unique.',
  },
  pt: {
    label: 'Recursos',
    heading: 'Tudo o que seus livros precisam',
    subheading: 'Da categorização diária à preparação fiscal de fim de ano, o Autokkeep cuida de tudo.',
    aiCatTitle: 'Categorização por IA',
    aiCatDesc: 'O aprendizado de máquina classifica cada transação com mais de 98% de precisão.',
    receiptChaseTitle: 'Cobrança de Recibos',
    receiptChaseDesc: 'Solicita recibos em falta aos fornecedores e associa-os às transações.',
    monthEndTitle: 'Fechamento Mensal',
    monthEndDesc: 'Reconcilie, revise e feche seus livros automaticamente no final de cada mês.',
    finHealthTitle: 'Saúde Financeira',
    finHealthDesc: 'Painéis em tempo real com monitoramento de fluxo de caixa e detecção de anomalias.',
    taxReadyTitle: 'Prontidão Fiscal',
    multiEntityTitle: 'Multi-entidade',
    multiEntityDesc: 'Gerencie várias empresas ou subsidiárias a partir de um único painel central.',
  },
  es: {
    label: 'Características',
    heading: 'Todo lo que sus libros necesitan',
    subheading: 'Desde la categorización diaria hasta la preparación de impuestos, Autokkeep lo maneja todo.',
    aiCatTitle: 'Categorización IA',
    aiCatDesc: 'El aprendizaje automático clasifica cada transacción con más de un 98 % de precisión.',
    receiptChaseTitle: 'Búsqueda de recibos',
    receiptChaseDesc: 'Solicita automáticamente los recibos que faltan a los proveedores y los vincula.',
    monthEndTitle: 'Cierre de mes',
    monthEndDesc: 'Concilie, revise y cierre sus libros automáticamente al final de cada mes.',
    finHealthTitle: 'Salud financiera',
    finHealthDesc: 'Paneles en tiempo real con control de flujo de caja y detección de anomalías.',
    taxReadyTitle: 'Preparación de impuestos',
    multiEntityTitle: 'Multi-entidad',
    multiEntityDesc: 'Gestione varias empresas o filiales desde un único panel consolidado.',
  },
  ja: {
    label: '機能',
    heading: '会計に必要なすべてを網羅',
    subheading: '毎日の取引分類から年末의確定申告準備まで、Autokkeepがすべてを処理します。',
    aiCatTitle: 'AI自動仕訳',
    aiCatDesc: '機械学習が98%以上の精度で取引を自動分類し、学習を重ねます。',
    receiptChaseTitle: '領収書自動回収',
    receiptChaseDesc: '不足している領収書をベンダーに自動請求し、取引と照合します。',
    monthEndTitle: '月次締め自動化',
    monthEndDesc: '毎月末の残高照合、確認、帳簿の締めを完全に自動化します。',
    finHealthTitle: '財務コンサルティング',
    finHealthDesc: 'キャッシュフロー、バーンレートの監視、異常検出を行うリアルタイム画面。',
    taxReadyTitle: '税務申告準備',
    multiEntityTitle: '複数拠点管理',
    multiEntityDesc: '複数の法人や子会社を、統合された1つのダッシュボードから管理します。',
  },
  et: {
    label: 'Funktsioonid',
    heading: 'Kõik, mida sinu raamatupidamine vajab',
    subheading: 'Autokkeep juhib kõike alates igapäevasest kategoriseerimisest kuni aasta lõpu maksuvalmistumiseni.',
    aiCatTitle: 'AI kategoriseerimine',
    aiCatDesc: 'Masinõpe klassifitseerib iga tehingu 98%+ täpsusega, õppides sinu mustreid.',
    receiptChaseTitle: 'Kviitungite hankimine',
    receiptChaseDesc: 'Küsib puuduvad kviitungid tarnijatelt automaatselt ja seob tehingutega.',
    monthEndTitle: 'Kuu sulgemine',
    monthEndDesc: 'Korrasta, vaata üle ja sulge oma raamatupidamine automaatselt iga kuu lõpus.',
    finHealthTitle: 'Finantstervis',
    finHealthDesc: 'Reaalajas töölauad rahavoogude jälgimise, kuluprognoosi ja anomaaliate avastamisega.',
    taxReadyTitle: 'Maksuvalmidus',
    multiEntityTitle: 'Mitu ettevõtet',
    multiEntityDesc: 'Halda mitut ettevõtet või tütarettevõtet ühise gekonsoolid töölaua kaudu.',
  },
  ar: {
    label: 'الميزات',
    heading: 'كل ما تحتاجه دفاتر حساباتك',
    subheading: 'من تصنيف المعاملات اليومية إلى إعداد الضرائب في نهاية العام، أوتوكيب يتعامل مع كل شيء.',
    aiCatTitle: 'التصنيف بالذكاء الاصطناعي',
    aiCatDesc: 'يتعلم محركنا أنماطك ويصنف كل معاملة بدقة تفوق ٩٨٪.',
    receiptChaseTitle: 'مطالبة الإيصالات',
    receiptChaseDesc: 'يطلب الإيصالات المفقودة تلقائياً من الموردين ويطابقها بالمعاملات.',
    monthEndTitle: 'إغلاق الشهر',
    monthEndDesc: 'مطابقة ومراجعة وإغلاق دفاترك تلقائياً في نهاية كل شهر.',
    finHealthTitle: 'الصحة المالية',
    finHealthDesc: 'لوحات معلومات فورية مع مراقبة التدفقات النقدية ومعدل الحرق وتوقع المشكلات.',
    taxReadyTitle: 'جاهزية الضرائب',
    multiEntityTitle: 'متعدد الشركات',
    multiEntityDesc: 'إدارة شركات أو فروع متعددة من لوحة معلومات واحدة موحدة.',
  },
};

// Regionalized description dictionaries for Tax Readiness card
const REGIONAL_DESCS: Record<string, Record<string, string>> = {
  en: {
    US: 'Stay audit-ready year-round with GAAP & IRS-compliant categorization, mileage logs, and exportable tax reports.',
    GB: 'Stay audit-ready year-round with HMRC Making Tax Digital (MTD) compliant rules and exportable account books.',
    CA: 'Stay audit-ready year-round with CRA-compliant home office deductions and small business reports.',
    DE: 'Stay audit-ready year-round with GoBD-compliant digital archiving and Finanzamt-ready categorization.',
    EE: 'Stay audit-ready year-round with EMTA-compliant distribution tax tracking and ledger exports.',
    Global: 'Stay audit-ready year-round with local tax-authority rules and IFRS-compliant exportable reports.',
  },
  de: {
    DE: 'Bleiben Sie das ganze Jahr über steuerbereit mit GoBD-konformer Archivierung und Finanzamt-konformer Kategorisierung.',
    Global: 'Bleiben Sie steuerbereit mit IFRS-konformen Kategorisierungen und exportierbaren Berichten.',
  },
  fr: {
    FR: 'Restez prêt pour les audits toute l\'année avec une catégorisation conforme aux règles de la DGFiP et de l\'IFRS.',
    Global: 'Restez prêt pour les audits avec des rapports exportables conformes aux normes locales.',
  },
  pt: {
    BR: 'Fique pronto para auditorias da Receita Federal com classificação fiscal inteligente e exportações simples.',
    Global: 'Fique pronto para fiscalizações com relatórios exportáveis alinhados com as normas IFRS.',
  },
  es: {
    MX: 'Manténgase listo para auditorías del SAT con facturación CFDI válida y categorizaciones deducibles.',
    Global: 'Manténgase al día con informes de exportación listos para la autoridad fiscal local.',
  },
  ja: {
    JP: '2023年10月のインボイス制度に対応。国税庁の監査ガイドラインに準拠した電子帳簿保存を行います。',
    Global: '各国の税務当局およびIFRSガイドラインに適合した、ダウンロード可能な会計帳簿を出力します。',
  },
  et: {
    EE: 'Ole maksuametiks valmis tänu EMTA ja tulumaksuseaduse (TuMS) nõuetele vastavale jaotamata kasumi jälgimisele.',
    Global: 'Ole alati auditiks valmis tänu IFRS ja kohalike maksuametite reeglitele vastavatele aruannetele.',
  },
  ar: {
    AE: 'كن جاهزاً للضرائب على مدار العام مع توافق هيئة الضرائب الاتحادية (FTA) وتقارير جاهزة للاستيراد.',
    SA: 'امتثال تام لمتطلبات هيئة الزكاة والضريبة والجمارك (ZATCA) والفاتورة الإلكترونية لتسهيل الإقرارات.',
    Global: 'كن جاهزاً للتدقيق المالي في أي وقت مع تقارير متوافقة مع متطلبات السلطات الضريبية المحلية.',
  },
};

export default function FeaturesGrid() {
  const { country, language } = useLanding();
  const taxRules = country !== 'Global' ? getTaxRules(country) : null;
  const authority = taxRules?.authority || 'Local';

  const texts = TRANSLATED_TEXTS[language] || TRANSLATED_TEXTS.en;

  const getTaxReadinessDesc = () => {
    const langDescs = REGIONAL_DESCS[language] || REGIONAL_DESCS.en;
    if (country in langDescs) {
      return langDescs[country];
    }
    if ('Global' in langDescs) {
      return langDescs.Global.replace('{authority}', authority);
    }
    return REGIONAL_DESCS.en.Global.replace('{authority}', authority);
  };

  const features = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
          <path d="M8 6a4 4 0 0 0 3.25 3.93" />
          <path d="M12 10v2" />
          <path d="M9 14h6" />
          <rect x="7" y="16" width="10" height="5" rx="1" />
        </svg>
      ),
      title: texts.aiCatTitle,
      description: texts.aiCatDesc,
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M7 15h0M2 9.5h20" />
        </svg>
      ),
      title: texts.receiptChaseTitle,
      description: texts.receiptChaseDesc,
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      ),
      title: texts.monthEndTitle,
      description: texts.monthEndDesc,
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      ),
      title: texts.finHealthTitle,
      description: texts.finHealthDesc,
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 15l2 2 4-4" />
        </svg>
      ),
      title: texts.taxReadyTitle,
      description: getTaxReadinessDesc(),
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <path d="M12 3v18M2 12h20" />
        </svg>
      ),
      title: texts.multiEntityTitle,
      description: texts.multiEntityDesc,
    },
  ];

  return (
    <section className={styles.section} id="features">
      <div className={styles.container}>
        <p className={styles.label}>{texts.label}</p>
        <h2 className={styles.heading}>{texts.heading}</h2>
        <p className={styles.subheading}>{texts.subheading}</p>

        <div className={styles.grid}>
          {features.map((feature) => (
            <Card key={feature.title} variant="default" padding="lg" className={styles.featureCard}>
              <div className={styles.featureIcon}>{feature.icon}</div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDesc}>{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
