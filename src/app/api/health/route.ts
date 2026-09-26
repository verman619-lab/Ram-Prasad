import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** Never echo credentials that may appear inside a driver error message. */
function sanitize(message: string): string {
  return message.replace(/:\/\/[^@\s]+@/g, "://***@");
}

/**
 * Connectivity probe. Open /api/health on the deployment to see whether the
 * database is reachable and, if not, the exact (credential-stripped) reason.
 */
export async function GET() {
  if (!process.env.DATABASE_URL && process.env.VERCEL) {
    return NextResponse.json(
      { ok: false, database: "not_configured", message: "DATABASE_URL is not set for this environment." },
      { status: 500 },
    );
  }

  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, database: "error", message: sanitize(message) }, { status: 500 });
  }
}
