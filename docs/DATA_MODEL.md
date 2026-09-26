# Data Model

Postgres. Money is `bigint` **paise**. IDs are text UUIDs generated in the app. Enums are `text` + `CHECK`, mirrored as TS unions. All tables have `created_at`; mutable ones also `created_by`, `updated_at`, `updated_by`.

## 1. Identity & access

### `users`
`id, email (unique), name, role (owner|management|sales|operations|finance), password_hash, active, created_at`

### `sessions`
`id (token), user_id → users, expires_at, created_at, user_agent`

### `app_settings`
`key (pk), value (text), updated_at, updated_by`
Seeded keys: `oem_capacity_mode` = `per_order|global`, `margin_floor_percent`, `quote_uncovered_override_required` = `true`, `commission_milestone` = `oem_paid|oem_part_paid`, `followup_no_response_days` = `7`.

### `taxonomies`
`id, kind (loss_reason|document_type|source|approval_authority|...), code, label, sort, active`
Configurable labels (loss reasons, document types) live here rather than in hard-coded enums where the owner may rename them.

---

## 2. Module 1 — Requirement / RFI

### `customers`
`id, name, division, sub_division, location, address, billing_address, delivery_address, spoc, phone, email, gst_no, gem_registration, vendor_registration_no, payment_terms, approval_requirements, portal_login_ref, notes, created_at, updated_at`

### `requirements`  *(the central record)*
| Column | Notes |
|---|---|
| `id`, `ref_no` unique | auto-generated e.g. `RFI-26-27-0007` |
| `customer_id → customers` NOT NULL | |
| `project_name` | |
| `source` | gem, client_portal, direct, oem, srm, email |
| `bid_type` | single, double |
| `submission_type` | hard, soft, both |
| `gem_tender_no` | |
| `enquiry_no`, `enquiry_date` | |
| `submission_deadline` | drives follow-up + risk |
| `required_delivery_date` | |
| `quotation_validity` | |
| `staggered_delivery` bool, `moq_notes` | |
| `approval_requirements` | RCMA / CEMILAC / LCSO / MIL etc (free list) |
| `assigned_user_id → users` | owner of the requirement |
| `status` | received, qualifying, quoted, submitted, won, lost, cancelled |
| `loss_reason` | price, technical_non_compliance, delivery_timeline, competitor_preference, quantity_capacity, cancelled, not_pursued, other |
| `loss_notes`, `competitor_details`, `regret_letter_date` | |
| `title`, `remarks` | |
| audit columns | |

### `requirement_items`
`id, requirement_id → requirements ON DELETE CASCADE, line_no, part_number, client_part_number, oem_part_number, description, quantity numeric(14,3), uom, required_delivery_date, technical_specs, target_price_paise, remarks`
Unique `(requirement_id, line_no)`. Up to 500 lines per requirement.

