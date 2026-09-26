import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  customers,
  documents,
  followUpTasks,
  invoices,
  oemRequests,
  oems,
  orderItems,
  orders,
  payments,
  quotations,
  requirementItems,
  requirements,
} from "@/db/schema";
import { addDaysISO, startOfMonthISO, todayISO } from "./dates";

const AWAITING_QUOTE_STATUSES = [
  "submitted",
  "clarification_requested",
  "technical_clarification",
  "commercial_negotiation",
  "awaiting_approval",
  "sent",
] as const;

export interface DashboardData {
  openOrders: number;
  ordersByState: Array<{ status: string; count: number }>;
  quotesAwaitingResponse: Array<{
    id: string;
    quoteNo: string;
    customer: string;
    status: string;
    total: number;
    submittedAt: Date | null;
    requirementRef: string;
  }>;
  deliveryRisk: Array<{
    id: string;
    orderNo: string;
    customer: string;
    poNumber: string | null;
    deadline: string | null;
    status: string;
    daysToDeadline: number | null;
  }>;
  paymentsPending: Array<{
    id: string;
    invoiceNo: string;
    customer: string;
    dueDate: string | null;
    gross: number;
    paid: number;
    balance: number;
    overdueDays: number;
  }>;
  oemResponsesPending: Array<{
    id: string;
    oem: string;
    requirementRef: string;
    requestedAt: Date;
    status: string;
  }>;
  documentsExpiring: Array<{
    id: string;
    title: string;
    docType: string;
    expiryDate: string | null;
    daysLeft: number | null;
  }>;
  followUpsDue: Array<{ id: string; title: string; dueAt: Date; type: string }>;
  requirementsByStatus: Array<{ status: string; count: number }>;
  wonThisMonth: number;
  lostThisMonth: number;
  activeRequirements: number;
  totals: { openOrderValue: number; outstandingPayments: number };
}

