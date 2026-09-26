# PRD — Defence Contract Consultant CRM

**Product name (working):** Inverbrass CRM
**Owner / primary user:** Ram Prasad — defence contract consultant
**Prepared from:** the requirement brief (`Business owner 1 · Requirement brief`) and the nine manual workbooks in `Template/`
**Status:** v1 build specification

---

## 1. Problem statement

A one-person, relationship-driven defence trading business runs on Excel, email and memory. Roughly:

| Activity | Monthly volume |
|---|---|
| Enquiries (RFIs / tenders) | 25–30 |
| Quotations submitted | ~20 |
| Orders received | ~10 |
| Active orders at any time | 20–25 |

The pain is not lack of data — it is that the data is scattered across nine workbooks, none of which is the single record for a requirement:

- **Quotation prep: 3–4 days** (partly because nothing forces urgency).
- **OEM communication: 1–10 days**, tracked in inboxes and memory.
- **Document creation: ~1 week**.
- **Follow-ups: 3–4 hours/day**, driven by memory and a spreadsheet column.
- **No searchable history**, so every new quote starts from scratch. Win/loss is not analysable.
- **Quantity commitments are dangerous.** Availability indications and firm OEM commitments live in the same cells, so the business can promise a quantity its supplier network has not actually committed.

The central object is the **RFI / tender requirement**. Everything hangs off it: OEM sourcing, the quote, the PO, PDI and inspection, delivery, payment and commission. If one requirement has one record and one timeline, all the other pain becomes tractable.

### 1.1 What the templates tell us (evidence)

The nine workbooks are the de-facto requirements and field dictionary:

| Workbook | Sheet | What it proves |
|---|---|---|
| 1. Enquiries 26-27 | `MASTER ENQ QTNS` | Requirement fields: OEM, customer, location, source (SRM/email), project, ENQ No., ENQ date, due-on, QTN ref, product, product code, manufacturer code, qty, price/ea, line value, quote value, remarks, status. |
| 1. Enquiries 26-27 | `Master POs` | RFI and PO in one sheet, with repeat-order references (`Repeat-4000460454 dt 17-5-24`), IMM (immediate) delivery, per-day pricing (`12,000/per Day`). |
| 2. Quotation 26-27 | `26-27` | The pricing ladder is already versioned by column: **1st rate → 2nd rate → price after PNC (Price Negotiation Committee) → PO price after PNC → total PO value → status**. This is the bid history that must become queryable. |
| 3. Orders 26-27 | `HAL MASTER POs` | Order booking with per-line **partial supply tracking**: `VAL(2) supplied`, `QTY(3) supplied`, `VAL(3) supplied`, `QTY balance`, `VALUE balance`, `PL advance / new date`. Confirms partial delivery is normal and balanced quantities are a first-class concern. |
| 4. Sales 26-27 | `26-27` | Invoice register per customer PO: INV No, INV DT, PO No, PO Date, item, qty, net, GST 18%, gross, remarks (Paid). |
| 5. Payments-26-27 | `Master 22-23-24-25-26-27` | Payment register with **TDS, LD (liquidated damages), GST on LD, total deductions, payment balance, final balance**. Payments arrive in two tranches. |
| 6. Master List of Approvals | `Master APPL` | Compliance authorities: **CEMILAC, LCSO, RCMA**. Certificate no, cert date, valid-till, two validity extensions, items approved, renewal-no/renewal-date. Renewal every 3–5 years. |
| 7. Master List of OEM | `Master OEM` | OEM master: location, address, SPOC, mobile, email, GST no, vendor code, items approved, product code, renewal tracking. |
| 8. Master List of Customers | `Master Customer` | Customer master: HAL, BEL, BEML, DRDO etc., same renewal/approval shape. |
| Inverbrass Odoo Order Management sheet | multi | A prior written spec: 11 modules, master-data inputs, dashboard/KPI list, and the explicit business rules. Strong corroboration. |

### 1.2 Business rules already stated by the owner

