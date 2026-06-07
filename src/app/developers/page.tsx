'use client';

import React from 'react';
import styles from './developers.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface EndpointParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  rateLimit: string;
  params: EndpointParam[];
  curlExample: string;
  responseExample: string;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: string;
  items: { id: string; label: string }[];
}

// ─── Sidebar Navigation Data ────────────────────────────────────────────────────

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: 'authentication',
    label: 'Authentication',
    icon: '🔐',
    items: [{ id: 'authentication', label: 'API Keys' }],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: '💳',
    items: [{ id: 'get-transactions', label: 'List Transactions' }],
  },
  {
    id: 'entities',
    label: 'Entities',
    icon: '🏢',
    items: [{ id: 'get-entities', label: 'List Entities' }],
  },
  {
    id: 'categories',
    label: 'Categories',
    icon: '📂',
    items: [{ id: 'get-categories', label: 'List Categories' }],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: '📊',
    items: [
      { id: 'get-profit-loss', label: 'Profit & Loss' },
      { id: 'get-balance-sheet', label: 'Balance Sheet' },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: '🔔',
    items: [
      { id: 'get-webhooks', label: 'List Webhooks' },
      { id: 'post-webhooks', label: 'Create Webhook' },
    ],
  },
  {
    id: 'rate-limits',
    label: 'Rate Limits',
    icon: '⚡',
    items: [{ id: 'rate-limits', label: 'Overview' }],
  },
];

// ─── Endpoints Data ─────────────────────────────────────────────────────────────

