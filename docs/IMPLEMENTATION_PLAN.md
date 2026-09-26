# Implementation Plan

## 0. Deliverables

1. `docs/PRD.md` — the product requirements (this repo).
2. `docs/TECH_STACK.md` — stack and architecture.
3. `docs/DATA_MODEL.md` — full schema + computed rules.
4. `docs/DECISIONS_AND_ASSUMPTIONS.md` — open questions resolved with defaults.
5. A running Next.js application implementing modules 1–4 in depth plus the shared spine (dashboard, search, Ask, roles, audit, documents, orders/payments core).
6. `npm run seed` demo data derived from the nine templates.
7. Unit tests for the risky logic, plus typecheck/build gates.

## 1. Build order (mirrors the brief; first three first)

| Phase | Work | Status |
|---|---|---|
| P0 | Docs (PRD, stack, data model, decisions) | done |
| P1 | Project scaffold, config, Tailwind, Drizzle + PGlite/Postgres connection, DDL, seed | |
| P2 | Core libs: money, ids, audit, rbac, auth; **coverage**; **pricing**; **bids**; **deductions**; **nlq** | |
| P3 | Auth + app shell + dashboard (morning view) | |
| P4 | **Module 1** Requirements/RFI: list, create (multi-line), detail, timeline, statuses, loss reason | |
| P5 | **Module 2** OEM master + sourcing requests/responses | |
| P6 | **Module 3** Quantity coverage panel + override gate | |
| P7 | **Module 4** Quotation: build from requirement, pricing ladder, versions, approval, comparable bids | |
| P8 | Module 6/7/8: order from approved quote, milestones, PDI, deliveries, invoices, payments, commission | |
| P9 | Documents vault + expiry; follow-up task generator | |
| P10 | Search/history, loss analysis, Ask (plain language), audit viewer, admin (users/settings/taxonomy) | |
| P11 | Tests, typecheck, build, README, boot verification | done |
| P12 | Enforce the brief's rules (margin floor, uncovered-override, PDI dispatch hold, follow-up generator); per-invoice commission; capacity declarations; Excel import with trust flags | done |

## 2. Phase detail

### P1 — Scaffold
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, Tailwind v4, `.env.example`, `.gitignore`.
- `src/db/schema.ts` (Drizzle), `src/db/ddl.sql`, `src/db/index.ts` (PGlite vs `pg` by `DATABASE_URL`), `src/db/seed.ts`.
- `npm run db:reset`, `npm run seed`, `npm run dev`.

### P2 — Domain logic (pure, tested)
- `money.ts` — paise parsing/format, INR.
- `ids.ts` — UUID + ref-number generators (`RFI-YY-YY-NNNN`, `QTN-...`, `ORD-...`).
- `coverage.ts` — the module-3 engine (required / firm / indicated / elsewhere / uncovered / global available).
- `pricing.ts` — margin %, recommended price, rate ladder, margin-floor check.
- `bids.ts` — comparable past bids by part/customer from winning & losing quotes.
- `lifecycle.ts` — requested→…→accepted per order line.
- `deductions.ts` — TDS/LD/GST-on-LD/balance/final balance.
- `nlq.ts` — deterministic intent parser → typed query spec → executed read-only.
- `audit.ts`, `rbac.ts`, `auth.ts`, `password.ts`.

### P3–P10 — UI
Server components for reads; server actions for writes; every write goes through `withAudit()` and an RBAC check. Pages:

```
/login
/(app)/dashboard
/(app)/requirements           list + filter by status/customer
/(app)/requirements/new       multi-line create (up to 500 lines)
/(app)/requirements/[id]      tabs: Overview | Line items | OEM sourcing | Coverage | Quotes | Timeline | Documents
/(app)/oems                   list + approved filter
/(app)/oems/[id]              profile, capabilities, contacts, compliance, past performance
/(app)/quotations             list + status filter
/(app)/quotations/[id]        build/pricing ladder, comps, version history, approve, submit
/(app)/orders                 list + status/risk filter
/(app)/orders/[id]            milestones, PDI, invoices, deliveries, payments, commission, lifecycle balance
/(app)/documents              vault + expiry
/(app)/ask                    plain-language questions with visible basis
/(app)/admin/users | settings | taxonomy | audit
```

### P11 — Quality gates
- `npm run typecheck` (tsc noEmit)
- `npm run test` (vitest: coverage, pricing, deductions, nlq, lifecycle)
- `npm run build`
- Boot check: seed → start → `GET /login` and `GET /dashboard` respond.

## 3. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Real Postgres unavailable on this machine | PGlite (real Postgres in WASM) + `DATABASE_URL` switch to Neon/Supabase. |
| 500 line items breaking forms | Line items submitted as a repeating row model with add/remove and bulk-paste; server action caps at 500 and batches the insert. |
| Commission flow uncertain (A2) | Milestone is data (`app_settings.commission_milestone`) and `commissions.milestone_payment_id`; no assumptions in code. |
| Over-committing quantity | Coverage gate + audited override; firm vs indication enforced at the type level. |
| Fabricated answers in Ask | Deterministic intent → parameterised SQL; unmatched questions say "I don't know how to answer that from stored data" and show the basis used. |
| Audit noise | Audit only material entities/actions (defined in `audit.ts`). |

## 4. Definition of done for v1

- All ten business rules in PRD §1.2 hold and are demonstrable with seeded data.
- Modules 1–4 work end-to-end from the UI.
- Dashboard answers all six morning questions from stored data.
- Ask answers the four sample questions with a visible basis and refuses unknown intents.
- `typecheck`, `test`, `build` pass; the app boots and persists across restart.
