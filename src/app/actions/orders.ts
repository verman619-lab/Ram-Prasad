"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commissions,
  deliveries,
  documents,
  fulfilmentMilestones,
  invoices,
  oems,
  orderItems,
  orders,
  payments,
  pdiRecords,
  quotationItems,
  quotations,
  requirements,
  timelineEvents,
  type MilestoneStep,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { financialYear, newId, nextSeqFromRefs, refNo } from "@/lib/ids";
import { toPaise } from "@/lib/money";
import { can } from "@/lib/rbac";
import { computeDeductions, isCommissionMilestoneMet } from "@/lib/deductions";
import { getSetting } from "@/lib/settings";
import { MILESTONE_ORDER } from "@/lib/milestones";

export async function convertQuoteToOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "convert_order")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const quotationId = String(formData.get("quotationId") ?? "");

  const quote = (await db.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1))[0];
  if (!quote) redirect("/quotations?error=Quotation+not+found");
  if (quote.status !== "approved") {
    redirect(
      `/quotations/${quotationId}?error=${encodeURIComponent("Only an approved quotation can become an order. No orphan PO.")}`,
    );
  }

  const existing = await db.select({ id: orders.id }).from(orders).where(eq(orders.quotationId, quotationId)).limit(1);
  if (existing.length > 0) {
    redirect(`/orders/${existing[0].id}`);
  }

  const [items, req] = await Promise.all([
    db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotationId)),
    db.select().from(requirements).where(eq(requirements.id, quote.requirementId)).limit(1),
  ]);

  const fy = financialYear();
  const allRefs = await db.select({ orderNo: orders.orderNo }).from(orders);
  const seq = nextSeqFromRefs(allRefs.map((r) => r.orderNo), "ORD", fy);
  const id = newId();
  const orderNo = refNo("ORD", fy, seq);

  await db.insert(orders).values({
    id,
    orderNo,
    quotationId,
    customerId: quote.customerId,
    oemId: quote.primaryOemId,
    poValue: quote.total,
    deliveryDeadline: req[0]?.requiredDeliveryDate ?? null,
    paymentTerms: quote.paymentTerms ?? null,
    status: "open",
    createdBy: user.id,
    updatedBy: user.id,
  });

  let lineNo = 1;
  if (items.length > 0) {
    await db.insert(orderItems).values(
      items.map((i) => ({
        id: newId(),
        orderId: id,
        quotationItemId: i.id,
        lineNo: lineNo++,
        partNumber: i.partNumber,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
    );
  }

  await db.insert(fulfilmentMilestones).values(
    MILESTONE_ORDER.map((step) => ({
      id: newId(),
      orderId: id,
      step,
      status: "pending",
      expectedDate: null,
    })),
  );

  await db.insert(timelineEvents).values({
    id: newId(),
    requirementId: quote.requirementId,
    orderId: id,
    eventType: "order_created",
    summary: `Order ${orderNo} created from approved quotation ${quote.quoteNo} v${quote.version}`,
    actorUserId: user.id,
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "order",
    entityId: id,
    after: { orderNo, quotationId },
    summary: `Created order ${orderNo} from ${quote.quoteNo}`,
  });

  revalidatePath("/orders");
  revalidatePath(`/quotations/${quotationId}`);
  redirect(`/orders/${id}`);
}

export async function updateOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "convert_order")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const id = String(formData.get("orderId") ?? "");
  const current = (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
  if (!current) redirect("/orders?error=Not+found");

  const patch = {
    poNumber: str(formData.get("poNumber")) ?? current.poNumber,
    poDate: str(formData.get("poDate")) ?? current.poDate,
    supplierPoNumber: str(formData.get("supplierPoNumber")) ?? current.supplierPoNumber,
    supplierPoDate: str(formData.get("supplierPoDate")) ?? current.supplierPoDate,
    deliveryDeadline: str(formData.get("deliveryDeadline")) ?? current.deliveryDeadline,
    pdiRequired: formData.get("pdiRequired") === null ? current.pdiRequired : formData.get("pdiRequired") === "on",
    pdiMode: str(formData.get("pdiMode")) ?? current.pdiMode,
    pdiInspector: str(formData.get("pdiInspector")) ?? current.pdiInspector,
    documentationRequired: str(formData.get("documentationRequired")) ?? current.documentationRequired,
    specialConditions: str(formData.get("specialConditions")) ?? current.specialConditions,
    warrantyTerms: str(formData.get("warrantyTerms")) ?? current.warrantyTerms,
    paymentTerms: str(formData.get("paymentTerms")) ?? current.paymentTerms,
    status: (str(formData.get("status")) ?? current.status) as typeof current.status,
    oemId: str(formData.get("oemId")) ?? current.oemId,
    updatedAt: new Date(),
    updatedBy: user.id,
  };

  await db.update(orders).set(patch).where(eq(orders.id, id));

  await recordAudit(db, {
    actorUserId: user.id,
    action: "update",
    entityType: "order",
    entityId: id,
    before: { poNumber: current.poNumber, status: current.status, oemId: current.oemId },
    after: { poNumber: patch.poNumber, status: patch.status, oemId: patch.oemId },
    summary: `Updated order ${current.orderNo}`,
  });

  revalidatePath(`/orders/${id}`);
}

export async function setMilestoneAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_fulfilment")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const step = String(formData.get("step") ?? "") as MilestoneStep;
  const expectedDate = str(formData.get("expectedDate"));
  const actualDate = str(formData.get("actualDate"));
  const remarks = str(formData.get("remarks"));

  const existing = await db
    .select()
    .from(fulfilmentMilestones)
    .where(eq(fulfilmentMilestones.orderId, orderId));
  const row = existing.find((m) => m.step === step);

  const status = actualDate ? "done" : expectedDate ? "pending" : "pending";
  if (row) {
    await db
      .update(fulfilmentMilestones)
      .set({ expectedDate, actualDate, remarks, status })
      .where(eq(fulfilmentMilestones.id, row.id));
  } else {
    await db.insert(fulfilmentMilestones).values({
      id: newId(),
      orderId,
      step,
      expectedDate,
      actualDate,
      remarks,
      status,
      ownerUserId: user.id,
    });
  }

  await db.insert(timelineEvents).values({
    id: newId(),
    orderId,
    requirementId: null,
    eventType: "milestone",
    summary: `${step.replace(/_/g, " ")}${actualDate ? ` done ${actualDate}` : expectedDate ? ` expected ${expectedDate}` : ""}`,
    actorUserId: user.id,
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function addPdiAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_pdi")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const offered = num(formData.get("quantityOffered")) ?? 0;
  const cleared = num(formData.get("quantityCleared")) ?? 0;
  const rejected = num(formData.get("quantityRejected")) ?? 0;

  const status = rejected > 0 && cleared === 0 ? "failed" : cleared > 0 && rejected === 0 ? "passed" : "pending";
  const clearance = rejected > 0 && cleared === 0 ? "hold" : "approved";

  const id = newId();
  await db.insert(pdiRecords).values({
    id,
    orderId,
    orderItemId: str(formData.get("orderItemId")) ?? null,
    inspectionType: String(formData.get("inspectionType") ?? "physical"),
    agency: str(formData.get("agency")) ?? null,
    inspector: str(formData.get("inspector")) ?? null,
    scheduledDate: str(formData.get("scheduledDate")) ?? null,
    quantityOffered: offered,
    quantityCleared: cleared,
    quantityRejected: rejected,
    rejectionReason: str(formData.get("rejectionReason")) ?? null,
    rePdiRequired: rejected > 0,
    status,
    dispatchClearance: clearance,
    remarks: str(formData.get("remarks")) ?? null,
  });

  await db.insert(timelineEvents).values({
    id: newId(),
    orderId,
    eventType: "pdi",
    summary: `PDI recorded: offered ${offered}, cleared ${cleared}, rejected ${rejected} (${clearance})`,
    actorUserId: user.id,
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "pdi_record",
    entityId: id,
    after: { orderId, offered, cleared, rejected, clearance },
    summary: `PDI recorded (offered ${offered} / cleared ${cleared} / rejected ${rejected})`,
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function addInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_finance")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) redirect("/orders?error=Not+found");

  const gross = toPaise(String(formData.get("grossAmount") ?? "0"));
  const gstRate = num(formData.get("gstPercent")) ?? 18;
  const net = Math.round(gross / (1 + gstRate / 100));
  const gst = gross - net;
  const quantity = num(formData.get("quantity")) ?? 0;

  const id = newId();
  await db.insert(invoices).values({
    id,
    orderId,
    invoiceNo: String(formData.get("invoiceNo") ?? "").trim() || `INV-${Date.now()}`,
    invoiceDate: str(formData.get("invoiceDate")) ?? null,
    invoiceKind: (str(formData.get("invoiceKind")) ?? "customer") as "customer" | "oem" | "commission",
    partyType: String(formData.get("partyType") ?? "customer"),
    partyId: order.customerId,
    quantity,
    fullOrPartial: String(formData.get("fullOrPartial") ?? "full"),
    balanceQuantity: num(formData.get("balanceQuantity")) ?? 0,
    netAmount: net,
    gstAmount: gst,
    grossAmount: gross,
    dispatchDate: str(formData.get("dispatchDate")) ?? null,
    lrAwb: str(formData.get("lrAwb")) ?? null,
    courier: str(formData.get("courier")) ?? null,
    ewayBill: str(formData.get("ewayBill")) ?? null,
    paymentDueDate: str(formData.get("paymentDueDate")) ?? null,
    status: "raised",
    createdBy: user.id,
    updatedBy: user.id,
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "invoice",
    entityId: id,
    after: { orderId, gross },
    summary: `Invoice recorded for order ${order.orderNo}`,
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function addDeliveryAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_delivery")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const qty = num(formData.get("quantityDelivered")) ?? 0;

  // Rule: a failed/held PDI blocks dispatch of the uncleared quantity.
  const [pdis, prior] = await Promise.all([
    db.select().from(pdiRecords).where(eq(pdiRecords.orderId, orderId)),
    db
      .select({ quantityDelivered: deliveries.quantityDelivered })
      .from(deliveries)
      .where(and(eq(deliveries.orderId, orderId), eq(deliveries.status, "delivered"))),
  ]);
  const clearedTotal = pdis.reduce((a, p) => a + p.quantityCleared, 0);
  const alreadyDelivered = prior.reduce((a, d) => a + d.quantityDelivered, 0);
  const held = pdis.some((p) => p.dispatchClearance === "hold" && p.status !== "passed");
  if (held && alreadyDelivered + qty > clearedTotal) {
    if (formData.get("holdOverride") !== "on") {
      redirect(
        `/orders/${orderId}?tab=invoices&error=${encodeURIComponent(
          `Dispatch is on hold: ${clearedTotal} cleared vs ${alreadyDelivered + qty} to be delivered. Clear the PDI or record an audited override.`,
        )}`,
      );
    }
    const reason = str(formData.get("overrideReason"));
    if (!reason) {
      redirect(
        `/orders/${orderId}?tab=invoices&error=${encodeURIComponent("An override reason is required to dispatch against a held PDI.")}`,
      );
    }
    await recordAudit(db, {
      actorUserId: user.id,
      action: "override",
      entityType: "delivery",
      entityId: orderId,
      after: { clearedTotal, attempted: alreadyDelivered + qty },
      summary: `Dispatch hold overridden (cleared ${clearedTotal}, delivering ${alreadyDelivered + qty}) — ${reason}`,
    });
  }

  const id = newId();
  await db.insert(deliveries).values({
    id,
    orderId,
    invoiceId: str(formData.get("invoiceId")) ?? null,
    deliveryDate: str(formData.get("deliveryDate")) ?? null,
    location: str(formData.get("location")) ?? null,
    quantityDelivered: qty,
    status: String(formData.get("status") ?? "delivered"),
    acceptanceStatus: String(formData.get("acceptanceStatus") ?? "pending"),
    grnNo: str(formData.get("grnNo")) ?? null,
    pendingBalanceQty: num(formData.get("pendingBalanceQty")) ?? 0,
    closureStatus: "open",
    remarks: str(formData.get("remarks")) ?? null,
  });

  await db.insert(timelineEvents).values({
    id: newId(),
    orderId,
    eventType: "delivery",
    summary: `Delivery recorded: ${qty} (${String(formData.get("acceptanceStatus") ?? "pending")})`,
    actorUserId: user.id,
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function addPaymentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_finance")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) redirect(`/orders/${orderId}?error=Select+an+invoice`);

  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice) redirect(`/orders/${orderId}?error=Invoice+not+found`);

  const paid = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  const alreadyPaid = paid.reduce((a, p) => a + p.amount, 0);

  const amount = toPaise(String(formData.get("amount") ?? "0"));
  const tds = toPaise(String(formData.get("tds") ?? "0"));
  const ld = toPaise(String(formData.get("ld") ?? "0"));
  const gstOnLd = toPaise(String(formData.get("gstOnLd") ?? "0"));
  const received = alreadyPaid + amount;

  const result = computeDeductions({
    grossPaise: invoice.grossAmount,
    receivedPaise: received,
    tdsPaise: tds,
    ldPaise: ld,
    gstOnLdPaise: gstOnLd,
  });

  const id = newId();
  await db.insert(payments).values({
    id,
    invoiceId,
    direction: (str(formData.get("direction")) ?? "customer_to_oem") as
      | "customer_to_oem"
      | "oem_to_us"
      | "customer_to_us"
      | "other",
    customerId: invoice.partyType === "customer" ? invoice.partyId : null,
    amount,
    paidDate: str(formData.get("paidDate")) ?? null,
    mode: str(formData.get("mode")) ?? null,
    utr: str(formData.get("utr")) ?? null,
    tds,
    ld,
    gstOnLd,
    totalDeduction: result.totalDeductionPaise,
    balance: result.balancePaise,
    finalBalance: result.balancePaise,
    status: result.status,
    followUpStatus: result.balancePaise > 0 ? "pending" : "done",
    remarks: str(formData.get("remarks")) ?? null,
    createdBy: user.id,
  });

  await db
    .update(invoices)
    .set({ status: result.balancePaise === 0 ? "paid" : "submitted", updatedAt: new Date(), updatedBy: user.id })
    .where(eq(invoices.id, invoiceId));

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "payment",
    entityId: id,
    after: { invoiceId, amount, balance: result.balancePaise },
    summary: `Payment recorded on ${invoice.invoiceNo}; balance ${result.balancePaise}`,
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function addCommissionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_finance")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) redirect("/orders?error=Not+found");

  const milestone =
    (await getSetting(db, "commission_milestone")) === "oem_part_paid" ? "oem_part_paid" : "oem_paid";

  // Commission is earned per OEM invoice, not on a global payment pool.
  const baseInvoiceId = str(formData.get("baseInvoiceId"));
  let base = toPaise(String(formData.get("baseInvoiceAmount") ?? "0"));
  let invoiceTotal = base;
  let oemPaid = 0;
  let milestonePaymentId: string | null = null;

  if (baseInvoiceId) {
    const inv = (await db.select().from(invoices).where(eq(invoices.id, baseInvoiceId)).limit(1))[0];
    if (!inv || inv.orderId !== orderId) {
      redirect(`/orders/${orderId}?tab=finance&error=Invoice+is+not+on+this+order`);
    }
    base = inv.grossAmount;
    invoiceTotal = inv.grossAmount;
    const pays = await db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, baseInvoiceId), eq(payments.direction, "oem_to_us")));
    oemPaid = pays.reduce((a, p) => a + p.amount, 0);
    milestonePaymentId = pays[0]?.id ?? null;
  }

  let percent = num(formData.get("commissionPercent"));
  if (percent === null) {
    if (order.oemId) {
      const oem = (await db.select().from(oems).where(eq(oems.id, order.oemId)).limit(1))[0];
      percent = oem?.commissionPercent ?? 0;
    } else {
      percent = 0;
    }
  }

  const met = isCommissionMilestoneMet(milestone, oemPaid, invoiceTotal);
  const amount = Math.round((base * percent) / 100);
  const gst = Math.round(amount * 0.18);
  const id = newId();

  await db.insert(commissions).values({
    id,
    orderId,
    oemId: order.oemId,
    milestone,
    baseInvoiceId: baseInvoiceId ?? null,
    milestonePaymentId,
    commissionPercent: percent,
    baseInvoiceAmount: base,
    commissionAmount: amount,
    gst,
    gross: amount + gst,
    paymentStatus: met ? "due" : "blocked",
    outstanding: met ? amount + gst : 0,
    remarks: str(formData.get("remarks")) ?? null,
    createdBy: user.id,
    updatedBy: user.id,
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "commission",
    entityId: id,
    after: { orderId, base, percent, met, baseInvoiceId },
    summary: `Commission ${met ? "released" : "created blocked"} on ${baseInvoiceId ? "OEM invoice" : "manual base"} (milestone ${milestone})`,
  });

  revalidatePath(`/orders/${orderId}`);
}

/** Re-check a blocked commission against its OEM-payment milestone. */
export async function releaseCommissionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_finance")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const orderId = String(formData.get("orderId") ?? "");
  const commissionId = String(formData.get("commissionId") ?? "");
  const c = (await db.select().from(commissions).where(eq(commissions.id, commissionId)).limit(1))[0];
  if (!c) redirect(`/orders/${orderId}?tab=finance&error=Commission+not+found`);

  let oemPaid = 0;
  let invoiceTotal = c.baseInvoiceAmount;
  let milestonePaymentId = c.milestonePaymentId;
  if (c.baseInvoiceId) {
    const inv = (await db.select().from(invoices).where(eq(invoices.id, c.baseInvoiceId)).limit(1))[0];
    invoiceTotal = inv?.grossAmount ?? c.baseInvoiceAmount;
    const pays = await db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, c.baseInvoiceId), eq(payments.direction, "oem_to_us")));
    oemPaid = pays.reduce((a, p) => a + p.amount, 0);
    milestonePaymentId = pays[0]?.id ?? null;
  } else {
    const pays = await db.select().from(payments).where(eq(payments.direction, "oem_to_us"));
    oemPaid = pays.reduce((a, p) => a + p.amount, 0);
  }

  const met = isCommissionMilestoneMet(
    c.milestone === "oem_part_paid" ? "oem_part_paid" : "oem_paid",
    oemPaid,
    invoiceTotal,
  );

  await db
    .update(commissions)
    .set({
      paymentStatus: met ? "due" : "blocked",
      outstanding: met ? c.gross : 0,
      milestonePaymentId,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(commissions.id, commissionId));

  await recordAudit(db, {
    actorUserId: user.id,
    action: "update",
    entityType: "commission",
    entityId: commissionId,
    before: { paymentStatus: c.paymentStatus },
    after: { paymentStatus: met ? "due" : "blocked", oemPaid, invoiceTotal },
    summary: `Commission re-checked: ${met ? "released" : "still blocked"} (milestone ${c.milestone})`,
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function addDocumentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_documents")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const id = newId();
  await db.insert(documents).values({
    id,
    docType: String(formData.get("docType") ?? "other"),
    title: String(formData.get("title") ?? "").trim() || "Untitled document",
    source: (str(formData.get("source")) ?? "manual") as "generated" | "reused" | "oem_supplied" | "manual",
    supplierOemId: str(formData.get("supplierOemId")) ?? null,
    customerId: str(formData.get("customerId")) ?? null,
    issueDate: str(formData.get("issueDate")) ?? null,
    expiryDate: str(formData.get("expiryDate")) ?? null,
    linkedRequirementId: str(formData.get("linkedRequirementId")) ?? null,
    linkedOrderId: str(formData.get("linkedOrderId")) ?? null,
    fileRef: str(formData.get("fileRef")) ?? null,
    approvalStatus: String(formData.get("approvalStatus") ?? "none"),
    remarks: str(formData.get("remarks")) ?? null,
    createdBy: user.id,
    updatedBy: user.id,
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "document",
    entityId: id,
    after: { title: String(formData.get("title") ?? ""), docType: String(formData.get("docType") ?? "") },
    summary: `Document added: ${String(formData.get("title") ?? "")}`,
  });

  revalidatePath("/documents");
  revalidatePath(`/requirements/${str(formData.get("linkedRequirementId")) ?? ""}`);
}

function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number.parseFloat(s.replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
