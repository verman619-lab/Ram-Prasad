import path from "node:path";
import fs from "node:fs";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { DDL } from "./ddl";

/**
 * A single database handle.
 *
 * If DATABASE_URL is set (Neon/Supabase/any Postgres) we use node-postgres.
 * Otherwise we run a real Postgres engine embedded in-process via PGlite,
 * persisted to ./.data/pglite (local development only — serverless platforms
 * have no persistent filesystem, so always set DATABASE_URL in production).
 *
 * PGlite is imported lazily so it is never loaded on serverless runtimes.
 */
export type DB = PgliteDatabase<typeof schema>;

interface GlobalState {
  ready?: Promise<DB>;
  close?: () => Promise<void>;
}

const g = globalThis as unknown as { __inverbrassDb?: GlobalState };
if (!g.__inverbrassDb) g.__inverbrassDb = {};

const PGLITE_DIR = process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");

/** Serialise DDL across concurrent cold starts (serverless) with an advisory lock. */
async function applyDdlPostgres(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(918273645)");
    await client.query(DDL);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const pool = new Pool({
      connectionString: url,
      max: 5,
      ssl:
        url.includes("sslmode=require") || url.includes("neon.tech") || url.includes("supabase")
          ? { rejectUnauthorized: false }
          : undefined,
    });
    await applyDdlPostgres(pool);
    g.__inverbrassDb!.close = async () => {
      await pool.end();
    };
    return drizzlePg(pool, { schema }) as unknown as DB;
  }

  // Serverless platforms have no persistent filesystem, so the embedded
  // database cannot be used there. Fail with an actionable message instead of
  // a generic 500.
  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL is not set for this environment. The embedded database cannot run on Vercel. " +
        "Add DATABASE_URL (Neon or Supabase Postgres, e.g. postgresql://user:pass@host/db?sslmode=require) " +
        "in Vercel Project Settings -> Environment Variables for Production, Preview and Development, then redeploy.",
    );
  }

  // Embedded Postgres for local development. Dynamic import keeps the WASM
  // engine out of serverless bundles.
  const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);
  fs.mkdirSync(path.dirname(PGLITE_DIR), { recursive: true });
  const client = new PGlite(PGLITE_DIR);
  await client.exec(DDL);
  g.__inverbrassDb!.close = async () => {
    await client.close();
  };
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  const state = g.__inverbrassDb!;
  if (!state.ready) {
    state.ready = init().catch((err) => {
      state.ready = undefined; // allow retry after a transient failure
      throw err;
    });
  }
  return state.ready;
}

export async function closeDb(): Promise<void> {
  const state = g.__inverbrassDb!;
  if (state.close) await state.close();
  state.ready = undefined;
  state.close = undefined;
}

export type Db = Awaited<ReturnType<typeof getDb>>;
export { schema };
