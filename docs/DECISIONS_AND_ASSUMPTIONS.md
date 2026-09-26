# Decisions, Assumptions & Open Questions

Every open question from the brief is "designed around" rather than blocking. This file records the default, the switch that changes it, and how to confirm it with the owner.

## A. Open questions from the brief

### A1 — Is OEM capacity global or per order?
**Question:** If OEM A can supply 1,000 and 700 is already committed to one order, should the system show only 300 available for another?

**Decision:** Compute **both** and never hide either:
- `firm_committed_here` — committed on this requirement.
- `firm_committed_elsewhere` — the same OEM's firm commitments on other active requirements (excluding lost/cancelled).
- `available_global` — `declared_capacity − firm_committed_elsewhere` when a capacity declaration exists, otherwise reported as **unknown** (not zero).

`app_settings.oem_capacity_mode` (`per_order` default, `global`) picks which is the headline figure. The other is always displayed beside it. Conservative default: the UI always surfaces cross-order consumption as a warning.
**Implemented:** an OEM can declare capacity per part number (`oem_capacity_declarations`). Per-OEM cross-order consumption is computed, and each OEM line shows `available` (declared − committed elsewhere); with no declaration it is reported as **unknown**, never zero. When one OEM's declared capacity is exhausted the chip turns red.
**Confirm by:** one real transaction — does he ever double-book an OEM across two live requirements?

### A2 — Who invoices whom, who pays the OEM, when is commission earned?
**Decision:** Model both flows explicitly with `invoices.invoice_kind` (`customer` | `oem` | `commission`) and `payments.direction` (`customer_to_oem` | `oem_to_us` | `customer_to_us`). Commission is created `blocked` and is released only when the configured milestone payment exists (`app_settings.commission_milestone`, default `oem_paid`).
**Assumption:** treating the OEM as invoicing the end client while the consultant earns commission on the OEM's payment. This is the reading most consistent with workbook 5 ("Track client payments made to OEMs") and the prior spec ("Commission invoice can only be raised after OEM payment milestone").
**Implemented:** a commission links to a specific OEM invoice (`commissions.base_invoice_id`). The milestone is evaluated against **that invoice's** OEM payments (`direction = oem_to_us`), not a global pool. A blocked commission can be re-checked with one click. This corrected the earlier global-pool simplification.
**Confirm by:** one real transaction, then set the milestone in settings.

### A3 — Which documents consume the one week?
**Decision:** Do not guess. `documents.source` records `generated | reused | oem_supplied | manual` with a timestamp per stage. After a few quotes the dashboard will answer it empirically.
**Assumption:** most of the week is OEM-supplied compliance/test certificates plus manual preparation.

### A4 — Loss-reason labels
**Decision:** Seed the 8 given labels (`price`, `technical_non_compliance`, `delivery_timeline`, `competitor_preference`, `quantity_capacity`, `cancelled`, `not_pursued`, `other`) in a **configurable taxonomy table**, so labels can be renamed/extended without code changes. Loss is unrecordable without one.
**Confirm by:** ask him to rename the list to his own words.

### A5 — Which historical Excel columns are trustworthy?
**Decision:** Import is modelled with a per-row/per-column confidence concept. Comparison features (bid intelligence, win/loss analysis) only use rows marked trusted; untrusted historical rows are still visible but explicitly flagged. v1 seeds demo data derived from the templates rather than importing live data, so no untrusted data enters silently.
**Implemented:** `npm run extract:workbooks` exports every sheet to CSV via Excel COM; `npm run import:excel` loads them **dry-run by default** (`--commit` to write, `--trust` to mark trusted). Imported requirements and quotations carry `data_trust` and `import_batch_id`. Untrusted rows are ranked below verified history in bid comparison, and Admin → Import & trust lists them with a "Mark trusted" action. Imported POs are accepted only when they resolve to an existing quotation (no orphan PO). The provided templates contain only sample rows, so the extractor/importer are the deliverable — they run against his live files.
**Confirm by:** walking the Enquiries/Quotation columns and marking which are reliably filled.

## B. Assumptions made for v1

| # | Assumption | If wrong |
|---|---|---|
| B1 | The company name in the templates is Inverbrass; "Supreme Q"/"GAPL"/"IBEL" appear as related entities. Product name kept neutral ("Inverbrass CRM") and company identity is config, not hard-coded. | Rename in `app_settings` / branding constant. |
| B2 | One person is owner and also a user; 4 roles cover the team. | Add roles in `users.role` + `rbac.ts`. |
| B3 | Currency is INR; GST 18% is the default, configurable per line. | Currency/gst rate columns are per-record, not global constants. |
| B4 | Commission is a percentage of OEM invoice value, stored per OEM. | `commission_percent` is per OEM and overridable per commission row. |
| B5 | Attachments are metadata + external reference in v1 (no binary storage). | `documents.file_ref` is a seam for Supabase Storage/S3. |
| B6 | "Government inspection" is a milestone in the fulfilment timeline, not a separate portal integration. | Milestone rows are data; a portal adapter can attach later. |
| B7 | Auto follow-up default is 7 days of no response. | `followup_no_response_days` setting. |
| B8 | A quote line below the margin floor needs owner approval; a submission with uncovered quantity needs an audited override. | Both gated in `pricing.ts` / server actions; overrides recorded in `audit_logs`. |

## C. What was explicitly **not** built (per brief)

- No automatic legal/compliance judgement.
- No automatic final bid price (a *recommended* price is shown, clearly labelled).
- No OEM selected without human approval.
- No accounting/ERP replacement.
- No generic document generator.
- No government-portal automation or auto-messaging.

## D. Questions worth confirming after first use

1. A2 (commission milestone) with a real transaction — highest priority.
2. A1 (global vs per-order capacity) — changes the "available" headline.
3. A5 (trustworthy columns) before importing real history.
4. A4 (loss-reason wording).
5. Bulk paste into the requirement line-item grid is in v1; confirm the owner's real column order.

## E. Enforcement gaps closed after the first review

The brief's "rules that must hold" were initially *displayed* but not all *enforced*. These are now enforced, each with an audited override where a human must be able to proceed:

| Rule | How it is enforced |
|---|---|
| Do not commit to uncovered quantity | Submitting a quotation with any uncovered line is blocked unless "Submit with uncovered quantity" + a reason is recorded; an `override` audit entry is written. Setting: `quote_uncovered_override_required`. |
| No automatic final bid price / margin discipline | Approving below `margin_floor_percent` is blocked unless an override + reason is recorded. The recommended price stays a suggestion. |
| A failed/held PDI blocks dispatch | Recording a delivery that takes the total beyond the PDI-cleared quantity is blocked while a hold exists, unless overridden with a reason. |
| Automatic follow-up tasks | A rule sweep runs on dashboard load and creates idempotent tasks for: no response after N days, OEM responses pending, submission deadlines, invoices due, documents expiring. |
| Commission follows the OEM-payment milestone | Commission is created `blocked`, linked to a specific OEM invoice, and released only when that invoice's OEM payment meets the configured milestone. |
| No orphan PO | Order creation requires an approved quotation; imports never create an order without a resolvable quotation. |
| Untrusted history must not mislead pricing | Imported rows are `untrusted` and rank below verified history in bid comparison until a human promotes them. |

