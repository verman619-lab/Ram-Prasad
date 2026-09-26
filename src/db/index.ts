import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { DDL } from "./ddl";

/**
 * A single database handle.
 *
 * If DATABASE_URL is set (Neon/Supabase/any Postgres) we use node-postgres.
 * Otherwise we run a real Postgres engine embedded in-process via PGlite,
 * persisted to ./.data/pglite. Both paths apply the same idempotent DDL.
 */
export type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

interface GlobalState {
  ready?: Promise<DB>;
  close?: () => Promise<void>;
}

const g = globalThis as unknown as { __inverbrassDb?: GlobalState };
if (!g.__inverbrassDb) g.__inverbrassDb = {};

const PGLITE_DIR = process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: url.includes("sslmode=require") || url.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
    });
    await pool.query(DDL);
    g.__inverbrassDb!.close = async () => {
      await pool.end();
    };
    return drizzlePg(pool, { schema }) as unknown as DB;
  }

  const parent = path.dirname(PGLITE_DIR);
  fs.mkdirSync(parent, { recursive: true });
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
