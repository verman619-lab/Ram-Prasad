# Tech Stack & Architecture

## 1. Decision summary

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router), React 19, TypeScript** | Brief suggested Next.js/Vercel/Netlify. One codebase for UI + server actions; easy to deploy. |
| Styling | **Tailwind CSS v4** + a small hand-rolled component set | Fast, no design-system dependency, readable. |
| Validation | **Zod** | One schema for server actions and forms. |
| ORM | **Drizzle ORM** | Typed SQL, thin, supports both PGlite and node-postgres with the same schema. |
| Database (production) | **Postgres** — Supabase or Neon | Brief requirement: data in Postgres, survives refresh. `DATABASE_URL` env switch. |
| Database (local/zero-install) | **PGlite** (`@electric-sql/pglite`) | Real Postgres (WASM) embedded in Node. Lets the app run and be tested on this machine with **no Docker, no separate server**, while using identical SQL/Postgres semantics. Swap to Neon/Supabase by setting `DATABASE_URL`. |
| Auth | **Session cookie + `bcryptjs`**, sessions in Postgres | Roles are simple (4 roles); avoids heavy auth framework while keeping sessions server-side and revocable. |
| Money | **integer paise** internally, formatted INR | Avoids float drift in quotes, payments, deductions. |
| Dates | **ISO date strings** + `date-fns` in UI | Dates are business dates, not timestamps. |
| Tests | **Vitest** | Unit tests for the risky pure logic: coverage, margin/pricing, deductions, NL query. |
| Deploy | Vercel/Netlify (Next.js) + managed Postgres | As briefed. |

## 2. Why PGlite + Postgres rather than a hosted DB only

The machine has **no Docker and no Postgres**, and no cloud DB credentials were supplied. The brief requires Postgres. PGlite gives a real Postgres engine in-process (WASM), so:

- The app runs and persists today with zero infrastructure.
- The schema, SQL and types are Postgres-native — no SQLite dialect translation.
- Moving to Neon/Supabase is **an env change, not a rewrite**: set `DATABASE_URL` and the connection layer uses `node-postgres` instead of PGlite.

Connection selection (`src/db/index.ts`):

```
if (process.env.DATABASE_URL)  ->  drizzle(new Pool({ connectionString }))
else                           ->  drizzle(new PGlite('./.data/inverbrass'))
```

DDL is applied idempotently on first use from `src/db/ddl.sql` (`CREATE TABLE IF NOT EXISTS ...`), so the same code path provisions PGlite and a fresh Neon database.

## 3. Architecture

```
Browser
  │  React Server Components + Server Actions (no separate REST layer for v1)
  ▼
Next.js (App Router)
  ├─ src/app/(auth)/login        cookie session
  ├─ src/app/(app)/dashboard     morning view
  ├─ src/app/(app)/requirements  module 1, 2, 3, 4
  ├─ src/app/(app)/oems          module 2
  ├─ src/app/(app)/quotations    module 4
  ├─ src/app/(app)/orders        modules 6, 7, 8
  ├─ src/app/(app)/documents     module 8
  ├─ src/app/(app)/ask           module 10 (plain language)
  ├─ src/app/(app)/admin         users, settings, taxonomy, audit
  │
  └─ src/lib/*                   pure domain logic (tested)
        coverage.ts              module 3 — the hard part
        pricing.ts               module 4 — margin, recommended price, ladder
        bids.ts                  module 4 — comparable past bids
        lifecycle.ts             quantity balance across the lifecycle
        nlq.ts                   module 10 — deterministic intent → query
        deductions.ts            module 8 — TDS/LD/balance
        audit.ts, rbac.ts, auth.ts
  │
  └─ src/db/*                    Drizzle schema, DDL, connection, seed
  ▼
Postgres (PGlite locally / Neon-Supabase in production)
```

## 4. Conventions

- **Money** stored as `bigint` paise; `formatINR()` at the UI edge.
- **IDs** are app-generated UUIDs (`crypto.randomUUID()`), text columns — portable across PGlite/Postgres, safe offline.
- **Enums** are Postgres `text` + a `CHECK` constraint, mirrored by a TS union, so taxonomy labels can be extended without a migration dance.
- **Audit** is written by a single `withAudit()` helper used by every mutating server action.
- **Errors vs empty vs missing:** server actions return `{ ok, data } | { ok:false, code, message }`; list pages render distinct loading / error / empty states.
- **No automatic judgement:** pricing returns *recommended* values only; OEM approval and quote approval are explicit human actions.

## 5. Environment

```
# .env.local  (all optional for local development)
DATABASE_URL=            # empty -> embedded PGlite; set to Neon/Supabase Postgres for production
PGLITE_DIR=              # optional override of the embedded data directory (./.data/pglite)
```

Sessions are opaque 256-bit random tokens stored server-side in Postgres (no signing secret
required). The embedded PGlite database is **single-process**: use a real Postgres
(`DATABASE_URL`) for production or any multi-process deployment.

## 6. Deliberate omissions (v1)

- No charts library (dashboard uses tiles/tables; charts later).
- No email/WhatsApp sending (follow-ups are tasks, per non-goals).
- No file binary storage in v1: documents store metadata + an external reference/path (`file_ref`), with a storage adapter seam for Supabase Storage/S3 later.
