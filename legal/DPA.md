# Data Processing Agreement (DPA)

**Version 1.0 — Last Updated: [DATE]**

This Data Processing Agreement ("DPA") is entered into between:

**Data Controller**: The organization ("Customer") that subscribes to Autokkeep OS services.

**Data Processor**: [Autokkeep Legal Entity Name] ("Autokkeep"), operating the Autokkeep OS platform.

---

## 1. Definitions

| Term | Definition |
|------|-----------|
| **Personal Data** | Any information relating to an identified or identifiable natural person, including names, email addresses, bank account identifiers, and financial transaction metadata. |
| **Processing** | Any operation performed on Personal Data, including collection, recording, organization, structuring, storage, adaptation, retrieval, consultation, use, disclosure, or erasure. |
| **Sub-processor** | A third-party service provider engaged by Autokkeep to process Personal Data on behalf of the Customer. |
| **Data Subject** | An identified or identifiable natural person whose Personal Data is processed. |
| **Data Breach** | A breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to Personal Data. |

---

## 2. Scope & Purpose of Processing

Autokkeep processes Personal Data solely for the purpose of providing the Autokkeep OS bookkeeping automation services, including:

- **Transaction categorization** — analyzing financial transaction descriptions to assign general ledger codes
- **Bank account synchronization** — connecting to financial institutions via Plaid to retrieve transaction data
- **AI-assisted categorization** — processing transaction metadata (with PII stripped via the Zero-Knowledge Privacy Parser) through OpenAI's API
- **Notification dispatch** — sending transaction review alerts via email, SMS, or messaging platforms
- **Ledger synchronization** — synchronizing journal entries to QuickBooks Online or Xero

---

## 3. Data Processing Principles

Autokkeep shall:

1. Process Personal Data only on documented instructions from the Customer
2. Ensure that persons authorized to process Personal Data have committed to confidentiality
3. Take all measures required pursuant to Article 32 of GDPR (security of processing)
4. Assist the Customer in fulfilling Data Subject rights requests (access, rectification, erasure, portability)
5. Delete or return all Personal Data upon termination of services, at the Customer's choice
6. Make available all information necessary to demonstrate compliance and allow for audits

---

## 4. Data Minimization & Privacy by Design

### 4.1 Zero-Knowledge Privacy Parser

Autokkeep implements a **Zero-Knowledge Privacy Parser** that strips personally identifiable information (PII) from transaction data before it is sent to any AI inference provider. This includes:

- Credit card numbers
- Social Security numbers
- Email addresses
- Phone numbers
- Physical addresses
- Name suffixes and identifiers

The parser replaces PII with `[REDACTED]` tokens and generates a SHA-256 hash of the original data for audit trail purposes, without retaining the original PII in the AI processing pipeline.

### 4.2 Data Retention

| Data Type | Retention Period | Basis |
|-----------|-----------------|-------|
| Financial transactions | Duration of subscription + 7 years | Legal/tax requirement |
| Bank connection credentials | Duration of active connection | Service delivery |
| AI categorization logs | 90 days | Debugging/improvement |
| Audit trail / citations | Duration of subscription + 7 years | Legal/compliance |
| Account data (name, email) | Duration of subscription + 30 days | Service delivery |

---

## 5. Sub-processors

Autokkeep uses the following sub-processors:

| Sub-processor | Purpose | Data Processed | Location |
|--------------|---------|---------------|----------|
| **Supabase** (via AWS) | Database hosting, authentication | All application data | US / EU (configurable) |
| **OpenAI** | AI transaction categorization | Tokenized transaction descriptions (PII-stripped) | US |
| **Plaid** | Bank account connectivity | Account identifiers, transaction metadata | US |
| **Stripe** | Payment processing | Billing information | US / EU |
| **Resend** | Email delivery | Email addresses, notification content | US |
| **Twilio** | SMS notifications | Phone numbers, alert content | US |