export async function getDashboardData(db: DB): Promise<DashboardData> {
  const today = todayISO();
  const in7 = addDaysISO(today, 7);
  const in90 = addDaysISO(today, 90);
  const monthStart = startOfMonthISO();
  const monthStartTs = new Date(`${monthStart}T00:00:00.000Z`);

  const [
    orderRows,
    quoteRows,
    riskRows,
    invoiceRows,
    paymentRows,
    oemReqRows,
    docRows,
    taskRows,
    reqRows,
    openOrderItemRows,
  ] = await Promise.all([
    db
      .select({ id: orders.id, status: orders.status, value: orders.poValue })
      .from(orders),
    db
      .select({
        id: quotations.id,
        quoteNo: quotations.quoteNo,
        status: quotations.status,
        total: quotations.total,
        submittedAt: quotations.submittedAt,
        customer: customers.name,
        requirementRef: requirements.refNo,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(requirements, eq(requirements.id, quotations.requirementId))
      .where(inArray(quotations.status, [...AWAITING_QUOTE_STATUSES]))
      .orderBy(desc(quotations.submittedAt))
      .limit(15),
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        poNumber: orders.poNumber,
        deadline: orders.deliveryDeadline,
        status: orders.status,
        customer: customers.name,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          inArray(orders.status, ["open", "processing"]),
          or(lte(orders.deliveryDeadline, in7), sql`${orders.deliveryDeadline} is null`),
        ),
      )
      .orderBy(asc(orders.deliveryDeadline))
      .limit(15),
    db
      .select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        dueDate: invoices.paymentDueDate,
        gross: invoices.grossAmount,
        status: invoices.status,
        customer: customers.name,
      })
      .from(invoices)
      .innerJoin(orders, eq(orders.id, invoices.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(ne(invoices.status, "paid"), or(lte(invoices.paymentDueDate, in7), sql`${invoices.paymentDueDate} is null`)))
      .orderBy(asc(invoices.paymentDueDate))
      .limit(15),
    db
      .select({ invoiceId: payments.invoiceId, amount: payments.amount })
      .from(payments)
      .where(eq(payments.direction, "customer_to_oem")),
    db
      .select({
        id: oemRequests.id,
        status: oemRequests.status,
        requestedAt: oemRequests.requestedAt,
        oem: oems.name,
        requirementRef: requirements.refNo,
      })
      .from(oemRequests)
      .innerJoin(oems, eq(oems.id, oemRequests.oemId))
      .innerJoin(requirements, eq(requirements.id, oemRequests.requirementId))
      .where(eq(oemRequests.status, "pending"))
      .orderBy(asc(oemRequests.requestedAt))
      .limit(15),
    db
      .select({
        id: documents.id,
        title: documents.title,
        docType: documents.docType,
        expiryDate: documents.expiryDate,
      })
      .from(documents)
      .where(and(sql`${documents.expiryDate} is not null`, lte(documents.expiryDate, in90)))
      .orderBy(asc(documents.expiryDate))
      .limit(15),
    db
      .select({
        id: followUpTasks.id,
        title: followUpTasks.title,
        dueAt: followUpTasks.dueAt,
        type: followUpTasks.type,
      })
      .from(followUpTasks)
      .where(eq(followUpTasks.status, "open"))
      .orderBy(asc(followUpTasks.dueAt))
      .limit(15),
    db
      .select({ status: requirements.status, updatedAt: requirements.updatedAt })
      .from(requirements),
    db
      .select({ quantity: orderItems.quantity, unitPrice: orderItems.unitPrice, orderId: orderItems.orderId })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(inArray(orders.status, ["open", "processing"])),
  ]);

  const ordersByStateMap = new Map<string, number>();
  for (const o of orderRows) ordersByStateMap.set(o.status, (ordersByStateMap.get(o.status) ?? 0) + 1);

  const paidByInvoice = new Map<string, number>();
  for (const p of paymentRows) {
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
  }

  const paymentsPending = invoiceRows
    .map((inv) => {
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const balance = Math.max(inv.gross - paid, 0);
      const overdueDays = inv.dueDate
        ? Math.max(0, Math.round((Date.parse(today) - Date.parse(inv.dueDate)) / 86_400_000))
        : 0;
      return {
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        customer: inv.customer,
        dueDate: inv.dueDate,
        gross: inv.gross,
        paid,
        balance,
        overdueDays,
      };
    })
    .filter((r) => r.balance > 0);

  const reqByStatusMap = new Map<string, number>();
  for (const r of reqRows) reqByStatusMap.set(r.status, (reqByStatusMap.get(r.status) ?? 0) + 1);

  const wonThisMonth = reqRows.filter(
    (r) => r.status === "won" && r.updatedAt && new Date(r.updatedAt).getTime() >= monthStartTs.getTime(),
  ).length;
  const lostThisMonth = reqRows.filter(
    (r) => r.status === "lost" && r.updatedAt && new Date(r.updatedAt).getTime() >= monthStartTs.getTime(),
  ).length;

  const activeRequirements = reqRows.filter((r) =>
    ["received", "qualifying", "quoted", "submitted"].includes(r.status),
  ).length;

  const openOrderValue = openOrderItemRows.reduce((a, r) => a + Math.round(r.unitPrice * r.quantity), 0);
  const outstandingPayments = paymentsPending.reduce((a, r) => a + r.balance, 0);

  const daysUntil = (iso: string | null) =>
    iso ? Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000) : null;

  return {
    openOrders: orderRows.filter((o) => ["open", "processing"].includes(o.status)).length,
    ordersByState: [...ordersByStateMap.entries()].map(([status, count]) => ({ status, count })),
    quotesAwaitingResponse: quoteRows,
    deliveryRisk: riskRows.map((r) => ({
      id: r.id,
      orderNo: r.orderNo,
      customer: r.customer,
      poNumber: r.poNumber,
      deadline: r.deadline,
      status: r.status,
      daysToDeadline: daysUntil(r.deadline),
    })),
    paymentsPending,
    oemResponsesPending: oemReqRows,
    documentsExpiring: docRows.map((d) => ({
      id: d.id,
      title: d.title,
      docType: d.docType,
      expiryDate: d.expiryDate,
      daysLeft: daysUntil(d.expiryDate),
    })),
    followUpsDue: taskRows,
    requirementsByStatus: [...reqByStatusMap.entries()].map(([status, count]) => ({ status, count })),
    wonThisMonth,
    lostThisMonth,
    activeRequirements,
    totals: { openOrderValue, outstandingPayments },
  };
}