const ENDPOINTS: Endpoint[] = [
  {
    id: 'get-transactions',
    method: 'GET',
    path: '/api/v1/transactions',
    description:
      'Retrieve a paginated list of transactions for your organization. Filter by entity, status, or date range.',
    rateLimit: '60 req/min',
    params: [
      { name: 'entityId', type: 'string', required: false, description: 'Filter transactions by entity ID' },
      { name: 'status', type: 'string', required: false, description: 'Filter by status (e.g. pending, approved, synced)' },
      { name: 'startDate', type: 'string', required: false, description: 'ISO 8601 date — filter transactions on or after this date' },
      { name: 'endDate', type: 'string', required: false, description: 'ISO 8601 date — filter transactions on or before this date' },
      { name: 'limit', type: 'number', required: false, description: 'Number of results per page (default 50, max 100)' },
      { name: 'offset', type: 'number', required: false, description: 'Number of results to skip for pagination' },
    ],
    curlExample: `curl -X GET "https://app.autokkeep.com/api/v1/transactions?entityId=ent_abc123&limit=10" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    responseExample: `{
  "data": [
    {
      "id": "txn_9f8e7d6c",
      "entity_id": "ent_abc123",
      "merchant_name": "AWS",
      "amount": -429.99,
      "date": "2025-06-01",
      "status": "approved",
      "category_ai": "6100",
      "confidence": 0.94,
      "created_at": "2025-06-01T08:30:00Z",
      "updated_at": "2025-06-02T14:00:00Z"
    }
  ],
  "total": 142,
  "limit": 10,
  "offset": 0
}`,
  },
  {
    id: 'get-entities',
    method: 'GET',
    path: '/api/v1/entities',
    description:
      'List all entities (companies/subsidiaries) associated with your organization.',
    rateLimit: '60 req/min',
    params: [],
    curlExample: `curl -X GET "https://app.autokkeep.com/api/v1/entities" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    responseExample: `{
  "data": [
    {
      "id": "ent_abc123",
      "name": "Acme Corp",
      "base_currency": "USD",
      "country": "US",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "total": 1
}`,
  },
  {
    id: 'get-categories',
    method: 'GET',
    path: '/api/v1/categories',
    description:
      'List chart of accounts (categories) for your organization. Optionally filter by entity.',
    rateLimit: '60 req/min',
    params: [
      { name: 'entityId', type: 'string', required: false, description: 'Filter categories by entity ID' },
    ],
    curlExample: `curl -X GET "https://app.autokkeep.com/api/v1/categories?entityId=ent_abc123" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    responseExample: `{
  "data": [
    {
      "id": "coa_001",
      "entity_id": "ent_abc123",
      "code": "4000",
      "name": "Sales Revenue",
      "type": "revenue",
      "is_active": true
    },
    {
      "id": "coa_002",
      "entity_id": "ent_abc123",
      "code": "6100",
      "name": "Cloud Infrastructure",
      "type": "expense",
      "is_active": true
    }
  ],
  "total": 2
}`,
  },
  {
    id: 'get-profit-loss',
    method: 'GET',
    path: '/api/v1/reports/profit-loss',
    description:
      'Generate a Profit & Loss (Income Statement) report for a given entity and date range. Uses approved and synced transactions only.',
    rateLimit: '10 req/min',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'The entity to generate the report for' },
      { name: 'periodStart', type: 'string', required: true, description: 'ISO 8601 date — start of the reporting period' },
      { name: 'periodEnd', type: 'string', required: true, description: 'ISO 8601 date — end of the reporting period' },
    ],
    curlExample: `curl -X GET "https://app.autokkeep.com/api/v1/reports/profit-loss?entityId=ent_abc123&periodStart=2025-01-01&periodEnd=2025-06-30" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    responseExample: `{
  "data": {
    "entityName": "Acme Corp",
    "entityCurrency": "USD",
    "periodStart": "2025-01-01",
    "periodEnd": "2025-06-30",
    "generatedAt": "2025-07-01T12:00:00Z",
    "revenue": [
      { "code": "4000", "name": "Sales Revenue", "amount": 150000, "type": "revenue" }
    ],
    "totalRevenue": 150000,
    "expenses": [
      { "code": "6100", "name": "Cloud Infra", "amount": 25000, "type": "expense" }
    ],
    "totalExpenses": 25000,
    "netIncome": 125000
  }
}`,
  },
  {
    id: 'get-balance-sheet',
    method: 'GET',
    path: '/api/v1/reports/balance-sheet',
    description:
      'Generate a Balance Sheet report as of a specific date. Shows assets, liabilities, equity, and retained earnings.',
    rateLimit: '10 req/min',
    params: [
      { name: 'entityId', type: 'string', required: true, description: 'The entity to generate the report for' },
      { name: 'asOfDate', type: 'string', required: true, description: 'ISO 8601 date — the "as of" date for the balance sheet' },
    ],
    curlExample: `curl -X GET "https://app.autokkeep.com/api/v1/reports/balance-sheet?entityId=ent_abc123&asOfDate=2025-06-30" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    responseExample: `{
  "data": {
    "entityName": "Acme Corp",
    "entityCurrency": "USD",
    "asOfDate": "2025-06-30",
    "generatedAt": "2025-07-01T12:00:00Z",
    "assets": [
      { "code": "1000", "name": "Cash", "amount": 200000, "type": "asset" }
    ],
    "totalAssets": 200000,
    "liabilities": [],
    "totalLiabilities": 0,
    "equity": [],
    "totalEquity": 0,
    "isBalanced": true,
    "retainedEarnings": 200000
  }
}`,
  },
  {
    id: 'get-webhooks',
    method: 'GET',
    path: '/api/v1/webhooks',
    description:
      'List all webhook subscriptions for your organization.',
    rateLimit: '30 req/min',
    params: [],
    curlExample: `curl -X GET "https://app.autokkeep.com/api/v1/webhooks" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    responseExample: `{
  "data": [
    {
      "id": "wh_sub_001",
      "url": "https://your-app.com/webhooks/autokkeep",
      "events": ["transaction.created", "transaction.approved"],
      "is_active": true,
      "created_at": "2025-06-01T10:00:00Z"
    }
  ],
  "total": 1
}`,
  },
  {
    id: 'post-webhooks',
    method: 'POST',
    path: '/api/v1/webhooks',
    description:
      'Create a new webhook subscription. You\'ll receive HTTP POST requests to your URL when specified events occur.',
    rateLimit: '30 req/min',
    params: [
      { name: 'url', type: 'string', required: true, description: 'HTTPS endpoint URL to receive webhook events' },
      { name: 'events', type: 'string[]', required: true, description: 'Array of event types to subscribe to' },
      { name: 'secret', type: 'string', required: true, description: 'Signing secret for verifying payloads (min 16 characters)' },
    ],
    curlExample: `curl -X POST "https://app.autokkeep.com/api/v1/webhooks" \\
  -H "X-API-Key: ak_live_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-app.com/webhooks/autokkeep",
    "events": ["transaction.created", "transaction.approved"],
    "secret": "whsec_your_signing_secret_here"
  }'`,
    responseExample: `{
  "data": {
    "id": "wh_sub_002",
    "url": "https://your-app.com/webhooks/autokkeep",
    "events": ["transaction.created", "transaction.approved"],
    "is_active": true,
    "created_at": "2025-07-01T12:00:00Z"
  },
  "message": "Webhook subscription created"
}`,
  },
];