These are non-negotiable acceptance criteria:

1. Every quotation originates from an RFI.
2. Every PO maps to an approved quotation. No orphan PO.
3. Many line items per requirement (**up to 500 part numbers**), many invoices per PO, many deliveries per invoice.
4. Partial deliveries and partial payments are normal, with outstanding balances visible.
5. Quantity balance is visible across the whole lifecycle: **requested → quoted → committed → ready → inspected → invoiced → delivered → accepted**.
6. **PDI cleared is distinct from offered and rejected.**
7. Repeat requirements reference history; loss reasons are structured.
8. **OEM firm commitments are distinct from availability indications.**
9. Commission follows an **OEM-payment milestone**.
10. Document expiry is trackable; important activity is audited.

### 1.3 Explicit non-goals

- No automatic legal or compliance judgement.
- No automatic final bid price.
- No OEM selected without human approval.
- Not a full accounting/ERP replacement.
- Not a generic document generator.
- No government-portal automation or auto-messaging as a baseline.

---

## 2. Goals and success metrics

| Goal | Metric | Target for v1 |
|---|---|---|
| One record per requirement | Orphan records (quote without RFI, PO without approved quote) | 0 — enforced by FK + guard |
| Cut quote prep time | Time from "received" to "submitted" | Visible per requirement; used as baseline |
| Stop over-commitment | Requirements submitted with uncovered balance | 0 — blocked unless an explicit override is recorded |
| Make history usable | Comparable past bids shown before pricing | Every quote line shows comps |
| Cut follow-up effort | Auto follow-up tasks open per day | 7-day no-response and document-request tasks generated automatically |
| Answer the morning questions | Dashboard cards | Open orders by state, quotes awaiting response, delivery risk, payments pending, OEM responses pending, documents expiring |
| Grounded plain-language answers | "How many orders?", "What did we win this month?", "Why did we lose?" | Answered from stored data only, with a visible query basis |

---

## 3. Personas and roles

| Role | Wants | Can do |
|---|---|---|
| **Owner / Management** | The whole picture, approvals, margins, audit | Everything; approve quotes/orders/compliance; configure settings |
| **Sales** | Capture RFIs, source OEMs, build and send quotes, follow up | Create/edit requirements, sourcing, quotes, follow-ups; submit for approval |
| **Operations** | Convert orders, track production, PDI, delivery | Update orders, milestones, PDI, deliveries, documents |
| **Finance** | Invoices, payments, commission, deductions | Record invoices, payments, TDS/LD, commission; mark paid |

Sensible default v1 permissions are in `docs/DATA_MODEL.md` §10. Approvals on quotes/orders/documents/compliance are configurable by role.

---

## 4. Scope — modules

Build order is deliberate. Modules **1–3 are the priority** and are built to full depth first; 4 is built next; 5–11 are built on the same spine. Every module below has a schema in `docs/DATA_MODEL.md`; v1 UI depth is called out per module.

### 4.1 Module 1 — Requirement and RFI  *(v1: full)*

**Capture:** customer/agency, product, quantity, required delivery date, technical specifications, tender/enquiry reference, submission deadline, documents.

**Line items:** one requirement carries **many line items (up to 500 part numbers)**, each with its own part number(s), description, quantity, UoM, required delivery date and technical spec. No giant text field.

**Extra fields proven by the templates:** project name, source of enquiry (GeM / client portal / direct / OEM / SRM / email), bid type (single/double), submission type (hard copy / soft / both), GeM tender number, quotation validity requirement, staggered delivery, MOQ, approval requirements (RCMA/CEMILAC/LCSO/MIL), assigned employee, regret-letter date if passed.

**Statuses:** `received → qualifying → quoted → submitted → won / lost / cancelled`.

**Timeline:** every status change, document, sourcing request, quote version and note is an event on one timeline for the requirement.

