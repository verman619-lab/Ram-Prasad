import type { DB } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "./ids";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "approve"
  | "reject"
  | "override"
  | "login"
  | "logout";

export interface AuditInput {
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary?: string;
}

/** Append-only audit write. Never throws into the caller's transaction path. */
export async function recordAudit(db: DB, input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: newId(),
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
      summary: input.summary ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write audit entry", err);
  }
}