// ─── Rate Limit Data ────────────────────────────────────────────────────────────

const RATE_LIMITS = [
  { endpoint: 'GET /api/v1/transactions', limit: '60 req/min', window: '60 seconds' },
  { endpoint: 'GET /api/v1/entities', limit: '60 req/min', window: '60 seconds' },
  { endpoint: 'GET /api/v1/categories', limit: '60 req/min', window: '60 seconds' },
  { endpoint: 'GET /api/v1/reports/profit-loss', limit: '10 req/min', window: '60 seconds' },
  { endpoint: 'GET /api/v1/reports/balance-sheet', limit: '10 req/min', window: '60 seconds' },
  { endpoint: 'GET /api/v1/webhooks', limit: '30 req/min', window: '60 seconds' },
  { endpoint: 'POST /api/v1/webhooks', limit: '30 req/min', window: '60 seconds' },
];

// ─── Helper Components ──────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const className =
    method === 'GET' ? styles.methodGet
    : method === 'POST' ? styles.methodPost
    : method === 'PUT' ? styles.methodPut
    : styles.methodDelete;

  return <span className={className}>{method}</span>;
}

function CodeBlock({
  label,
  code,
  id,
  copiedStates,
  onCopy,
}: {
  label: string;
  code: string;
  id: string;
  copiedStates: Record<string, boolean>;
  onCopy: (id: string, text: string) => void;
}) {
  const isCopied = copiedStates[id] || false;

  return (
    <div className={styles.codeBlockWrapper}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeBlockLabel}>{label}</span>
        <button
          className={isCopied ? styles.copyBtnCopied : styles.copyBtn}
          onClick={() => onCopy(id, code)}
          aria-label={`Copy ${label}`}
        >
          {isCopied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <pre className={styles.codeBlock}>{code}</pre>
    </div>
  );
}

