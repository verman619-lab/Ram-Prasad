# Inverbrass CRM

A CRM for a defence contract consultant. One requirement, one record, one timeline.

Built from the requirement brief and the nine manual workbooks in `Template/`. The PRD, stack,
data model and decisions are in `docs/`.

## What it does

1. **Requirements / RFI** — the central record. Multi-line (up to 500 part numbers), statuses
   `received → qualifying → quoted → submitted → won/lost/cancelled`, one timeline.
2. **OEM master & sourcing** — approved or not, capabilities, lead times, commission, compliance,
   contacts, past performance. Requests and responses recorded per requirement.
3. **Quantity coverage (the hard part)** — required vs firm-committed vs uncovered, per line, with
   availability kept distinct from a firm commitment. Per-order and global capacity modes.
4. **Quotation & bid intelligence** — build from a requirement, rate ladder (1st → 2nd → PNC → PO),
   target margin and recommended price, versioning, approval, and comparable past bids before pricing.
5. **Government response & follow-up** — post-submission states and automatic follow-up tasks.
6. **Order & PO** — convert an approved quote; no orphan PO; many invoices per PO; amendments.
7. **Fulfilment, PDI & delivery** — milestone timeline, quantified PDI (offered/cleared/rejected)
   with a dispatch hold, partial deliveries, delivery risk.
8. **Payments, commission & documents** — partial payments with TDS/LD, commission gated on the
   OEM-payment milestone, document vault with expiry reminders.
9. **Search, history & losses** — structured loss reasons, comparable history.
10. **Dashboard & plain questions** — the morning view and grounded Q&A (no invented answers).
11. **Roles, approvals & audit** — owner/management/sales/operations/finance; audit trail.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM ·
**PGlite** (embedded Postgres) locally / **Neon or Supabase** in production · bcrypt sessions.

## Run it

```bash
npm install
cp .env.example .env.local     # optional; DATABASE_URL can stay empty for embedded Postgres
npm run seed                   # load demo data derived from the templates
npm run dev                    # http://localhost:3000
```

Sign in with `ram@inverbrass.example` / `inverbrass` (owner).
Other demo accounts: `sales@`, `ops@`, `finance@`, `management@inverbrass.example` — same password.

### Using Neon / Supabase

Set `DATABASE_URL` in `.env.local` to your Postgres connection string and restart. The same
idempotent DDL runs on first connection. Left empty, the app uses an embedded Postgres persisted
in `./.data/pglite`.

> Embedded PGlite is **single-process**. Run `npm run seed` (or `db:reset`) only while the app is
> stopped, and use a real `DATABASE_URL` for production or any multi-process deployment.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run seed` | Wipe and load demo data |
| `npm run db:reset` | Wipe all data |
| `npm run extract:workbooks` | Export every sheet in `Template/` to CSV (Excel COM; owner's Windows machine) |
| `npm run import:excel` | Import CSVs — **dry run** by default; add `-- --commit` to write, `-- --commit --trust` to mark imported rows trusted |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (coverage, pricing, deductions, lifecycle, bids trust, NLQ) |

## Importing the manual workbooks

The nine workbooks in `Template/` hold the owner's real column structures. Import is a two-step,
review-first pipeline that never silently pollutes pricing:

```bash
npm run extract:workbooks                       # Excel -> import/csv/*.csv
npm run import:excel                            # dry run: prints exactly what would be created
npm run import:excel -- --commit                # write, marking rows untrusted
```

Imported requirements and quotations carry a `data_trust` marker. **Untrusted rows are ranked below
verified history in bid comparison** and listed under Admin → Import & trust, where each can be
promoted to trusted. Imported POs are only accepted when they resolve to an existing quotation — the
no-orphan-PO rule is not bypassed for history. The CSV produced from the provided templates holds
only sample rows, so the extractor is what matters: run it against the owner's live files.

## Rules enforced by the system

These are enforced in code, not merely displayed:

- Every quotation comes from an RFI (`requirement_id` NOT NULL).
- Every PO maps to an **approved** quotation; conversion is refused otherwise.
- Submitting a requirement requires at least one approved quotation.
- Only firm commitments count as coverage; availability and quote indications never close a balance.
- **Submitting with uncovered quantity requires an audited override** (setting-controlled).
- **Approving a quote below the margin floor requires an audited override** (setting-controlled).
- **A held/failed PDI blocks dispatch beyond the cleared quantity** unless overridden and audited.
- **Automatic follow-up tasks** are generated on the dashboard sweep: no response for N days, OEM
  responses pending, submission deadlines, invoices due, documents expiring.
- Commission is created **blocked** and released only on the configured **per-invoice**
  OEM-payment milestone; a "Re-check" action re-evaluates it.
- Marking a requirement lost requires a structured loss reason.
- Material changes are written to the audit trail, including every override.

## Deploying (Vercel + hosted Postgres)

1. In Vercel → Project → **Settings → Build & Development Settings**, set **Framework Preset = Next.js**
   and leave **Output Directory** empty (the default). A `vercel.json` pinning `"framework": "nextjs"`
   is included, but an explicit *Other*/`public` output setting in the dashboard overrides it.
2. Add the environment variable **`DATABASE_URL`** (Neon or Supabase connection string, with
   `?sslmode=require`) for Production, Preview and Development.
3. Redeploy. Tables are created automatically on first request.
4. Seed or sync data against the hosted database from this machine:
   ```bash
   # .env.local
   DATABASE_URL=postgresql://...?sslmode=require
   ```
   then `npm run db:reset` / `npm run seed` / `npm run import:excel -- --commit`.

> Do **not** run `npm run seed` on a public deployment: it creates demo users whose password is in
> this repository. On the hosted database, create real users via Admin → Users & roles.

## Project layout

```
docs/                 PRD, tech stack, data model, decisions, implementation plan
src/app/              routes (dashboard, requirements, oems, quotations, orders, documents, ask, admin)
src/app/actions/      server actions (the only write path)
src/lib/              domain logic (coverage, pricing, bids, lifecycle, deductions, nlq, audit, rbac)
src/db/               schema, DDL, connection (PGlite/Postgres), seed, reset
Template/             the original manual workbooks (source material)
```

See `docs/DECISIONS_AND_ASSUMPTIONS.md` for the open questions and the defaults chosen, and how to
confirm each with the owner.
