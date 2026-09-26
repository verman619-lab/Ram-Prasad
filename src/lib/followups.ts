import { and, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  customers,
  documents,
  followUpTasks,
  invoices,
  oemRequests,
  oems,
  orders,
  payments,
  quotations,
  requirements,
} from "@/db/schema";
import { addDaysISO, daysBetween, todayISO, formatDate } from "./dates";
import { newId } from "./ids";
import { getSettings, numSetting } from "./settings";

const AWAITING_QUOTE_STATUSES = [
  "submitted",
  "clarification_requested",
  "technical_clarification",
  "commercial_negotiation",
  "awaiting_approval",
  "sent",
] as const;

export interface FollowUpSweepResult {
  created: number;
  createdTypes: string[];
}

interface NewTask {
  id: string;
  requirementId: string | null;
  orderId: string | null;
  quotationId: string | null;
  type: string;
  title: string;
  dueAt: Date;
  assignedUserId: string | null;
  status: "open";
  auto: true;
  notes: string | null;
}

function keyOf(t: {
  type: string;
  requirementId: string | null;
  orderId: string | null;
  quotationId: string | null;
  notes: string | null;
}): string {
  return [t.type, t.requirementId ?? "", t.orderId ?? "", t.quotationId ?? "", t.notes ?? ""].join("|");
}

/**
 * Idempotent rule sweep. Creates automatic follow-up tasks the brief requires:
 * no response for N days, submission deadlines, OEM responses pending, invoices
 * due, and documents expiring. Safe to call on every dashboard load.
 */
