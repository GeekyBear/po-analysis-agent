# Architecture Overview

## System Context

The PO Analysis Agent runs as a CAP application on SAP BTP and is triggered daily by the SAP Job Scheduling Service. It reads Purchase Order, Goods Receipt, and Invoice data, runs deterministic 3-way matching rules, then calls an LLM to contextualise any flagged discrepancies — particularly those where free-text notes on the PO may explain the anomaly.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          SAP BTP (CF Runtime)                       │
│                                                                     │
│  ┌──────────────────┐      ┌──────────────────────────────────────┐ │
│  │  Job Scheduling  │─────▶│        PO Analysis Agent (CAP)       │ │
│  │     Service      │      │                                      │ │
│  └──────────────────┘      │  ┌────────────┐  ┌────────────────┐  │ │
│                             │  │ 3-Way Match │  │   AI Layer     │  │ │
│  ┌──────────────────┐      │  │  (rules)   │─▶│ (LLM analysis) │  │ │
│  │   SAP S/4HANA    │─────▶│  └────────────┘  └────────────────┘  │ │
│  │  (OData source)  │      │         │                │            │ │
│  └──────────────────┘      │         ▼                ▼            │ │
│                             │  ┌──────────────────────────────┐    │ │
│                             │  │     SAP HANA (results DB)    │    │ │
│                             │  └──────────────────────────────┘    │ │
│                             └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    │                     │                      │
              ┌─────▼─────┐       ┌──────▼──────┐       ┌──────▼──────┐
              │  Anthropic │       │  SAP AI Core│       │    Mock     │
              │  Claude API│       │  (on-prem)  │       │  (dev/test) │
              └───────────┘       └─────────────┘       └─────────────┘
```

## Data Flow

1. **Job trigger** — SAP Job Scheduling Service calls `POST /api/po-analysis/runFullAnalysis` on a daily cron schedule.
2. **PO fetch** — The service reads all open POs from the local HANA replica (populated from S/4HANA via OData or Change Data Capture).
3. **3-way match** — For each PO, the deterministic matcher checks for amount mismatch, quantity mismatch, overdue status, and missing documents. This produces a list of `ConflictType` values.
4. **AI analysis** — Each conflicted PO (and its notes) is sent to the configured LLM provider. The LLM returns a structured JSON object: `{ assessment, confidence, recommendation }`.
5. **Result storage** — Analysis results are persisted to HANA as `AnalysisResults` entities.
6. **Human review** — A procurement analyst reviews flagged items via an OData-backed UI or Fiori app and calls `markReviewed` to close each result.

## Key Design Choices

| Concern | Choice | Rationale |
|---|---|---|
| Trigger | Scheduled job | Predictable load, easier to operate than event streams in early phase |
| Data source | Local HANA replica | Decouples from S/4HANA availability; lower latency |
| Output | Recommend only | Financial data requires human sign-off; no automated write-back |
| Framework | CAP (Node.js) | Built-in OData, CDS schema, BTP-native |
| AI runtime | Pluggable (mock/Claude/AI Core) | Supports local dev, cloud-native, and enterprise air-gap scenarios |

See [ADR.md](ADR.md) for the full decision rationale.
