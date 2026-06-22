# PO Analysis Agent

> AI-assisted Purchase Order reconciliation on SAP BTP — detects 3-way matching discrepancies between Purchase Orders, Goods Receipts, and Invoices, and uses an LLM to contextualise anomalies that free-text notes can explain.

![SAP BTP](https://img.shields.io/badge/SAP%20BTP-0070F2?style=flat&logo=sap&logoColor=white)
![CAP](https://img.shields.io/badge/CAP-Node.js-brightgreen?style=flat)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=nodedotjs&logoColor=white)
![Anthropic](https://img.shields.io/badge/Anthropic-Claude-blueviolet?style=flat)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat)](LICENSE)

---

## Architecture

```
┌──────────────────┐      ┌──────────────────────────────────────────┐
│  Job Scheduling  │─────▶│          PO Analysis Agent (CAP)         │
│     Service      │      │                                          │
└──────────────────┘      │  ┌─────────────┐   ┌──────────────────┐  │
                           │  │  3-Way Match │──▶│    AI Provider   │  │
┌──────────────────┐      │  │   (rules)   │   │ mock/Claude/Core │  │
│   SAP S/4HANA    │─────▶│  └─────────────┘   └──────────────────┘  │
│  (OData source)  │      │          │                  │             │
└──────────────────┘      │          ▼                  ▼             │
                           │  ┌────────────────────────────────────┐  │
                           │  │        SAP HANA (results)          │  │
                           │  └────────────────────────────────────┘  │
                           └──────────────────────────────────────────┘
```

The agent is deployed as a CAP (Node.js) application on SAP BTP Cloud Foundry. A daily job triggers a full analysis run: for each open Purchase Order, the engine runs deterministic 3-way matching rules, then sends any flagged anomalies — along with the PO's free-text notes — to an LLM for contextual assessment. Results are stored for human review; the agent never writes back to S/4HANA automatically.

---

## The 3-Way Matching Problem

In procurement, a **3-way match** is the process of reconciling three documents before approving payment: the Purchase Order (what was ordered and at what price), the Goods Receipt (what was actually delivered), and the Invoice (what the supplier is charging). When all three align, payment can proceed. When they diverge — a quantity shortage, a price discrepancy, or a missing document — the invoice must be held and investigated.

At scale, this process breaks down. A mid-sized company may process thousands of POs per month across dozens of vendors and business units. Manual reconciliation is slow, error-prone, and consumes significant Accounts Payable capacity. Automated rule engines catch clear-cut mismatches, but they produce false positives for legitimate exceptions — partial deliveries, split shipments, vendor credit adjustments — that were agreed verbally or documented in free-text fields that rules cannot read.

## Why AI Adds Value

The most interesting case in this system is not the ones rules get right — it is the ones rules flag as wrong but are actually fine. Consider a PO where the invoice amount is 25% lower than the original order. A rule immediately flags `AMOUNT_MISMATCH`. But the PO's notes field reads: _"Partial delivery agreed with vendor on 2026-05-12. First shipment of 90 units; remaining 30 units deferred to Q3 pending regulatory clearance."_ A human AP analyst would read that note and immediately understand the invoice is correct. A rule cannot.

This agent uses an LLM as a second-pass assessor. The deterministic matching engine flags the anomaly; the LLM reads the notes, assesses the conflict in context, and returns a structured response: an explanation, a confidence score, and an actionable recommendation. A high-confidence flag with no explanatory notes escalates. A flag with a plausible explanation in the notes gets a lower confidence score and a softer recommendation. The analyst still makes the call — but they are working from a pre-triaged queue rather than a raw exception list.

## Contributing

This is a portfolio project. Issues and PRs are welcome — 
particularly around additional conflict detection scenarios 
or new AI provider integrations.

---

## Project Structure

```
po-analysis-agent/
├── db/
│   └── schema.cds              ← CDS data model (PO, GR, Invoice, AnalysisResult)
├── srv/
│   ├── po-analysis-service.cds ← OData service definition
│   ├── po-analysis-service.js  ← Service handlers (triggerAnalysis, runFullAnalysis)
│   ├── ai/
│   │   ├── ai-provider.js      ← Factory: reads AI_PROVIDER env var
│   │   ├── mock-provider.js    ← Hardcoded realistic responses (default)
│   │   ├── claude-provider.js  ← Anthropic Claude via @anthropic-ai/sdk
│   │   └── aicore-provider.js  ← SAP AI Core inference endpoint
│   ├── matching/
│   │   └── three-way-match.js  ← Pure functions: detect mismatches
│   └── scheduler/
│       └── daily-job.js        ← Full-run orchestration
├── docs/
│   ├── ADR.md                  ← Architecture Decision Records
│   └── architecture.md         ← System overview with ASCII diagram
└── test/
    ├── sample-data/            ← 10 realistic anonymized POs + GRs + Invoices
    └── po-analysis.test.js     ← Jest unit + integration tests
```

---

## Quick Start (Local)

### Prerequisites

- Node.js 22+
- `@sap/cds-dk` globally installed: `npm install -g @sap/cds-dk`

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — the defaults work for local development with AI_PROVIDER=mock
```

### 3. Run the demo analysis

```bash
# One-command demo — no server or SAP credentials needed (uses mock AI by default)
npm run analyze
```

This runs all 10 sample POs through the 3-way match engine and the mock AI provider, printing a formatted report to stdout. Set `AI_PROVIDER=claude` (with a real `ANTHROPIC_API_KEY`) to call the live LLM instead.

### 4. Run the full CAP service

```bash
npm run watch
# Service starts at http://localhost:4004
# CAP uses an in-memory SQLite database automatically
```

```bash
# Trigger a full analysis via the OData action
curl -X POST http://localhost:4004/api/po-analysis/runFullAnalysis

# Analyse a single PO by UUID
curl -X POST http://localhost:4004/api/po-analysis/triggerAnalysis \
  -H "Content-Type: application/json" \
  -d '{"poID": "11111111-1111-1111-1111-111111111010"}'
```

---

## Running Tests

```bash
npm test
```

The test suite covers:
- All five conflict detection functions in `three-way-match.js`
- `runThreeWayMatch` against all 10 sample POs
- The AI provider factory (provider selection and error handling)
- The mock provider (response shape and notes interpolation)

```bash
npm run test:coverage
```

---

## AI Provider Setup

### Option 1: Mock (default — no configuration needed)

```env
AI_PROVIDER=mock
```

Returns realistic hardcoded responses with slight randomisation. Suitable for local development, CI pipelines, and demos without API keys.

### Option 2: Anthropic Claude

```env
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

Calls `claude-haiku-4-5-20251001` via the Anthropic API. Requires an Anthropic account and API key. See [Anthropic docs](https://docs.anthropic.com) for pricing.

### Option 3: SAP AI Core

```env
AI_PROVIDER=aicore
AICORE_BASE_URL=https://<instance>.inference.ml.hana.ondemand.com
AICORE_AUTH_URL=https://<uaa-subdomain>.authentication.eu10.hana.ondemand.com/oauth/token
AICORE_CLIENT_ID=sb-your-client-id
AICORE_CLIENT_SECRET=your-client-secret
AICORE_DEPLOYMENT_ID=d1234abcd
AICORE_RESOURCE_GROUP=default
```

Calls an SAP AI Core inference deployment. Suitable for enterprise scenarios with data residency requirements. The deployment must expose an OpenAI-compatible `/chat/completions` endpoint.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_PROVIDER` | No | `mock` | AI backend: `mock`, `claude`, or `aicore` |
| `ANTHROPIC_API_KEY` | If `claude` | — | Anthropic API key |
| `AICORE_BASE_URL` | If `aicore` | — | SAP AI Core inference base URL |
| `AICORE_AUTH_URL` | If `aicore` | — | OAuth token endpoint for AI Core |
| `AICORE_CLIENT_ID` | If `aicore` | — | OAuth client ID |
| `AICORE_CLIENT_SECRET` | If `aicore` | — | OAuth client secret |
| `AICORE_DEPLOYMENT_ID` | If `aicore` | — | AI Core deployment ID |
| `AICORE_RESOURCE_GROUP` | If `aicore` | `default` | AI Core resource group |
| `NODE_ENV` | No | `development` | Node environment |
| `PORT` | No | `4004` | HTTP port (set by CF runtime in production) |

---

## Deploying to SAP BTP

```bash
# Install MTA build tool
npm install -g mbt

# Build the MTA archive
mbt build

# Deploy to Cloud Foundry
cf login -a https://api.cf.<region>.hana.ondemand.com
cf deploy mta_archives/*.mtar
```

Ensure the following BTP services are available in your space before deploying:
- **SAP HANA Cloud** (HDI container)
- **SAP Job Scheduling Service** (for the daily trigger)
- **SAP AI Core** (optional, only if using `AI_PROVIDER=aicore`)

---

## Sample Data Scenarios

The 10 sample POs in `test/sample-data/` cover the following cases:

| PO | Vendor | Scenario |
|---|---|---|
| po-001 | Acme Industrial Supplies | Clean — no issues |
| po-002 | Nordic Office Solutions | Clean — no issues |
| po-003 | Iberian Logistics | Clean — no issues |
| po-004 | Alpine Precision Parts | Amount mismatch (invoice 1.7% over PO) |
| po-005 | Baltic Freight Carriers | Amount mismatch + overdue |
| po-006 | Adriatica Chemicals | Overdue (past due 2026-04-30) |
| po-007 | Benelux Tech Components | No goods receipt |
| po-008 | Hanseatic Trading | No invoice |
| po-009 | Levantine Textiles | Quantity mismatch (190 of 250 received) |
| po-010 | Caledonian Engineering | Amount + quantity mismatch with explanatory notes |

po-010 is the key AI test case: the discrepancies are real, but the PO notes explain them as a partial delivery agreed with the vendor. The mock provider acknowledges the notes in its assessment; the Claude and AI Core providers use the LLM to reason about them.

---

## Architecture Decisions

See [docs/ADR.md](docs/ADR.md) for the full rationale behind:
- Why a scheduled job rather than event-driven
- Why a local data replica rather than live OData calls to S/4HANA
- Why the agent recommends only and never writes back automatically
- Why CAP over Express or FastAPI
- The trade-offs between SAP AI Core and direct Anthropic API
- Why AI contextualises anomalies rather than generates reports

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | SAP BTP Cloud Foundry, Node.js 20 |
| Framework | SAP CAP (Cloud Application Programming Model) |
| Database | SAP HANA Cloud (prod) / SQLite in-memory (dev) |
| AI — enterprise | SAP AI Core |
| AI — cloud | Anthropic Claude (`claude-sonnet-4-6`) |
| Tests | Vitest |
| Deployment | MTA / `cf deploy` |

---

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.