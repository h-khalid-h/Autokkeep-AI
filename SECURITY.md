# Security Policy

Autokkeep takes security seriously. We handle sensitive financial data and are committed to protecting our users, their organizations, and their financial information.

---

## Reporting a Vulnerability

If you discover a security vulnerability, **please report it responsibly**. Do **not** file a public GitHub issue.

### Responsible Disclosure Process

1. **Email** your findings to **[security@autokkeep.com](mailto:security@autokkeep.com)**
2. Include the following in your report:
   - Description of the vulnerability
   - Steps to reproduce (proof of concept if possible)
   - Potential impact assessment
   - Any suggested remediation
3. You will receive an **acknowledgment within 48 hours**
4. We will investigate and provide a detailed response within **5 business days**
5. We will coordinate a fix and disclosure timeline with you
6. Once the fix is deployed, we will publicly acknowledge your contribution (unless you prefer anonymity)

### What to Expect

| Timeline | Action |
|----------|--------|
| **48 hours** | Initial acknowledgment |
| **5 business days** | Detailed response with severity assessment |
| **30 days** | Target for fix deployment (critical issues faster) |
| **Post-fix** | Public advisory and credit (if desired) |

### Guidelines

- **Do not** access, modify, or delete data belonging to other users
- **Do not** perform denial-of-service attacks
- **Do not** send unsolicited messages to users as part of testing
- **Do** make a good-faith effort to minimize impact during testing
- **Do** use test/staging environments when possible

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release (`main`) | ✅ Fully supported |
| Previous releases | ❌ Not supported — please upgrade |

We only provide security patches for the **latest version** deployed on `main`. We strongly recommend always running the most recent release.

---

## Security Features

Autokkeep implements defense-in-depth with multiple layers of security:

### Authentication & Authorization

- **Supabase Auth** with SSR-based session management
- **Row-Level Security (RLS)** enforced on all 16 database tables
- **Organization-based access control** with role hierarchy (owner → admin → accountant → viewer)
- **Auth middleware** protecting all application routes
- **Session validation** on every API request

### Data Protection

- **Encryption at rest** — All data encrypted via Supabase/PostgreSQL (AES-256)
- **Encryption in transit** — TLS 1.3 enforced on all connections
- **Webhook signature verification** — Cryptographic verification for Stripe, Plaid, and Twilio webhooks
- **Input validation** — All API inputs validated with Zod schemas before processing
- **SQL injection prevention** — Parameterized queries via Supabase client (no raw SQL in application code)

### HTTP Security Headers

- **Content-Security-Policy (CSP)** — Strict CSP headers preventing XSS and data injection
- **Permissions-Policy** — Restricts browser feature access (camera, microphone, geolocation)
- **Strict-Transport-Security (HSTS)** — Forces HTTPS with long max-age
- **X-Content-Type-Options** — Prevents MIME-type sniffing
- **X-Frame-Options** — Prevents clickjacking via framing

### Rate Limiting

- **API rate limiting** on all public-facing route categories
- **Per-IP and per-organization** throttling
- **Webhook endpoint protection** with signature-first validation

### Audit & Compliance

- **Immutable audit log** — All sensitive operations recorded with actor, action, and timestamp
- **GDPR-compliant account deletion** — Full data erasure on user request
- **Cookie consent** — Compliant consent management
- **Period locking** — Accounting periods can be locked to prevent retroactive changes

### Infrastructure

- **Automated CI/CD security checks** — `npm audit` runs on every pull request
- **Dependency monitoring** — Automated alerts for known vulnerabilities in dependencies
- **Environment variable isolation** — Secrets never exposed to the client bundle (`NEXT_PUBLIC_` prefix only for safe values)

---

## Bug Bounty Program

🚧 **Coming Soon**

We are working on establishing a formal bug bounty program to reward security researchers who help us improve Autokkeep's security posture. Details will be published here once the program launches.

In the meantime, we deeply appreciate responsible disclosures and will publicly credit researchers (with permission) in our security advisories.

---

## Security Contacts

| Channel | Contact |
|---------|---------|
| **Security Reports** | [security@autokkeep.com](mailto:security@autokkeep.com) |
| **General Inquiries** | [hello@autokkeep.com](mailto:hello@autokkeep.com) |
| **PGP Key** | Available upon request |

---

## Acknowledgments

We thank the security community for helping keep Autokkeep and its users safe. Researchers who have responsibly disclosed vulnerabilities will be listed here.

---

*Last updated: June 10, 2026*