function EndpointCard({
  endpoint,
  copiedStates,
  onCopy,
}: {
  endpoint: Endpoint;
  copiedStates: Record<string, boolean>;
  onCopy: (id: string, text: string) => void;
}) {
  return (
    <div id={endpoint.id} className={styles.endpointCard}>
      <div className={styles.endpointHeader}>
        <MethodBadge method={endpoint.method} />
        <span className={styles.endpointPath}>{endpoint.path}</span>
        <span className={styles.endpointRateLimit}>⚡ {endpoint.rateLimit}</span>
      </div>

      <p className={styles.endpointDescription}>{endpoint.description}</p>

      {endpoint.params.length > 0 && (
        <div className={styles.paramsSection}>
          <h4 className={styles.paramsSectionTitle}>
            {endpoint.method === 'POST' ? 'Body Parameters' : 'Query Parameters'}
          </h4>
          <table className={styles.paramsTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {endpoint.params.map((param) => (
                <tr key={param.name}>
                  <td>
                    <span className={styles.paramName}>{param.name}</span>
                  </td>
                  <td>
                    <span className={styles.paramType}>{param.type}</span>
                  </td>
                  <td>
                    <span className={param.required ? styles.paramRequired : styles.paramOptional}>
                      {param.required ? 'Required' : 'Optional'}
                    </span>
                  </td>
                  <td>{param.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CodeBlock
        label="Request"
        code={endpoint.curlExample}
        id={`${endpoint.id}-curl`}
        copiedStates={copiedStates}
        onCopy={onCopy}
      />

      <CodeBlock
        label="Response"
        code={endpoint.responseExample}
        id={`${endpoint.id}-response`}
        copiedStates={copiedStates}
        onCopy={onCopy}
      />
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────────────────────────

export default function DevelopersPage() {
  const [activeSection, setActiveSection] = React.useState('authentication');
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(
    new Set(SIDEBAR_GROUPS.map((g) => g.id))
  );
  const [copiedStates, setCopiedStates] = React.useState<Record<string, boolean>>({});
  const [showBackToTop, setShowBackToTop] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [codeTab, setCodeTab] = React.useState<'curl' | 'javascript'>('curl');

  // ── Intersection Observer for active section tracking ────────────────────
  React.useEffect(() => {
    const sectionIds = [
      'authentication',
      ...ENDPOINTS.map((e) => e.id),
      'rate-limits',
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  // ── Scroll listener for back-to-top button ──────────────────────────────
  React.useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Copy to clipboard ───────────────────────────────────────────────────
  const handleCopy = React.useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedStates((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [id]: false }));
      }, 2000);
    });
  }, []);

  // ── Toggle sidebar group ────────────────────────────────────────────────
  const toggleGroup = React.useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // ── Scroll to section ───────────────────────────────────────────────────
  const scrollToSection = React.useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(sectionId);
      setMobileMenuOpen(false);
    }
  }, []);

  // ── JavaScript examples ─────────────────────────────────────────────────
  const jsExamples = {
    transactions: `const response = await fetch(
  "https://app.autokkeep.com/api/v1/transactions?limit=10",
  {
    headers: {
      "X-API-Key": process.env.AUTOKKEEP_API_KEY,
    },
  }
);

const { data, total } = await response.json();
console.log(\`Found \${total} transactions\`);`,

    profitLoss: `const response = await fetch(
  "https://app.autokkeep.com/api/v1/reports/profit-loss?" +
    new URLSearchParams({
      entityId: "ent_abc123",
      periodStart: "2025-01-01",
      periodEnd: "2025-06-30",
    }),
  {
    headers: {
      "X-API-Key": process.env.AUTOKKEEP_API_KEY,
    },
  }
);

const { data: report } = await response.json();
console.log(\`Net Income: \${report.netIncome}\`);`,

    webhook: `const response = await fetch(
  "https://app.autokkeep.com/api/v1/webhooks",
  {
    method: "POST",
    headers: {
      "X-API-Key": process.env.AUTOKKEEP_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://your-app.com/webhooks",
      events: ["transaction.created"],
      secret: "whsec_your_signing_secret_here",
    }),
  }
);

const { data, message } = await response.json();
console.log(message); // "Webhook subscription created"`,
  };

  const curlExamples = {
    transactions: `curl -X GET "https://app.autokkeep.com/api/v1/transactions?limit=10" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    profitLoss: `curl -X GET "https://app.autokkeep.com/api/v1/reports/profit-loss\\
  ?entityId=ent_abc123\\
  &periodStart=2025-01-01\\
  &periodEnd=2025-06-30" \\
  -H "X-API-Key: ak_live_your_api_key_here"`,
    webhook: `curl -X POST "https://app.autokkeep.com/api/v1/webhooks" \\
  -H "X-API-Key: ak_live_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-app.com/webhooks",
    "events": ["transaction.created"],
    "secret": "whsec_your_signing_secret_here"
  }'`,
  };

  return (
    <>
      <h1 className="sr-only">Autokkeep API Documentation</h1>

      {/* Mobile menu button */}
      <button
        className={styles.mobileMenuBtn}
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>

      {/* Mobile overlay */}
      <div
        className={mobileMenuOpen ? styles.mobileOverlayVisible : styles.mobileOverlay}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <div className={styles.page}>
        {/* ── Sidebar ── */}
        <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarBrand}>
              <span className={styles.sidebarLogo}>{'{ }'}</span>
              <span className={styles.sidebarBrandName}>
                Autokkeep API
                <span className={styles.sidebarVersion}>v1</span>
              </span>
            </div>
          </div>

          <nav className={styles.sidebarNav} aria-label="API documentation navigation">
            {SIDEBAR_GROUPS.map((group) => (
              <div key={group.id} className={styles.sidebarGroup}>
                <button
                  className={styles.sidebarGroupButton}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expandedGroups.has(group.id)}
                >
                  <span>
                    {group.icon} {group.label}
                  </span>
                  <span
                    className={
                      expandedGroups.has(group.id)
                        ? styles.sidebarGroupChevronOpen
                        : styles.sidebarGroupChevron
                    }
                  >
                    ▶
                  </span>
                </button>

                <div
                  className={
                    expandedGroups.has(group.id)
                      ? styles.sidebarGroupItemsOpen
                      : styles.sidebarGroupItems
                  }
                >
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={
                        activeSection === item.id
                          ? styles.sidebarLinkActive
                          : styles.sidebarLink
                      }
                      onClick={() => scrollToSection(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main Content ── */}
        <main className={styles.content}>
          {/* Hero */}
          <div className={styles.hero}>
            <h2 className={styles.heroTitle}>Autokkeep API Reference</h2>
            <p className={styles.heroDescription}>
              Integrate AI-powered bookkeeping into your workflow. Retrieve transactions,
              generate financial reports, and manage webhooks — all through a simple REST API.
            </p>
            <div className={styles.heroMeta}>
              <span className={styles.heroMetaItem}>
                <span className={styles.heroMetaIcon}>🌐</span>
                Base URL: <code className={styles.inlineCode}>https://app.autokkeep.com</code>
              </span>
              <span className={styles.heroMetaItem}>
                <span className={styles.heroMetaIcon}>📦</span>
                Version: v1
              </span>
              <span className={styles.heroMetaItem}>
                <span className={styles.heroMetaIcon}>🔒</span>
                HTTPS Only
              </span>
            </div>
          </div>

          {/* ── Authentication Section ── */}
          <section id="authentication" className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Authentication</h2>
            <p className={styles.sectionDescription}>
              All API requests must include an{' '}
              <code className={styles.inlineCode}>X-API-Key</code> header. API keys are
              scoped to your organization and can be created from the Settings page.
            </p>

            <div className={styles.authSteps}>
              <div className={styles.authStep}>
                <div className={styles.authStepNumber}>1</div>
                <div className={styles.authStepContent}>
                  <div className={styles.authStepTitle}>Generate an API Key</div>
                  <div className={styles.authStepDesc}>
                    Navigate to <strong>Settings → API Keys</strong> in the Autokkeep dashboard
                    and click &quot;Create Key&quot;. Give it a descriptive name.
                  </div>
                </div>
              </div>
              <div className={styles.authStep}>
                <div className={styles.authStepNumber}>2</div>
                <div className={styles.authStepContent}>
                  <div className={styles.authStepTitle}>Copy the Key</div>
                  <div className={styles.authStepDesc}>
                    The key is shown once. Copy it and store it securely — you won&apos;t be able
                    to view it again.
                  </div>
                </div>
              </div>
              <div className={styles.authStep}>
                <div className={styles.authStepNumber}>3</div>
                <div className={styles.authStepContent}>
                  <div className={styles.authStepTitle}>Include in Requests</div>
                  <div className={styles.authStepDesc}>
                    Add the <code className={styles.inlineCode}>X-API-Key</code> header to every
                    API request.
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock
              label="Example Request"
              code={`curl -X GET "https://app.autokkeep.com/api/v1/entities" \\
  -H "X-API-Key: ak_live_your_api_key_here"`}
              id="auth-example"
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />

            <div className={styles.calloutWarning}>
              <span className={styles.calloutIcon}>⚠️</span>
              <div className={styles.calloutContent}>
                <div className={styles.calloutTitle}>Keep Your Keys Secure</div>
                Never expose API keys in client-side code, public repositories, or browser-accessible
                locations. Use environment variables on your server.
              </div>
            </div>

            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', marginTop: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>
              Security Best Practices
            </h3>
            <ul className={styles.securityList}>
              <li className={styles.securityItem}>
                <span className={styles.securityIcon}>🔑</span>
                <span>Store API keys in environment variables or a secrets manager — never hardcode them.</span>
              </li>
              <li className={styles.securityItem}>
                <span className={styles.securityIcon}>🔄</span>
                <span>Rotate keys periodically. You can create multiple keys and deprecate old ones.</span>
              </li>
              <li className={styles.securityItem}>
                <span className={styles.securityIcon}>🔒</span>
                <span>All API requests must use HTTPS. HTTP requests will be rejected.</span>
              </li>
              <li className={styles.securityItem}>
                <span className={styles.securityIcon}>📊</span>
                <span>Monitor API key usage in the Settings dashboard. Disable keys immediately if compromised.</span>
              </li>
            </ul>
          </section>

          {/* ── Endpoint Sections ── */}
          {/* Transactions */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Transactions</h2>
            <p className={styles.sectionDescription}>
              Access and filter your organization&apos;s transaction data programmatically.
            </p>
            <EndpointCard
              endpoint={ENDPOINTS.find((e) => e.id === 'get-transactions')!}
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
          </section>

          {/* Entities */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Entities</h2>
            <p className={styles.sectionDescription}>
              Manage and list entities (companies/subsidiaries) in your organization.
            </p>
            <EndpointCard
              endpoint={ENDPOINTS.find((e) => e.id === 'get-entities')!}
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
          </section>

          {/* Categories */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Categories</h2>
            <p className={styles.sectionDescription}>
              Retrieve the chart of accounts (GL categories) configured for your entities.
            </p>
            <EndpointCard
              endpoint={ENDPOINTS.find((e) => e.id === 'get-categories')!}
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
          </section>

          {/* Reports */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Reports</h2>
            <p className={styles.sectionDescription}>
              Generate financial reports on demand. Reports use only approved and synced transactions.
            </p>
            <EndpointCard
              endpoint={ENDPOINTS.find((e) => e.id === 'get-profit-loss')!}
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
            <EndpointCard
              endpoint={ENDPOINTS.find((e) => e.id === 'get-balance-sheet')!}
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
          </section>

          {/* Webhooks */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Webhooks</h2>
            <p className={styles.sectionDescription}>
              Subscribe to real-time events and receive HTTP callbacks when things happen in Autokkeep.
            </p>
            <EndpointCard
              endpoint={ENDPOINTS.find((e) => e.id === 'get-webhooks')!}
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
            <EndpointCard
              endpoint={ENDPOINTS.find((e) => e.id === 'post-webhooks')!}
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
          </section>

          {/* ── Rate Limits Section ── */}
          <section id="rate-limits" className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Rate Limits</h2>
            <p className={styles.sectionDescription}>
              All API endpoints enforce rate limits per IP address. Limits are returned in response
              headers so you can implement proper backoff.
            </p>

            <table className={styles.rateLimitTable}>
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Limit</th>
                  <th>Window</th>
                </tr>
              </thead>
              <tbody>
                {RATE_LIMITS.map((rl) => (
                  <tr key={rl.endpoint}>
                    <td>
                      <span className={styles.rateLimitEndpoint}>{rl.endpoint}</span>
                    </td>
                    <td>
                      <span className={styles.rateLimitValue}>{rl.limit}</span>
                    </td>
                    <td>{rl.window}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.calloutInfo}>
              <span className={styles.calloutIcon}>ℹ️</span>
              <div className={styles.calloutContent}>
                <div className={styles.calloutTitle}>Response Headers</div>
                Each response includes rate limit headers:{' '}
                <code className={styles.inlineCode}>X-RateLimit-Limit</code>,{' '}
                <code className={styles.inlineCode}>X-RateLimit-Remaining</code>, and{' '}
                <code className={styles.inlineCode}>X-RateLimit-Reset</code> (seconds until
                window resets). When exceeded, a{' '}
                <code className={styles.inlineCode}>429 Too Many Requests</code> response is
                returned with a <code className={styles.inlineCode}>Retry-After</code> header.
              </div>
            </div>

            <CodeBlock
              label="429 Response Example"
              code={`{
  "error": "Too many requests. Please try again later."
}

// Response Headers:
// X-RateLimit-Limit: 60
// X-RateLimit-Remaining: 0
// X-RateLimit-Reset: 45
// Retry-After: 45`}
              id="rate-limit-429"
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
          </section>

          {/* ── Code Examples Section ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitleGradient}>Code Examples</h2>
            <p className={styles.sectionDescription}>
              Quick-start examples in cURL and JavaScript to get you up and running.
            </p>

            <div className={styles.tabGroup}>
              <button
                className={codeTab === 'curl' ? styles.tabActive : styles.tab}
                onClick={() => setCodeTab('curl')}
              >
                cURL
              </button>
              <button
                className={codeTab === 'javascript' ? styles.tabActive : styles.tab}
                onClick={() => setCodeTab('javascript')}
              >
                JavaScript
              </button>
            </div>

            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>
              List Transactions
            </h3>
            <CodeBlock
              label={codeTab === 'curl' ? 'cURL' : 'JavaScript (fetch)'}
              code={codeTab === 'curl' ? curlExamples.transactions : jsExamples.transactions}
              id="example-transactions"
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />

            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
              Generate P&L Report
            </h3>
            <CodeBlock
              label={codeTab === 'curl' ? 'cURL' : 'JavaScript (fetch)'}
              code={codeTab === 'curl' ? curlExamples.profitLoss : jsExamples.profitLoss}
              id="example-pnl"
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />

            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
              Create Webhook Subscription
            </h3>
            <CodeBlock
              label={codeTab === 'curl' ? 'cURL' : 'JavaScript (fetch)'}
              code={codeTab === 'curl' ? curlExamples.webhook : jsExamples.webhook}
              id="example-webhook"
              copiedStates={copiedStates}
              onCopy={handleCopy}
            />
          </section>
        </main>
      </div>

      {/* ── Back to Top ── */}
      <button
        className={showBackToTop ? styles.backToTopVisible : styles.backToTop}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
      >
        ↑
      </button>
    </>
  );
}