export async function generateFollowUps(db: DB): Promise<FollowUpSweepResult> {
  const settings = await getSettings(db);
  const noResponseDays = numSetting(settings, "followup_no_response_days", 7);
  const expiryDays = numSetting(settings, "document_expiry_warning_days", 90);
  const today = todayISO();
  const in7 = addDaysISO(today, 7);
  const in3 = addDaysISO(today, 3);
  const inExpiry = addDaysISO(today, expiryDays);

  const existingOpen = await db
    .select({
      type: followUpTasks.type,
      requirementId: followUpTasks.requirementId,
      orderId: followUpTasks.orderId,
      quotationId: followUpTasks.quotationId,
      notes: followUpTasks.notes,
    })
    .from(followUpTasks)
    .where(eq(followUpTasks.status, "open"));
  const seen = new Set(existingOpen.map(keyOf));

  const tasks: NewTask[] = [];
  const push = (t: Omit<NewTask, "id" | "status" | "auto">) => {
    if (seen.has(keyOf(t))) return;
    seen.add(keyOf(t));
    tasks.push({ ...t, id: newId(), status: "open", auto: true });
  };

  /* 1. Quotations awaiting a customer response for longer than the threshold. */
  const awaitingQuotes = await db
    .select({
      id: quotations.id,
      quoteNo: quotations.quoteNo,
      submittedAt: quotations.submittedAt,
      requirementId: quotations.requirementId,
      createdBy: quotations.createdBy,
      customer: customers.name,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(inArray(quotations.status, [...AWAITING_QUOTE_STATUSES]));
  for (const q of awaitingQuotes) {
    if (!q.submittedAt) continue;
    const submittedISO = new Date(q.submittedAt).toISOString().slice(0, 10);
    if (daysBetween(submittedISO, today) < noResponseDays) continue;
    push({
      requirementId: q.requirementId,
      orderId: null,
      quotationId: q.id,
      type: "no_response",
      title: `${q.customer}: no response on ${q.quoteNo} for ${daysBetween(submittedISO, today)} days — follow up`,
      dueAt: new Date(),
      assignedUserId: q.createdBy,
      notes: null,
    });
  }

  /* 2. OEM sourcing requests still pending beyond the threshold. */
  const pendingOem = await db
    .select({
      id: oemRequests.id,
      requestedAt: oemRequests.requestedAt,
      requirementId: oemRequests.requirementId,
      requestedBy: oemRequests.requestedBy,
      oem: oems.name,
      refNo: requirements.refNo,
    })
    .from(oemRequests)
    .innerJoin(oems, eq(oems.id, oemRequests.oemId))
    .innerJoin(requirements, eq(requirements.id, oemRequests.requirementId))
    .where(eq(oemRequests.status, "pending"));
  for (const r of pendingOem) {
    const reqISO = new Date(r.requestedAt).toISOString().slice(0, 10);
    if (daysBetween(reqISO, today) < noResponseDays) continue;
    push({
      requirementId: r.requirementId,
      orderId: null,
      quotationId: null,
      type: "oem_response",
      title: `${r.oem}: response pending for ${r.refNo} (${daysBetween(reqISO, today)} days)`,
      dueAt: new Date(),
      assignedUserId: r.requestedBy,
      notes: `oem_request:${r.id}`,
    });
  }

  /* 3. Requirements approaching their submission deadline. */
  const upcoming = await db
    .select({
      id: requirements.id,
      refNo: requirements.refNo,
      deadline: requirements.submissionDeadline,
      assignedUserId: requirements.assignedUserId,
      customer: customers.name,
    })
    .from(requirements)
    .innerJoin(customers, eq(customers.id, requirements.customerId))
    .where(
      and(
        inArray(requirements.status, ["received", "qualifying"] as never[]),
        sql`${requirements.submissionDeadline} is not null`,
        lte(requirements.submissionDeadline, in3),
      ),
    );
  for (const r of upcoming) {
    push({
      requirementId: r.id,
      orderId: null,
      quotationId: null,
      type: "deadline",
      title: `${r.customer} ${r.refNo}: submission deadline ${formatDate(r.deadline)}`,
      dueAt: new Date(`${r.deadline}T09:00:00.000Z`),
      assignedUserId: r.assignedUserId,
      notes: null,
    });
  }

  /* 4. Invoices with an outstanding balance due soon or overdue. */
  const openInvoices = await db
    .select({
      id: invoices.id,
      invoiceNo: invoices.invoiceNo,
      dueDate: invoices.paymentDueDate,
      gross: invoices.grossAmount,
      orderId: invoices.orderId,
      status: invoices.status,
      customer: customers.name,
      owner: orders.createdBy,
    })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(ne(invoices.status, "paid"), or(lte(invoices.paymentDueDate, in7), sql`${invoices.paymentDueDate} is null`)));
  if (openInvoices.length > 0) {
    const paidRows = await db
      .select({ invoiceId: payments.invoiceId, amount: payments.amount })
      .from(payments);
    const paidBy = new Map<string, number>();
    for (const p of paidRows) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amount);
    for (const inv of openInvoices) {
      const balance = Math.max(inv.gross - (paidBy.get(inv.id) ?? 0), 0);
      if (balance <= 0) continue;
      push({
        requirementId: null,
        orderId: inv.orderId,
        quotationId: null,
        type: "payment",
        title: `${inv.customer}: balance due on ${inv.invoiceNo} (${formatDate(inv.dueDate)})`,
        dueAt: inv.dueDate ? new Date(`${inv.dueDate}T09:00:00.000Z`) : new Date(),
        assignedUserId: inv.owner,
        notes: null,
      });
    }
  }

  /* 5. Documents and certificates expiring. */
  const expiringDocs = await db
    .select({
      id: documents.id,
      title: documents.title,
      expiryDate: documents.expiryDate,
      requirementId: documents.linkedRequirementId,
    })
    .from(documents)
    .where(and(sql`${documents.expiryDate} is not null`, lte(documents.expiryDate, inExpiry)));
  for (const doc of expiringDocs) {
    push({
      requirementId: doc.requirementId,
      orderId: null,
      quotationId: null,
      type: "document_expiry",
      title: `${doc.title} expires ${formatDate(doc.expiryDate)}`,
      dueAt: doc.expiryDate ? new Date(`${doc.expiryDate}T09:00:00.000Z`) : new Date(),
      assignedUserId: null,
      notes: `document:${doc.id}`,
    });
  }

  if (tasks.length === 0) return { created: 0, createdTypes: [] };

  await db.insert(followUpTasks).values(tasks);
  return { created: tasks.length, createdTypes: [...new Set(tasks.map((t) => t.type))] };
}
