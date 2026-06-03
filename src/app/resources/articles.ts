import type { Metadata } from 'next';

// ─── Article Data ────────────────────────────────────────────────────────────

export interface Article {
  slug: string;
  date: string;
  category: string;
  title: string;
  excerpt: string;
  readTime: string;
  featured: boolean;
  content: string[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export const articles: Article[] = [
  {
    slug: slugify('5 Financial Metrics Every Small Business Should Track Weekly'),
    date: 'May 2026',
    category: 'For Business Owners',
    title: '5 Financial Metrics Every Small Business Should Track Weekly',
    excerpt: 'Understanding revenue growth, cash runway, expense ratios, outstanding receivables, and burn rate isn\'t just for CFOs.',
    readTime: '5 min read',
    featured: false,
    content: [
      'Running a small business means wearing every hat — CEO, sales lead, customer support, and often your own bookkeeper. But there are five financial metrics that every business owner should review weekly, regardless of industry or stage. These numbers tell the story of your business health better than any gut feeling.',
      '**1. Revenue Growth Rate** — Track your week-over-week and month-over-month revenue trends. A consistent upward trend is encouraging, but look for the rate of change. Accelerating growth means your efforts are compounding; decelerating growth is an early warning sign that needs investigation before it becomes a problem.',
      '**2. Cash Runway** — How many months can your business operate at the current burn rate? This is arguably the most critical metric for any business under $10M in revenue. Calculate it simply: current cash balance divided by average monthly expenses. If your runway drops below 6 months, it\'s time to act — either cut expenses or accelerate revenue.',
      '**3. Expense Ratio** — What percentage of revenue goes to operating expenses? For most service businesses, keeping this below 70% is healthy. For SaaS companies, it varies by stage. The key is tracking the trend — if expenses are growing faster than revenue, you\'re heading toward trouble.',
      '**4. Outstanding Receivables (DSO)** — Days Sales Outstanding measures how quickly you collect payment. A DSO above 45 days means cash is trapped in unpaid invoices. Automated reminders and clear payment terms can dramatically reduce DSO — some Autokkeep users have cut collection times by 40% simply by having AI flag overdue accounts weekly.',
      '**5. Burn Rate** — For venture-backed startups, this is existential. For bootstrapped businesses, it\'s equally important but often overlooked. Track your net monthly cash outflow. When paired with runway, it gives you a clear picture of sustainability. AI-powered tools can automatically categorize expenses and calculate burn rate in real time, eliminating the spreadsheet gymnastics.',
    ],
  },
  {
    slug: slugify('How AI is Replacing the 2000 per month Bookkeeper'),
    date: 'May 2026',
    category: 'For Startups',
    title: 'How AI is Replacing the $2,000/month Bookkeeper',
    excerpt: 'Startups are switching from manual bookkeeping to AI-powered financial operations — and saving thousands per month.',
    readTime: '6 min read',
    featured: false,
    content: [
      'The traditional bookkeeping model is broken for startups. You either hire a $2,000-$4,000/month bookkeeper who manually categorizes transactions days or weeks after they occur, or you do it yourself — badly, inconsistently, and always behind. AI-powered financial operations offer a third path.',
      'Modern AI categorization engines can process bank transactions in seconds with 95%+ accuracy. They learn your chart of accounts, understand your vendor patterns, and apply consistent rules that a human bookkeeper might miss on a busy day. The result: cleaner books, faster close, and a fraction of the cost.',
      'But the real value isn\'t just cost savings. It\'s speed and consistency. When every transaction is categorized in real time, you always know your financial position. No more waiting until month-end to discover you overspent on marketing. No more scrambling to reconcile accounts before a board meeting.',
      'The key is the confidence scoring approach. Not all AI categorizations are equal — some are obvious (your monthly Slack subscription) and some require human judgment (is that dinner expense a client entertainment or a team meal?). A well-designed system auto-approves the clear ones and routes the ambiguous ones to human review.',
      'Founders who automate bookkeeping early build a critical advantage: financial discipline from day one. Clean books make fundraising easier, tax season painless, and business decisions data-driven instead of gut-driven. The $2,000/month bookkeeper isn\'t disappearing — they\'re evolving into strategic advisors who focus on insights rather than data entry.',
    ],
  },
  {
    slug: slugify('Multi-Currency Bookkeeping What Every Global Seller Needs to Know'),
    date: 'April 2026',
    category: 'For Ecommerce',
    title: 'Multi-Currency Bookkeeping: What Every Global Seller Needs to Know',
    excerpt: 'Managing transactions across USD, EUR, GBP, and beyond without spreadsheet chaos.',
    readTime: '5 min read',
    featured: false,
    content: [
      'Global ecommerce has made multi-currency bookkeeping a reality for businesses of all sizes. Whether you\'re selling on Amazon Europe, accepting payments in GBP, or paying suppliers in CNY, managing multiple currencies without losing your mind (or your accuracy) requires a systematic approach.',
      'The fundamental challenge is exchange rate fluctuations. A sale recorded at €100 when EUR/USD was 1.08 has a different dollar value than when you actually receive the funds at 1.10. These unrealized gains and losses need to be tracked, and at month-end, all foreign currency balances should be revalued to the current rate.',
      'Automated systems solve this by pulling real-time exchange rates, converting transactions at the date of occurrence, and automatically calculating gains/losses at period end. What used to take a bookkeeper hours of spreadsheet work happens in seconds.',
      'The key best practices: always record the original currency amount alongside the base currency equivalent; revalue foreign currency balances monthly; keep separate accounts for realized vs. unrealized FX gains; and make sure your chart of accounts supports multi-currency from the start. Retrofitting is painful.',
      'For ecommerce sellers specifically, payment processor reconciliation adds another layer of complexity. Stripe, PayPal, and Amazon each handle currency conversion differently, often holding funds in the original currency before converting. Automated reconciliation tools that understand these platform-specific patterns save enormous time.',
    ],
  },
  {
    slug: slugify('The Month-End Close Checklist From 15 Days to 24 Hours'),
    date: 'April 2026',
    category: 'Financial Ops',
    title: 'The Month-End Close Checklist: From 15 Days to 24 Hours',
    excerpt: 'The monthly close is the most dreaded ritual in finance. AI-powered close automation eliminates the scramble.',
    readTime: '7 min read',
    featured: false,
    content: [
      'The average small business takes 10-15 days to close their books each month. For accounting firms managing multiple clients, this means the first two weeks of every month are consumed by backward-looking reconciliation work. The "continuous close" approach, powered by AI automation, can compress this to 24 hours or less.',
      'The continuous close works by eliminating the batch processing mentality. Instead of waiting until month-end to categorize transactions, reconcile accounts, and generate reports, these activities happen continuously throughout the month. By the time the calendar flips, 95% of the work is already done.',
      '**The 24-Hour Close Checklist:** Day 1, Hour 1-4: Review the AI-flagged exceptions queue (typically 5-10% of transactions). Hour 4-8: Verify accruals, prepaid expenses, and depreciation schedules. Hour 8-16: Review the auto-generated trial balance and P&L. Hour 16-20: Generate and review management reports. Hour 20-24: Final sign-off and period lock.',
      'The secret sauce is the readiness score. Before you even start the close, the system should tell you your readiness percentage. Below 80%? There are unresolved items that need attention. Above 95%? You\'re essentially done — just review and approve. This score-driven approach removes the anxiety from month-end.',
      'For firms managing multiple entities, the compound effect is dramatic. Instead of 15 days × 50 clients = 750 person-days per month, you\'re looking at 1 day × 50 clients with AI pre-processing = a team of 3-4 completing in a week. This is how modern firms scale from 50 clients to 200+ without proportionally scaling headcount.',
    ],
  },
  {
    slug: slugify('Why Botkeeper and Bench Failed And What It Means for AI Bookkeeping'),
    date: 'May 2026',
    category: 'Industry Analysis',
    title: 'Why Botkeeper and Bench Failed — And What It Means for AI Bookkeeping',
    excerpt: 'Both Botkeeper and Bench.co relied on hybrid AI + human models that couldn\'t scale.',
    readTime: '8 min read',
    featured: true,
    content: [
      'The shutdowns of Bench.co and Botkeeper\'s pivot away from AI bookkeeping sent shockwaves through the accounting technology industry. Both companies raised significant venture capital, attracted thousands of customers, and ultimately proved that the hybrid AI + human model has fundamental scaling problems.',
      'Bench\'s model relied heavily on human bookkeepers augmented by software tools. The unit economics never worked: as they added customers, they needed proportionally more staff. The AI wasn\'t autonomous enough to reduce the human workload meaningfully, and quality suffered at scale because human consistency degrades under volume pressure.',
      'Botkeeper took a different approach — marketing AI prominently while quietly relying on offshore human teams to handle the work the AI couldn\'t. When the economics didn\'t pencil out and quality complaints mounted, the mismatch between marketing and reality became untenable.',
      'The lesson isn\'t that AI bookkeeping doesn\'t work — it\'s that the approach matters. A truly AI-first system needs three things: (1) A confidence scoring mechanism that routes only genuinely ambiguous transactions to humans, not everything below "perfect." (2) A learning loop where human corrections improve the AI\'s future performance. (3) Transparent pricing that reflects the actual cost structure, not a human-labor model disguised as AI.',
      'The next generation of AI bookkeeping companies — built on large language models with structured output, multi-engine architectures (deterministic rules + probabilistic AI), and genuine automation-first design — can achieve what Bench and Botkeeper couldn\'t: profitable unit economics at scale with consistent quality. The key is letting AI do what it\'s good at (pattern matching, consistency, speed) and humans do what they\'re good at (judgment, relationship management, strategy).',
    ],
  },
  {
    slug: slugify('The Dual-Engine Architecture Why We Dont Let AI Write Directly to Your Ledger'),
    date: 'May 2026',
    category: 'Product',
    title: 'The Dual-Engine Architecture: Why We Don\'t Let AI Write Directly to Your Ledger',
    excerpt: 'Our deterministic filter handles 60% of transactions at zero AI cost. The probabilistic engine handles the rest.',
    readTime: '6 min read',
    featured: false,
    content: [
      'When we designed Autokkeep\'s categorization engine, we made a counterintuitive decision: we don\'t let the AI touch your ledger directly. Every transaction goes through a multi-stage pipeline where AI provides recommendations, but humans (or high-confidence automated rules) make the final commit.',
      'The first stage is the deterministic engine. This rule-based system handles the predictable transactions: recurring subscriptions, known vendors, payroll entries, rent payments. These represent roughly 60% of all transactions for most businesses, and they can be categorized with 100% accuracy at zero AI compute cost.',
      'The second stage is the probabilistic engine, powered by GPT-4o with structured output. For transactions the rules engine can\'t handle — new vendors, unusual amounts, ambiguous merchants — the AI provides a categorization recommendation with a confidence score. Above 95% confidence (a composite score factoring in rule matches, document evidence, and AI probability), the transaction is auto-approved. Below that threshold, it goes to the human review queue.',
      'Why not just use AI for everything? Three reasons. First, cost — running every transaction through GPT-4o is expensive at scale. The deterministic engine handles the easy cases for free. Second, latency — rule-based matching is instant; AI inference takes seconds. Third, auditability — rules are deterministic and explainable; AI confidence scores require a different kind of audit trail.',
      'The result is a system that\'s both cost-effective and accurate. The AI focuses its compute on the genuinely difficult cases, humans focus their attention on the genuinely ambiguous ones, and the rules engine handles everything in between. For our users, this translates to 95%+ accuracy with minimal manual intervention and predictable costs.',
    ],
  },
  {
    slug: slugify('The CPAs Iron Man Suit How AI Transforms Accounting Firms'),
    date: 'April 2026',
    category: 'For CPAs',
    title: 'The CPA\'s Iron Man Suit: How AI Transforms Accounting Firms From Service to Scale',
    excerpt: 'One accountant managing 200+ clients instead of 50. Zero receipt chasing. Continuous operational close.',
    readTime: '7 min read',
    featured: false,
    content: [
      'The accounting profession is at an inflection point. With 300,000+ CPAs leaving the profession and CPA exam candidates declining 30%, firms can\'t hire their way out of capacity constraints. The answer isn\'t working harder — it\'s working differently, with AI as your force multiplier.',
      'Think of AI as the Iron Man suit for accountants. It doesn\'t replace the accountant — it amplifies their capabilities. One accountant with AI tools can manage 200+ client entities instead of 50, not by cutting corners, but by eliminating the work that shouldn\'t require a CPA in the first place.',
      'The biggest time sink for most firms is receipt chasing and transaction categorization. These tasks are essential but don\'t require professional judgment. AI handles them automatically: importing transactions from connected bank accounts, applying learned categorization rules, chasing missing receipts via the client\'s preferred channel (Slack, email, SMS), and routing only the exceptions to the accountant.',
      'The second transformation is from monthly batch processing to continuous operations. Instead of dreading month-end, AI-augmented firms maintain a real-time view of every client\'s financial position. Close readiness scores show at a glance which clients need attention and which are already ready for sign-off.',
      'The business model implications are profound. When AI handles 80% of the volume work, hourly billing becomes unsustainable — you\'d need to charge $400/hour to maintain revenue with 80% fewer hours. The winning model is value-based pricing: a flat monthly fee per entity that reflects the outcomes (clean books, real-time visibility, fast close) rather than the inputs (hours spent). Clients pay for results; firms earn on efficiency.',
    ],
  },
  {
    slug: slugify('Confidence Scoring in Financial AI Why 95 Percent is the Right Threshold'),
    date: 'April 2026',
    category: 'Technical',
    title: 'Confidence Scoring in Financial AI: Why 95% is the Right Threshold',
    excerpt: 'Binary AI decisions are dangerous in finance. Our confidence scoring system routes low-certainty transactions to human review.',
    readTime: '5 min read',
    featured: false,
    content: [
      'Most AI systems make binary decisions: yes or no, category A or category B. In financial operations, this approach is dangerous. A single misclassified transaction can cascade into incorrect financial statements, tax errors, and audit findings. That\'s why we built a composite confidence scoring system with a carefully calibrated threshold.',
      'Our confidence score isn\'t a simple AI probability. It\'s a composite of three signals: (1) the deterministic rule match score — did a known pattern match? (2) the document evidence score — does a receipt or invoice confirm the categorization? (3) the AI probabilistic score — how confident is the language model in its classification? These three signals are weighted and combined into a single 0-1 score.',
      'Why 95%? We analyzed thousands of transactions across hundreds of entities and found that 95% composite confidence corresponds to a misclassification rate of approximately 0.3%. Below 90%, the error rate jumps to 2-3%. Below 80%, it\'s 5-8%. The 95% threshold represents the sweet spot where auto-approval is safe and human review is reserved for genuinely ambiguous cases.',
      'The practical impact: roughly 70-80% of transactions exceed the 95% threshold and are auto-approved. The remaining 20-30% go to the exception queue for human review. This means a business with 500 transactions per month only needs to manually review 100-150, and those are the ones where human judgment actually adds value.',
      'The threshold isn\'t fixed — it\'s configurable per entity and per category. High-risk categories like "Meals & Entertainment" (where IRS scrutiny is intense) might use a 98% threshold, while low-risk categories like "Software Subscriptions" might use 90%. This risk-based approach ensures the right level of human oversight for each type of expense.',
    ],
  },
  {
    slug: slugify('The Accountant Shortage Crisis 300000 CPAs Have Left'),
    date: 'March 2026',
    category: 'Market',
    title: 'The Accountant Shortage Crisis: 300,000 CPAs Have Left the Profession',
    excerpt: 'CPA exam candidates have declined 30%+, finance roles take 73 days to fill, and 75% of current CPAs could retire within 15 years.',
    readTime: '4 min read',
    featured: false,
    content: [
      'The numbers are stark: over 300,000 accountants and auditors have left the profession since 2019. CPA exam candidates have declined by more than 30%. Finance and accounting roles now take an average of 73 days to fill — nearly double the average for other professional roles. And 75% of currently active CPAs are expected to retire within the next 15 years.',
      'This isn\'t a temporary labor market blip. It\'s a structural crisis driven by several converging factors: the 150-credit-hour requirement for CPA licensure (which adds an extra year of education with unclear ROI), starting salaries that lag behind tech and finance, and a perception among younger workers that accounting is repetitive and uncreative.',
      'For firms, the impact is immediate and severe. Partners are turning away work because they can\'t staff engagements. Client response times are lengthening. Junior staff are burning out from the combined pressure of understaffing and increasing regulatory complexity.',
      'The only viable long-term solution is technology-enabled leverage. AI-powered tools can handle the volume work — transaction categorization, receipt matching, bank reconciliation, preliminary financial statement preparation — while human accountants focus on the judgment-intensive work: tax strategy, business advisory, audit planning, and client relationships.',
      'Firms that adopt AI tools now will be the ones that survive the shortage. Those that wait will find themselves competing for an ever-shrinking pool of human talent, paying premium salaries for work that machines can do better and faster. The question isn\'t whether to automate — it\'s how quickly you can implement.',
    ],
  },
  {
    slug: slugify('How We Protect Financial Data Security Architecture'),
    date: 'March 2026',
    category: 'Security',
    title: 'How We Protect Financial Data: Row-Level Security, Immutable Audit Trails, and Zero-Trust Architecture',
    excerpt: 'Financial data demands the highest security standards. Here\'s how Autokkeep implements bank-grade security.',
    readTime: '6 min read',
    featured: false,
    content: [
      'Financial data is among the most sensitive information a business handles. It reveals revenue, expenses, vendor relationships, employee compensation, and strategic investments. Protecting this data isn\'t just a nice-to-have — it\'s a fundamental requirement for any system that handles financial operations.',
      '**Row-Level Security (RLS):** Every query to the database passes through PostgreSQL\'s row-level security policies. These policies ensure that a user can only access data belonging to their organization and its entities. It\'s not application-level filtering that could be bypassed — it\'s enforced at the database engine level. Even if an application bug exposed a query, RLS would prevent data leakage.',
      '**Immutable Audit Trails:** Every action that modifies financial data creates an immutable audit log entry. These entries cannot be updated or deleted — not even by administrators. The audit trail records who did what, when, from where (IP address, user agent), and the before/after state. This is essential for SOC 2 compliance and provides a complete forensic history.',
      '**Zero-Trust Authentication:** We use Supabase Auth with JWTs, but we never trust the session token alone. Every API request re-validates the user via `getUser()` (which hits the auth server) rather than relying on the decoded JWT claims. This means a revoked session is immediately effective — there\'s no window of vulnerability from cached tokens.',
      '**Encryption:** All data is encrypted at rest using AES-256. Plaid access tokens are additionally encrypted with application-level encryption using a separate key, so even database access doesn\'t expose banking credentials. All connections use TLS 1.3. API keys and secrets are stored in environment variables, never in code.',
    ],
  },
  {
    slug: slugify('Value-Based Billing for AI-Augmented Accounting'),
    date: 'May 2026',
    category: 'CPA Practice',
    title: 'Value-Based Billing for AI-Augmented Accounting: Moving Beyond the Hourly Model',
    excerpt: 'When AI handles 80% of bookkeeping volume, hourly billing becomes unsustainable.',
    readTime: '6 min read',
    featured: false,
    content: [
      'The hourly billing model has been the default in accounting for decades. But when AI automation reduces the hours required for bookkeeping by 80%, the math breaks down catastrophically. If you charged $100/hour for 40 hours of monthly bookkeeping ($4,000/month), and AI reduces that to 8 hours, you\'re now billing $800 for the same outcome. Something has to change.',
      'Value-based billing prices the outcome, not the effort. Instead of tracking hours, you price the deliverable: clean, categorized books; real-time financial visibility; monthly financial statements; and on-demand reporting. The client pays for the value they receive, and the firm benefits from AI-driven efficiency.',
      'A practical pricing framework: **Tier 1 (Micro, <100 transactions/month):** $199/month — AI categorization, monthly close, basic reporting. **Tier 2 (Small, 100-500 transactions):** $499/month — adds multi-account reconciliation, tax readiness, receipt chase. **Tier 3 (Growth, 500-2000 transactions):** $999/month — adds multi-entity support, custom integrations, dedicated review.',
      'The key insight is that your costs don\'t scale linearly with transaction volume when AI handles the categorization. A client with 200 transactions costs you only marginally more than one with 100 — the AI processes both in seconds. Your human time is focused on exceptions and advisory, which scales much more favorably.',
      'For firms transitioning from hourly to value-based, the change management is as important as the pricing. Start by tracking your actual costs per client (including AI tool costs, human review time, and overhead). Then set prices that ensure healthy margins while offering clients predictability. Most firms find that value-based pricing increases revenue by 20-40% while improving client satisfaction — everyone prefers knowing their monthly cost upfront.',
    ],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getRelatedArticles(currentSlug: string, count = 3): Article[] {
  return articles
    .filter((a) => a.slug !== currentSlug)
    .slice(0, count);
}

export function generateArticleMetadata(article: Article): Metadata {
  return {
    title: `${article.title} — Autokkeep Resources`,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: 'article',
    },
  };
}