**Acceptance criteria**
- A requirement cannot be created without a customer; a requirement with more than one line item is the norm, and 500 line items is supported without a redesign.
- `submitted` requires at least one approved quotation (module 4 guard).
- Transitioning to `lost` requires a structured loss reason.
- Requirement ref numbers are auto-generated and unique.
- Every created/updated/status-changed record writes an audit entry.

### 4.2 Module 2 — OEM master and sourcing  *(v1: full)*

**OEM record:** products supplied, capabilities, prices, typical lead time, compliance documents, contacts, past performance, approved status (approved or not).

**Sourcing from a requirement:** shortlist capable OEMs, then record each **request** (RFQ or availability check) and each **response**.

**Response types are first-class:**
- `firm_commitment` — the OEM has committed these units. Counts toward coverage.
- `quote_indication` — a priced indication, not a commitment. Does **not** count toward coverage.
- `availability` — "we could make this". Does **not** count toward coverage.

**Acceptance criteria**
- An OEM is never attached to an order without a recorded human approval (owner/management, or a designated approver).
- Past performance is derivable: on-time %, PDI pass rate, rejection rate per OEM.
- Compliance certificates per OEM are tracked with expiry and renewal.

### 4.3 Module 3 — Quantity coverage  *(v1: full — the hard part)*

**Requirement:** show required vs OEM committed, with uncovered balance.
`1,000 needed = OEM A 600 + OEM B 400 → coverage 1,000, uncovered 0.`

- Several OEMs and several shipments may cover one requirement.
- **Firm commitment ≠ availability/quote indication.** Only firm commitments count toward coverage.
- The team must not be able to confidently commit to a quantity the OEMs have not covered.

**Coverage states per line item:** `uncovered` (0 firm), `partial` (0 < firm < required), `covered` (firm ≥ required).

**Open question baked in as a switch:** is OEM capacity **global** or **per order**? If OEM A can supply 1,000 and 700 is already committed to another requirement, does a new requirement see 1,000 or 300? v1 computes **both**: `firm_committed_here`, `firm_committed_elsewhere` (excluding lost/cancelled), and `available_global = declared_capacity − firm_committed_elsewhere`. A setting `oem_capacity_mode` (`per_order` default, `global`) controls which figure is surfaced as the primary number and which warnings fire. Default behaviour is conservative: the UI always shows capacity consumed elsewhere.

**Acceptance criteria**
- Coverage is computed live from firm commitments and never stored as an unverified total.
- Submitting a quote with uncovered quantity requires an explicit, audited override with a reason.
- `quoted`, `committed`, `ready`, `inspected`, `invoiced`, `delivered`, `accepted` quantities are each visible per line.

### 4.4 Module 4 — Quotation and bid intelligence  *(v1: full)*

**Build a quote from the requirement:** OEM price, lead time, target margin, recommended price. Recommended price is a **suggestion, never auto-final** (non-goal).

**Pricing ladder mirrors the workbook:** first rate → second rate → price after PNC → PO price after PNC.

**Before pricing, show comparable past bids:** what was quoted, won/lost, and the winning or losing price. He changes the bid from that history.

**Versioning and approval:** each revision is a new immutable version linked to its parent; approval is recorded with approver, time and comments.

**Post-submission states:** submitted, clarification requested, technical clarification, commercial negotiation, awaiting approval, won, lost, cancelled.

**Acceptance criteria**
- A quotation cannot exist without a requirement (`requirement_id` NOT NULL).
- A quote line cannot be finalised below a configured margin floor without an audited approval.
- Comparable bids are shown for the same part number/customer from prior requirements, before the price is entered.
- Approving a quote is an auditable event; superseded versions are retained.

### 4.5 Module 5 — Government response and follow-up  *(v1: core)*

- Post-submission response states as above, with the date of each state.
- **Automatic follow-up tasks**, e.g. no response for 7 days, or a requested document not yet supplied. Tasks have an owner and due date and appear on the dashboard.
- Manual follow-ups are also logged against the requirement timeline.

### 4.6 Module 6 — Order and PO  *(v1: core)*

