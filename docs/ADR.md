# Architecture Decision Records

This document captures the key design decisions made for the PO Analysis Agent, the alternatives considered, and the rationale for each choice.

---

## ADR-001: Trigger — Scheduled Job vs. Event-Driven

**Decision:** Use a scheduled daily job (SAP Job Scheduling Service) rather than an event-driven trigger.

**Alternatives considered:**
- SAP Event Mesh consuming S/4HANA business events (e.g., `PurchaseOrderChanged`)
- Webhook from S/4HANA Intelligent Robotic Process Automation

**Rationale:**
Procurement discrepancy resolution is a batch-oriented workflow. Buyers review flagged items in a morning queue, not in real-time. A scheduled job is simpler to operate, easier to monitor, and avoids the need to maintain a persistent event subscription in early iterations. The daily cadence is sufficient for the overdue-detection use case, where time resolution is measured in days.

Event-driven can be adopted later when near-real-time alerting becomes a requirement.

---

## ADR-002: Input — OData from S/4HANA vs. Local Data Replica

**Decision:** Maintain a local HANA replica of PO, GR, and Invoice data, populated from S/4HANA via OData or CDS. The analysis agent reads from the local replica.

**Alternatives considered:**
- Direct OData calls to S/4HANA on every analysis run
- Event-driven replica via SAP Event Mesh + CDC

**Rationale:**
A daily analysis job over thousands of POs would generate significant load on S/4HANA if it used live OData calls. The local replica isolates the agent from S/4HANA availability windows and change freezes. It also enables fast queries with joins across PO, GR, and Invoice without roundtrip latency.

The trade-off is replica lag (up to 24 hours), which is acceptable for a batch procurement workflow.

---

## ADR-003: Output — Recommend Only vs. Write Back to S/4HANA

**Decision:** The agent produces recommendations stored in its own `AnalysisResults` table. It does not write back to S/4HANA.

**Alternatives considered:**
- Automatically blocking invoices in S/4HANA when a high-confidence mismatch is detected
- Creating workflow items in S/4HANA Flexible Workflow

**Rationale:**
Automated write-back to a financial system of record requires a level of confidence and audit trail that is not appropriate for v1 of an AI-assisted tool. An LLM can misinterpret context; the cost of a false positive (blocked invoice, delayed supplier payment) outweighs the efficiency gain.

The human-in-the-loop model — analyst reviews AI recommendations, then acts in S/4HANA — maintains accountability and builds organisational trust in the AI output over time. Write-back can be added once the agent's accuracy has been validated over several months of production use.

---

## ADR-004: Backend Framework — CAP vs. Express / FastAPI

**Decision:** SAP Cloud Application Programming Model (CAP) with Node.js runtime.

**Alternatives considered:**
- Plain Express.js with `@sap/xssec` for BTP auth
- Python FastAPI (better LLM ecosystem, familiar to data scientists)

**Rationale:**
CAP provides OData exposure, CDS schema definition, HANA HDI deployment, and BTP service binding out of the box. These would all need to be hand-wired in Express or FastAPI. Since the primary consumers of the API are SAP Fiori or SAPUI5 frontends (which speak OData natively), CAP eliminates a significant amount of boilerplate.

Python FastAPI is a valid choice if the team is Python-first or if the AI workload becomes the dominant concern. For this project, the integration with SAP systems is the harder problem, making CAP the better fit.

---

## ADR-005: AI Runtime — SAP AI Core vs. Direct LLM API

**Decision:** Support both via a pluggable provider pattern (`AI_PROVIDER` env var). Default to `mock` in development, `claude` or `aicore` in production.

**Trade-offs:**

| | Direct API (Anthropic) | SAP AI Core |
|---|---|---|
| Setup | API key only | Requires AI Core instance, deployment |
| Data residency | Anthropic's infrastructure | Stays within SAP BTP region |
| Model selection | Any Anthropic model | Limited to deployed models |
| Cost model | Pay-per-token | AI Core capacity units + token cost |
| Compliance | Must review DPA with Anthropic | SAP DPA covers BTP services |

**Rationale:**
Enterprise customers with strict data residency or compliance requirements will need AI Core. Startups and portfolio projects can use the Anthropic API directly, which is faster to set up and gives access to the latest models. Supporting both via a factory pattern costs very little and avoids vendor lock-in at the AI layer.

---

## ADR-006: AI Role — Anomaly Detection vs. Report Generation

**Decision:** Use AI for anomaly contextualisation (assessing _why_ a flagged conflict may or may not be a real problem), not for generating summary reports.

**Alternatives considered:**
- Weekly AI-generated narrative report summarising procurement health
- AI as the primary detector (replacing rule-based matching entirely)

**Rationale:**
Rule-based 3-way matching is deterministic, auditable, and fast. An LLM cannot improve on rules for detecting that `invoicedAmount != poAmount`. What LLMs excel at is interpreting unstructured context — specifically, the free-text `notes` field on a PO. A note like _"partial delivery agreed with vendor on 2026-05-12"_ changes the risk profile of an amount mismatch entirely, but rules cannot parse that intent.

The architecture therefore uses AI as a second-pass assessor: rules flag the anomaly, AI reads the notes and provides a confidence score and recommendation. This keeps the detection layer transparent and auditable while adding genuine AI value where rules fall short.
