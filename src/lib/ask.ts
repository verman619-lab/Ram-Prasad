import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  customers,
  documents,
  invoices,
  oemRequests,
  oems,
  orders,
  payments,
  quotations,
  requirements,
} from "@/db/schema";
import { todayISO, addDaysISO, startOfMonthISO, formatDate } from "./dates";
import { formatINR } from "./money";
import { labelize } from "./labels";
import { matchIntent, type Period, type QuerySpec } from "./nlq";

export interface AskResult {
  matched: boolean;
  intent?: QuerySpec["kind"];
  basis?: string;
  answer: string;
  rows: Array<Record<string, string | number>>;
  columns: string[];
}

function periodRange(period: Period): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (period === "this_month") return { from: new Date(`${startOfMonthISO(now)}T00:00:00.000Z`), to: null };
  if (period === "last_month") {
    const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: startLast, to: startThis };
  }
  if (period === "this_year") return { from: new Date(now.getFullYear(), 0, 1), to: null };
  return { from: null, to: null };
}

export async function answerQuestion(db: DB, question: string): Promise<AskResult> {
  const match = matchIntent(question);
  if (!match) {
    return {
      matched: false,
      answer:
        "I cannot answer that from the stored data. I only answer questions I can map to a specific query — I will not invent a number.",
      rows: [],
      columns: [],
    };
  }

  const spec = match.spec;
  const base = { matched: true, intent: spec.kind, basis: match.explain };

  switch (spec.kind) {
    case "count_orders": {
      const cond =
        spec.scope === "open"
          ? inArray(orders.status, ["open", "processing"])
          : spec.scope === "completed"
            ? eq(orders.status, "completed")
            : spec.scope === "cancelled"
              ? eq(orders.status, "cancelled")
              : undefined;
      const rows = await db
        .select({ status: orders.status, count: sql<number>`count(*)::int` })
        .from(orders)
        .where(cond)
        .groupBy(orders.status);
      const total = rows.reduce((a, r) => a + r.count, 0);
      return {
        ...base,
        answer: `There ${total === 1 ? "is" : "are"} ${total} order${total === 1 ? "" : "s"}${
          spec.scope === "open" ? " open or in processing" : ""
        }.`,
        columns: ["Status", "Count"],
        rows: rows.map((r) => ({ Status: labelize(r.status), Count: r.count })),
      };
    }

    case "orders_by_state": {
      const rows = await db
        .select({ status: orders.status, count: sql<number>`count(*)::int` })
        .from(orders)
        .groupBy(orders.status);
      return {
        ...base,
        answer: `${rows.reduce((a, r) => a + r.count, 0)} order(s) across ${rows.length} state(s).`,
        columns: ["State", "Count"],
        rows: rows.map((r) => ({ State: labelize(r.status), Count: r.count })),
      };
    }

    case "won_count": {
      const { from, to } = periodRange(spec.period);
      const conds = [eq(requirements.status, "won" as never)];
      if (from) conds.push(gte(requirements.updatedAt, from));
      if (to) conds.push(lt(requirements.updatedAt, to));
      const rows = await db.select({ id: requirements.id }).from(requirements).where(and(...conds));
      return {
        ...base,
        answer: `We won ${rows.length} requirement(s) ${spec.period === "all" ? "in total" : spec.period.replace("_", " ")}.`,
        columns: [],
        rows: [],
      };
    }

    case "lost_list": {
      const { from, to } = periodRange(spec.period);
      const conds = [eq(requirements.status, "lost" as never)];
      if (from) conds.push(gte(requirements.updatedAt, from));
      if (to) conds.push(lt(requirements.updatedAt, to));
      const rows = await db
        .select({
          refNo: requirements.refNo,
          customer: customers.name,
          reason: requirements.lossReason,
          competitor: requirements.competitorDetails,
          updatedAt: requirements.updatedAt,
        })
        .from(requirements)
        .innerJoin(customers, eq(customers.id, requirements.customerId))
        .where(and(...conds))
        .orderBy(desc(requirements.updatedAt));
      return {
        ...base,
        answer: `We lost ${rows.length} requirement(s)${spec.period === "all" ? "" : ` ${spec.period.replace("_", " ")}`}.`,
        columns: ["Ref", "Customer", "Reason", "Competitor"],
        rows: rows.map((r) => ({
          Ref: r.refNo,
          Customer: r.customer,
          Reason: labelize(r.reason),
          Competitor: r.competitor ?? "—",
        })),
      };
    }

    case "loss_reasons": {
      const { from, to } = periodRange(spec.period);
      const conds = [eq(requirements.status, "lost" as never)];
      if (from) conds.push(gte(requirements.updatedAt, from));
      if (to) conds.push(lt(requirements.updatedAt, to));
      const rows = await db
        .select({ reason: requirements.lossReason, count: sql<number>`count(*)::int` })
        .from(requirements)
        .where(and(...conds))
        .groupBy(requirements.lossReason)
        .orderBy(desc(sql`count(*)`));
      const total = rows.reduce((a, r) => a + r.count, 0);
      const top = rows[0];
      return {
        ...base,
        answer:
          total === 0
            ? "No lost requirements in that period."
            : `${total} loss(es). The most common reason is "${labelize(top?.reason)}" (${top?.count}).`,
        columns: ["Loss reason", "Count"],
        rows: rows.map((r) => ({ "Loss reason": labelize(r.reason), Count: r.count })),
      };
    }

    case "quotes_awaiting_response": {
      const rows = await db
        .select({
          quoteNo: quotations.quoteNo,
          customer: customers.name,
          status: quotations.status,
          total: quotations.total,
          submittedAt: quotations.submittedAt,
        })
        .from(quotations)
        .innerJoin(customers, eq(customers.id, quotations.customerId))
        .where(
          inArray(quotations.status, [
            "submitted",
            "clarification_requested",
            "technical_clarification",
            "commercial_negotiation",
            "awaiting_approval",
            "sent",
          ] as never[]),
        )
        .orderBy(desc(quotations.submittedAt));
      return {
        ...base,
        answer: `${rows.length} quotation(s) are awaiting a customer response.`,
        columns: ["Quote", "Customer", "Status", "Value"],
        rows: rows.map((r) => ({
          Quote: r.quoteNo,
          Customer: r.customer,
          Status: labelize(r.status),
          Value: formatINR(r.total),
        })),
      };
    }

    case "delivery_risk": {
      const today = todayISO();
      const in7 = addDaysISO(today, 7);
      const rows = await db
        .select({
          orderNo: orders.orderNo,
          customer: customers.name,
          deadline: orders.deliveryDeadline,
          status: orders.status,
        })
        .from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(
          and(
            inArray(orders.status, ["open", "processing"]),
            or(lte(orders.deliveryDeadline, in7), sql`${orders.deliveryDeadline} is null`),
          ),
        )
        .orderBy(asc(orders.deliveryDeadline));
      return {
        ...base,
        answer: `${rows.length} open order(s) are late or within 7 days of the committed deadline.`,
        columns: ["Order", "Customer", "Deadline", "State"],
        rows: rows.map((r) => ({
          Order: r.orderNo,
          Customer: r.customer,
          Deadline: r.deadline ? formatDate(r.deadline) : "no deadline",
          State: labelize(r.status),
        })),
      };
    }

    case "payments_pending": {
      const rows = await db
        .select({
          invoiceNo: invoices.invoiceNo,
          dueDate: invoices.paymentDueDate,
          gross: invoices.grossAmount,
          status: invoices.status,
          customer: customers.name,
          invoiceId: invoices.id,
        })
        .from(invoices)
        .innerJoin(orders, eq(orders.id, invoices.orderId))
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(ne(invoices.status, "paid"))
        .orderBy(asc(invoices.paymentDueDate));
      const paid = await db.select({ invoiceId: payments.invoiceId, amount: payments.amount }).from(payments);
      const paidBy = new Map<string, number>();
      for (const p of paid) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amount);
      const withBalance = rows
        .map((r) => ({ ...r, balance: Math.max(r.gross - (paidBy.get(r.invoiceId) ?? 0), 0) }))
        .filter((r) => r.balance > 0);
      return {
        ...base,
        answer: `${withBalance.length} invoice(s) have a balance outstanding.`,
        columns: ["Invoice", "Customer", "Due", "Balance"],
        rows: withBalance.map((r) => ({
          Invoice: r.invoiceNo,
          Customer: r.customer,
          Due: r.dueDate ? formatDate(r.dueDate) : "—",
          Balance: formatINR(r.balance),
        })),
      };
    }

    case "oem_responses_pending": {
      const rows = await db
        .select({
          oem: oems.name,
          requirementRef: requirements.refNo,
          requestedAt: oemRequests.requestedAt,
          status: oemRequests.status,
        })
        .from(oemRequests)
        .innerJoin(oems, eq(oems.id, oemRequests.oemId))
        .innerJoin(requirements, eq(requirements.id, oemRequests.requirementId))
        .where(eq(oemRequests.status, "pending"))
        .orderBy(asc(oemRequests.requestedAt));
      return {
        ...base,
        answer: `${rows.length} OEM sourcing request(s) are still pending.`,
        columns: ["OEM", "Requirement", "Requested"],
        rows: rows.map((r) => ({
          OEM: r.oem,
          Requirement: r.requirementRef,
          Requested: formatDate(new Date(r.requestedAt).toISOString().slice(0, 10)),
        })),
      };
    }

    case "documents_expiring": {
      const in90 = addDaysISO(todayISO(), 90);
      const rows = await db
        .select({ title: documents.title, docType: documents.docType, expiryDate: documents.expiryDate })
        .from(documents)
        .where(and(sql`${documents.expiryDate} is not null`, lte(documents.expiryDate, in90)))
        .orderBy(asc(documents.expiryDate));
      return {
        ...base,
        answer: `${rows.length} document(s) expire within 90 days (or already expired).`,
        columns: ["Document", "Type", "Expires"],
        rows: rows.map((r) => ({
          Document: r.title,
          Type: labelize(r.docType),
          Expires: formatDate(r.expiryDate),
        })),
      };
    }

    case "orders_for_customer": {
      const like = `%${spec.customer}%`;
      const rows = await db
        .select({
          orderNo: orders.orderNo,
          customer: customers.name,
          status: orders.status,
          deadline: orders.deliveryDeadline,
          value: orders.poValue,
        })
        .from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(ilike(customers.name, like))
        .orderBy(desc(orders.createdAt));
      return {
        ...base,
        answer: `${rows.length} order(s) found for customers matching "${spec.customer}".`,
        columns: ["Order", "Customer", "Status", "Deadline", "Value"],
        rows: rows.map((r) => ({
          Order: r.orderNo,
          Customer: r.customer,
          Status: labelize(r.status),
          Deadline: r.deadline ? formatDate(r.deadline) : "—",
          Value: formatINR(r.value),
        })),
      };
    }

    case "search_requirements": {
      const like = `%${spec.keyword}%`;
      const rows = await db
        .select({
          refNo: requirements.refNo,
          customer: customers.name,
          status: requirements.status,
          project: requirements.projectName,
          deadline: requirements.submissionDeadline,
        })
        .from(requirements)
        .innerJoin(customers, eq(customers.id, requirements.customerId))
        .where(
          or(
            ilike(requirements.refNo, like),
            ilike(requirements.title, like),
            ilike(requirements.projectName, like),
            sql`exists (select 1 from requirement_items ri where ri.requirement_id = ${requirements.id} and (ri.part_number ilike ${like} or ri.description ilike ${like}))`,
          ),
        )
        .orderBy(desc(requirements.createdAt))
        .limit(50);
      return {
        ...base,
        answer: `${rows.length} requirement(s) match "${spec.keyword}".`,
        columns: ["Ref", "Customer", "Project", "Status", "Deadline"],
        rows: rows.map((r) => ({
          Ref: r.refNo,
          Customer: r.customer,
          Project: r.project ?? "—",
          Status: labelize(r.status),
          Deadline: r.deadline ? formatDate(r.deadline) : "—",
        })),
      };
    }
  }
}