- Convert an **approved** quote to an order; the whole history travels with it.
- **No orphan PO:** every PO maps to an approved quotation (enforced).
- Track PO number/date, product, quantity, price, delivery deadline, selected OEM, supplier PO, compliance/inspection/PDI requirements.
- **One PO can have many invoices.**
- PO amendments are tracked (old value, new value, who, when).

### 4.7 Module 7 — Fulfilment, PDI and delivery  *(v1: core)*

- **Timeline:** OEM PO placed → production started → production done → PDI scheduled → PDI passed → government inspection → dispatch → delivered → accepted. Each step has an owner and an expected date.
- **PDI is quantified:** quantity offered, cleared, rejected. A failed/held PDI blocks dispatch (`dispatch_clearance = hold`).
- **Partial deliveries** supported, outstanding balance visible.
- **Delivery risk flagged early:** expected completion vs committed deadline, so he knows before the customer asks.
- **Material-readiness** fields (in production / ready, internal QC, batch, serials, tentative PDI date) captured for critical/delayed dispatches.

### 4.8 Module 8 — Payments, commission and documents  *(v1: core)*

- Partial payments, due dates and reminders. One invoice can be fulfilled by several delivery events.
- Payment ledger includes **TDS, LD, GST on LD, total deductions, balance, final balance** (from workbook 5).
- **Commission is earned on an OEM-payment milestone** (configurable event: OEM paid / part-paid). Commission invoice is blocked until the milestone is met.
- **Document and compliance vault:** type, supplier, issue date, expiry date, linked product and requirement, with expiry reminders. Approved item lists renew every 3–5 years.
- v1 covers each of these to the extent of: register, link, compute balance, expiry reminder, milestone gate. Not a document generator.

### 4.9 Module 9 — Search, history and losses  *(v1: core)*

- **Search all history** for a comparable requirement: past OEM, price, delivery time, margin, documents, problems.
- **Structured loss reasons:** `price`, `technical_non_compliance`, `delivery_timeline`, `competitor_preference`, `quantity_capacity`, `cancelled`, `not_pursued`, `other`. Labels are a starting point and are configurable (see open questions).
- Loss analysis answers: "what did we lose?", "why did we lose them?" by reason and by customer.

### 4.10 Module 10 — Dashboard and plain questions  *(v1: core)*

The morning view answers, on one screen:
- How many orders are open and what state each is in.
- Quotes awaiting a response.
- Orders at delivery risk.
- Payments pending.
- OEM responses pending.
- Documents expiring.

**Plain-language questions** answered **from stored data, never invented**:
> "how many orders are there?", "how many contracts did we win this month?", "what did we lose?", "why did we lose them?"

v1 uses a deterministic intent parser (not an LLM) that maps a question to a parameterised, read-only query over the database, and **shows the basis** ("matched intent: count orders where status ≠ completed/cancelled; period: this month"). If no intent matches, it says so rather than guessing.

### 4.11 Module 11 — Roles, approvals and audit  *(v1: core)*

- Roles: owner/management, sales, operations, finance.
- Approvals on quotes, documents, orders and compliance items.
- **Audit trail** of material changes: what, who, when (before/after where meaningful).

---

## 5. Key user journeys

**J1 — RFI to submitted quote**
1. Sales captures a requirement from GeM/portal/direct with 1..500 line items and the submission deadline.
2. System creates the requirement record, timeline and an initial follow-up for the deadline.
3. Sales shortlists capable OEMs; the system records requests.
4. OEMs respond; sales tags each response as availability, quote indication or **firm commitment**.
5. Coverage panel shows required vs committed vs uncovered per line.
6. Sales builds a quote; the pricing screen shows comparable past bids for the part and customer.
7. Quote is versioned, approved (owner), then submitted. Post-submission states are tracked.
8. If any line is uncovered, submission requires an audited override.