Autokkeep will:
- Notify the Customer of any intended changes to sub-processors at least 30 days in advance
- Provide the Customer the opportunity to object to such changes
- Ensure all sub-processors are bound by data protection obligations no less onerous than those in this DPA

---

## 6. Security Measures

Autokkeep implements the following technical and organizational measures:

### Technical Measures
- **Encryption in transit**: TLS 1.2+ on all connections (HSTS enforced)
- **Encryption at rest**: AES-256 via database provider (Supabase/AWS)
- **Row-Level Security**: 67 PostgreSQL RLS policies enforcing data isolation
- **Rate limiting**: Redis-backed API rate limiting on all public endpoints
- **Content Security Policy**: Comprehensive CSP headers preventing XSS
- **Webhook verification**: Cryptographic signature verification on all inbound webhooks

### Organizational Measures
- Role-based access control (RBAC) for team members
- Principle of least privilege for database access
- Incident response procedures documented in operational runbook
- Regular security review of application dependencies

---

## 7. Data Breach Notification

In the event of a Data Breach, Autokkeep shall:

1. **Notify the Customer** without undue delay and no later than **72 hours** after becoming aware of the breach
2. Provide the following information:
   - Nature of the breach, including categories and approximate number of Data Subjects affected
   - Contact details of Autokkeep's data protection point of contact
   - Likely consequences of the breach
   - Measures taken or proposed to address the breach
3. Document all Data Breaches, including facts, effects, and remedial actions taken
4. Cooperate with the Customer in fulfilling the Customer's notification obligations to supervisory authorities and Data Subjects

---

## 8. Data Subject Rights

Autokkeep shall assist the Customer in responding to Data Subject requests, including:

- **Right of access** (Article 15 GDPR)
- **Right to rectification** (Article 16 GDPR)
- **Right to erasure** (Article 17 GDPR) — implemented via account deletion
- **Right to restriction of processing** (Article 18 GDPR)
- **Right to data portability** (Article 20 GDPR) — implemented via CSV/SQL export
- **Right to object** (Article 21 GDPR)

Autokkeep will respond to Customer requests regarding Data Subject rights within **5 business days**.

---

## 9. International Data Transfers

Where Personal Data is transferred outside the European Economic Area (EEA), Autokkeep relies on:

- **Standard Contractual Clauses (SCCs)** as adopted by the European Commission
- Sub-processor compliance with applicable data protection frameworks
- Supplementary measures including encryption and pseudonymization

---

## 10. Audit Rights

The Customer may:

1. Request documentation demonstrating Autokkeep's compliance with this DPA
2. Conduct audits (or appoint a third-party auditor) of Autokkeep's processing activities, with reasonable notice
3. Autokkeep will make available all information reasonably necessary to demonstrate compliance

Audits shall be conducted:
- No more than once per year, unless triggered by a Data Breach
- With at least 30 days' prior written notice
- During normal business hours
- At the Customer's expense (unless the audit reveals material non-compliance)

---

## 11. Term & Termination

This DPA shall remain in effect for the duration of the Customer's subscription to Autokkeep OS services.

Upon termination:
- Autokkeep will delete or return all Personal Data within **30 days**, at the Customer's election
- Autokkeep may retain Personal Data where required by applicable law (e.g., tax/accounting records for 7 years)
- Autokkeep will provide a certificate of deletion upon request

---

## 12. Liability

The liability of each party under this DPA is subject to the limitations of liability set out in the main Terms of Service agreement between the parties.

---

## 13. Governing Law

This DPA shall be governed by the same law that governs the main Terms of Service between the parties.

---

## Signatures

| | Data Controller (Customer) | Data Processor (Autokkeep) |
|---|---|---|
| **Name** | _________________________ | _________________________ |
| **Title** | _________________________ | _________________________ |
| **Date** | _________________________ | _________________________ |
| **Signature** | _________________________ | _________________________ |

---

> **Note**: This template should be reviewed by qualified legal counsel before use. It is provided as a starting point aligned with GDPR requirements and Autokkeep's technical architecture.