### `timeline_events`
`id, requirement_id → requirements, order_id nullable, event_type, summary, detail json, actor_user_id, happened_at, created_at`
One timeline for the requirement; carries over to the order (same events are shown on the order with the requirement's history).

---

## 3. Module 2 — OEM master & sourcing

### `oems`
`id, name, location, address, country_of_origin, spoc, phone, email, gst_no, vendor_code, product_portfolio, brand_category, moq_rules, lead_time_days, pricing_validity, freight_terms, warranty_terms, payment_terms, commission_percent numeric(5,2), nda_status, bank_details, capacity_note, approved bool, approval_notes, notes, audit columns`

### `oem_contacts`
`id, oem_id → oems, name, role, phone, email, is_primary`

### `oem_capabilities`
`id, oem_id → oems, product_category, description, part_number_pattern`
Powers "shortlist OEMs who can make it".

### `oem_requests`
`id, requirement_id → requirements, oem_id → oems, request_type (rfq|availability), requested_at, requested_by → users, status (pending|responded|declined|no_response), channel, notes`

### `oem_responses`
| Column | Notes |
|---|---|
| `id, oem_request_id → oem_requests` | |
| `requirement_item_id → requirement_items` | line-level |
| `response_type` | **`availability` \| `quote_indication` \| `firm_commitment`** |
| `quantity numeric(14,3)` | |
| `unit_price_paise`, `currency` | |
| `lead_time_days` | |
| `valid_until`, `documents_note`, `remarks` | |
| `responded_at`, `created_by` | |

Only `firm_commitment` rows feed coverage. Availability and quote indications are retained for history and shown separately.

### `compliance_certificates`
`id, oem_id, customer_id nullable, authority (CEMILAC|LCSO|RCMA|DGQA|MIL|other), certificate_no, cert_date, valid_till, extended_till_1, extended_till_2, items_approved, product_code, apply_for_renewal_date, renewal_no, renewal_date, renewal_valid_till, status (valid|expiring|expired|pending_renewal), document_id nullable, remarks`

---

## 4. Module 3 — Quantity coverage

Coverage is **computed**, not stored, by `src/lib/coverage.ts`:

```
for each requirement item:
  required            = requirement_items.quantity
  firm_committed_here = Σ oem_responses.quantity  where response_type = 'firm_commitment'
  indicated_here      = Σ oem_responses.quantity  where response_type in ('availability','quote_indication')
  firm_committed_elsewhere = Σ firm commitments for the same part_number on OTHER active requirements,
                             optionally grouped by oem (global-capacity question)
  covered             = firm_committed_here
  uncovered           = max(required - covered, 0)
  coverage_ratio      = covered / required
  state               = uncovered == 0 ? covered : (covered > 0 ? partial : uncovered)
  available_global(oem) = oem.capacity_note/declared_capacity − firm_committed_elsewhere(oem)
```

`oem_capacity_mode` decides whether `available_global` or `required − committed_here` is surfaced as the primary "available" figure; the other is always shown alongside so nothing is hidden.

### `oem_capacity_declarations` (optional per OEM/part)
`id, oem_id, part_number, declared_capacity numeric(14,3), period_note, declared_at`
Enables the global-capacity answer. If absent, `available_global` is reported as *unknown*, never as zero.

---

## 5. Module 4 — Quotation & bid intelligence

### `quotations`
`id, quote_no unique, requirement_id → requirements NOT NULL, customer_id, primary_oem_id nullable, version int, parent_quote_id nullable, status, currency, freight_paise, taxes_note, delivery_terms, payment_terms, validity_date, subtotal_paise, discount_paise, pnc_status, technical_compliance bool, commercial_compliance bool, target_margin_percent, margin_percent, recommended_price_paise, total_paise, submitted_at, approved_by, approved_at, remarks, audit columns`

`status`: `draft, pending_approval, approved, sent, submitted, clarification_requested, technical_clarification, commercial_negotiation, awaiting_approval, won, lost, cancelled, superseded`.

### `quotation_items`
`id, quotation_id → quotations ON DELETE CASCADE, requirement_item_id → requirement_items, line_no, part_number, description, quantity, oem_unit_price_paise, first_rate_paise, second_rate_paise, unit_price_paise, line_total_paise, lead_time_days, margin_percent, remarks`
The rate ladder is explicit and versioned by the parent quotation's `version`.

### `approvals`
`id, entity_type (quotation|order|document|compliance), entity_id, requested_by, approver_id, status (pending|approved|rejected), comments, decided_at, created_at`
Check constraint: no quotation may move to `approved` without an `approvals` row with `status='approved'` (enforced in the server action + a DB trigger for defence in depth).

---

## 6. Module 6 — Order & PO

### `orders`
`id, order_no unique, po_number, po_date, quotation_id → quotations NOT NULL, customer_id, oem_id, supplier_po_number, supplier_po_date, po_value_paise, currency, taxes_note, delivery_deadline, partial_delivery_allowed bool, pdi_required bool, pdi_mode (physical|vc|third_party), pdi_inspector, documentation_required, special_conditions, warranty_terms, payment_terms, status (open|processing|completed|cancelled), remarks, audit columns`

Guard: `quotation_id` must reference a quotation with `status='approved'`.

### `order_items`
`id, order_id → orders ON DELETE CASCADE, quotation_item_id → quotation_items, line_no, part_number, description, quantity, unit_price_paise, line_total_paise`
Lifecycle quantities are computed (see §11).

### `order_amendments`
`id, order_id, field, old_value, new_value, reason, amended_by, amended_at`

---

## 7. Module 7 — Fulfilment, PDI, delivery

### `fulfilment_milestones`
`id, order_id → orders, order_item_id nullable, step (oem_po_placed|production_started|production_done|pdi_scheduled|pdi_passed|govt_inspection|dispatched|delivered|accepted), owner_user_id, expected_date, actual_date, status (pending|done|at_risk|missed), remarks`

### `pdi_records`
`id, order_id, order_item_id, inspection_type (physical|vc|third_party), agency, inspector, scheduled_date, quantity_offered numeric, quantity_cleared numeric, quantity_rejected numeric, rejection_reason, re_pdi_required bool, status (pending|passed|failed), dispatch_clearance (approved|hold), test_certificate_document_id, remarks`
`quantity_offered = quantity_cleared + quantity_rejected` is shown and warned on, never silently corrected.
**Invariant:** `dispatch_clearance='approved'` cannot be set while `quantity_rejected > 0` unless an owner override is recorded.

### `invoices`
`id, order_id → orders, invoice_no, invoice_date, invoice_kind (customer|commission|oem), party_type (customer|oem), party_id, linked_pdi_id nullable, quantity, full_or_partial, balance_quantity, net_paise, gst_paise, gross_paise, dispatch_date, lr_awb, courier, eway_bill, payment_due_date, status (raised|submitted|approved|paid), document_id, remarks`
Multiple invoices per PO.

### `deliveries`
`id, order_id, invoice_id nullable, delivery_date, location, quantity_delivered numeric, status (in_transit|delivered), acceptance_status (pending|accepted|rejected), grn_no, pending_balance_qty numeric, pod_document_id, closure_status (open|closed), remarks`
Multiple deliveries per invoice; pending balance visible.

---

## 8. Module 8 — Payments & commission

### `payments`
`id, invoice_id → invoices, direction (customer_to_oem|oem_to_us|customer_to_us|other), customer_id, oem_id, amount_paise, paid_date, mode, utr, tds_paise, ld_paise, gst_on_ld_paise, total_deduction_paise, balance_paise, final_balance_paise, outstanding_after_paise, status (pending|partial|completed), follow_up_status (pending|escalated), remarks, created_by`
Supports partial payments and the workbook-5 deduction columns. `overdue_days` is computed against `invoices.payment_due_date`.

### `commissions`
`id, order_id, oem_id, milestone ('oem_paid'|'oem_part_paid'), milestone_payment_id → payments nullable, commission_percent, base_invoice_amount_paise, commission_amount_paise, gst_paise, gross_paise, invoice_no, invoice_date, due_date, payment_status (blocked|due|paid), received_date, tds_deducted bool, outstanding_paise, remarks`
**Gate:** a commission cannot move out of `blocked` until the linked OEM payment milestone is satisfied.

---

## 9. Module 8/9 — Documents, tasks, audit

### `documents`
`id, doc_type (enum/taxonomy), title, source (generated|reused|oem_supplied|manual), supplier_oem_id nullable, customer_id nullable, issue_date, expiry_date nullable, linked_product_id, linked_requirement_id, linked_order_id, file_ref, approval_status (none|pending|approved|rejected), version, remarks, created_by, created_at, updated_at`
`expiry_status` is computed: `none | valid | expiring_soon | expired`.

### `follow_up_tasks`
`id, requirement_id nullable, order_id nullable, quotation_id nullable, type (no_response|document_requested|deadline|payment|document_expiry|pdi|custom), title, due_at, assigned_user_id, status (open|done|cancelled), auto bool, notes, created_at, completed_at`
Auto-generated by rules: no response for 7 days, deadline approaching, invoice due, document expiring.

### `audit_logs`
`id, actor_user_id, action (create|update|delete|status_change|approve|override|login), entity_type, entity_id, before json, after json, summary, created_at`
Append-only.

---

## 10. Permissions (default)

| Action | owner/mgmt | sales | operations | finance |
|---|---|---|---|---|
| Manage users/settings | ✔ | | | |
| Create/edit requirement, sourcing | ✔ | ✔ | | |
| Submit quote | ✔ | ✔ | | |
| Approve quote | ✔ | | | |
| Convert approved quote → order | ✔ | ✔ | ✔ | |
| Set OEM selection on order | ✔ (approve) | propose | | |
| Update milestones, PDI, delivery | ✔ | | ✔ | |
| Record invoices, payments, commission | ✔ | | | ✔ |
| View everything | ✔ | own + customer | orders | finance |

Approval authority (who may approve what) is configurable in `app_settings`.

## 11. Lifecycle quantity balance (computed per order item)

```
requested  = order_items.quantity
quoted     = quotation_items.quantity (origin)
committed  = Σ firm oem_responses on the requirement line
ready      = Σ pdi/readiness quantities marked ready
inspected  = Σ pdi_records.quantity_offered      (offered)
cleared    = Σ pdi_records.quantity_cleared      (distinct from offered/rejected)
rejected   = Σ pdi_records.quantity_rejected
invoiced   = Σ invoices.quantity
delivered  = Σ deliveries.quantity_delivered (status delivered)
accepted   = Σ deliveries.quantity_delivered where acceptance_status = accepted
balance    = requested − accepted
```
All shown per line on the order, matching the workbook's `QTY BAL / VALUE BAL` intent but across the full lifecycle.

## 12. Indexes

`requirements(customer_id, status, submission_deadline)`, `requirement_items(part_number)`, `requirement_items(requirement_id, line_no)`, `oem_responses(requirement_item_id, response_type)`, `quotations(requirement_id, version)`, `quotations(status)`, `orders(status, delivery_deadline)`, `invoices(order_id)`, `invoices(payment_due_date, status)`, `payments(invoice_id)`, `documents(expiry_date)`, `follow_up_tasks(status, due_at)`, `audit_logs(entity_type, entity_id, created_at)`, full-text-ish: `to_tsvector` index on `requirements(title, remarks)` and `requirement_items(description)` for history search.

## 13. Additions after the first review

### Import trust
- `requirements.data_trust`, `requirements.import_batch_id`
- `quotations.data_trust`, `quotations.import_batch_id`
- `import_batches(id, source_file, sheet, kind, row_count, committed, notes, created_by, created_at)`

`data_trust` is `untrusted | trusted | verified` (nullable = trusted for manually created rows). Bid comparison penalises `untrusted` rows; Admin → Import & trust can promote them. These columns are added idempotently via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so an existing database migrates on next boot.

### Commission basis
- `commissions.base_invoice_id → invoices(id)`

Commission is earned per OEM invoice: the milestone is evaluated against that invoice's `oem_to_us` payments, not a global payment pool.

### Overrides
Every override (uncovered submission, below-floor margin, dispatch hold) is recorded as an `audit_logs` row with `action = 'override'`, the actor, the values, and a required reason. No override is silent.