**J2 — Won quote to delivered order**
1. Mark the quote `won`; convert to order. The PO must reference the approved quote.
2. Record customer PO number/date, select the approved OEM, raise the supplier PO.
3. Drive the fulfilment timeline; schedule PDI; record offered/cleared/rejected; a hold blocks dispatch.
4. Record partial deliveries and the outstanding balance; flag delivery risk vs deadline.
5. Raise invoices (many per PO) and record customer and OEM payments.
6. Commission invoice becomes available only when the OEM-payment milestone is met.

**J3 — Loss analysis**
1. Mark a requirement `lost`; the structured loss reason is mandatory.
2. Dashboard and Ask surfaces let him see what was lost and why, by reason, customer and month.

**J4 — The morning review**
1. Open dashboard. Read the six cards.
2. Click any card to the underlying filtered list.
3. Ask "how many orders are there?" and get a grounded count with its basis shown.

---

## 6. Data model summary

Full detail in `docs/DATA_MODEL.md`. Headline relationships:

```
customer ─┬─< requirement ─< requirement_item
          │        │
          │        ├─< oem_request ─< oem_response ── (availability | quote | firm_commitment)
          │        ├─< quotation ─< quotation_item   (versioned, parent_quote_id)
          │        └─< timeline_event / follow_up_task / document
          │
          └─< order ─┬─< order_item
                     ├─< fulfilment_milestone
                     ├─< pdi_record
                     ├─< invoice ─┬─< delivery
                     │            └─< payment
                     └─< commission (gated on OEM payment milestone)

oem ─┬─< oem_contact
     ├─< oem_capability
     ├─< oem_response / order / payment
     └─< compliance_certificate / document

audit_log  (actor, action, entity, before/after, at)
app_setting (key, value)   e.g. oem_capacity_mode, margin_floor_percent
```

Cardinalities enforced:
- requirement → items: 1..500
- quotation → requirement: many-to-1 (NOT NULL requirement)
- order → quotation: many-to-1 (NOT NULL, must be `approved`)
- order → invoice: 1..many
- invoice → delivery: 1..many
- invoice → payment: 1..many (partial payments normal)
- requirement item → OEM committed quantity: many-to-many with explicit commitment type

---

## 7. Non-functional requirements

- **Durability:** data persists in Postgres; a refresh never loses state.
- **Honest UI:** distinguish **missing**, **failed** and **empty** — never show an error as "no data".
- **Audit:** material changes are recorded and viewable.
- **Grounding:** every number shown traces to rows in the database; the Ask feature never fabricates.
- **Human approval:** no OEM selection, no final price, no legal/compliance judgement is automatic.
- **Scale:** 30 requirements/month is trivial; the 500-line-items and multi-year history requirements are the real tests. Indexes on part number, customer, requirement, status, dates.
- **Security:** role-based access; secrets in env; no secrets in the repo.

---

## 8. Out of scope for v1 (explicitly)

- Government-portal automation and auto-messaging.
- Automated legal/compliance rulings.
- Automated final bid pricing or OEM selection.
- Full accounting/ERP, payroll, statutory filing.
- Generic document templating/merging (records are captured and linked; generation is later).

---

## 9. Open questions (designed around, defaults documented)

These are the owner's open questions. v1 does not block on them: each has a conservative default plus a config switch, recorded in `docs/DECISIONS_AND_ASSUMPTIONS.md`.

1. **Global vs per-order OEM capacity** → both computed; `oem_capacity_mode` default `per_order`, with global consumption always displayed.
2. **Who invoices whom; when is commission earned** → commission gated on a configurable OEM-payment milestone; a UI flag captures the real transaction once confirmed.
3. **Which documents consume the one week** → document vault records a `source` (generated / reused / OEM-supplied / manual) so the answer is measured, not guessed.
4. **Loss-reason labels** → seeded with the 8 given labels; stored in a configurable taxonomy table.
5. **Which historical Excel columns are trustworthy** → an import path with a per-column confidence flag; comparison features only use trusted columns, and untrusted historical rows are visibly marked.
