"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  approvals,
  customers,
  oemRequests,
  oemResponses,
  quotationItems,
  quotations,
  requirementItems,
  requirements,
  type QuotationStatus,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { financialYear, newId, nextSeqFromRefs, refNo } from "@/lib/ids";
import { toPaise } from "@/lib/money";
import { can } from "@/lib/rbac";
import { recalcQuotation } from "@/lib/quotes";
import { boolSetting, getSettings, numSetting } from "@/lib/settings";
import { getRequirementDetail } from "@/lib/requirements";

const SUBMISSION_STATES: QuotationStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "submitted",
  "clarification_requested",
  "technical_clarification",
  "commercial_negotiation",
  "awaiting_approval",
  "won",
  "lost",
  "cancelled",
];

export async function createQuoteFromRequirementAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "submit_quote")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const requirementId = String(formData.get("requirementId") ?? "");

  const req = (await db.select().from(requirements).where(eq(requirements.id, requirementId)).limit(1))[0];
  if (!req) redirect("/requirements?error=Requirement+not+found");

  const items = await db
    .select()
    .from(requirementItems)
    .where(eq(requirementItems.requirementId, requirementId));

  // Primary OEM = the OEM with the largest firm commitment across these lines.
  const firmRows = await db
    .select({
      oemId: oemRequests.oemId,
      quantity: oemResponses.quantity,
      requirementItemId: oemResponses.requirementItemId,
    })
    .from(oemResponses)
    .innerJoin(oemRequests, eq(oemRequests.id, oemResponses.oemRequestId))
    .where(eq(oemResponses.responseType, "firm_commitment"));
  const itemIds = new Set(items.map((i) => i.id));
  const oemTotals = new Map<string, number>();
  for (const f of firmRows) {
    if (!itemIds.has(f.requirementItemId)) continue;
    oemTotals.set(f.oemId, (oemTotals.get(f.oemId) ?? 0) + f.quantity);
  }
  let primaryOemId: string | null = null;
  let best = 0;
  for (const [oemId, qty] of oemTotals) {
    if (qty > best) {
      best = qty;
      primaryOemId = oemId;
    }
  }

  // Latest firm unit price per line, used to prefill the OEM cost.
  const priceRows = await db
    .select({
      requirementItemId: oemResponses.requirementItemId,
      unitPrice: oemResponses.unitPrice,
    })
    .from(oemResponses)
    .where(eq(oemResponses.responseType, "firm_commitment"));
  const costByItem = new Map<string, number>();
  for (const p of priceRows) {
    if (p.unitPrice && !costByItem.has(p.requirementItemId)) {
      costByItem.set(p.requirementItemId, p.unitPrice);
    }
  }

  const existing = await db
    .select({ quoteNo: quotations.quoteNo, version: quotations.version })
    .from(quotations)
    .where(eq(quotations.requirementId, requirementId))
    .orderBy(desc(quotations.version));
  const fy = financialYear();
  const allRefs = await db.select({ quoteNo: quotations.quoteNo }).from(quotations);
  const seq = nextSeqFromRefs(allRefs.map((r) => r.quoteNo), "QTN", fy);
  const version = (existing[0]?.version ?? 0) + 1;
  const parentQuoteId = existing[0] ? (await db.select().from(quotations).where(eq(quotations.requirementId, requirementId)).orderBy(desc(quotations.version)).limit(1))[0]?.id ?? null : null;

  const quotationId = newId();
  const quoteNo = refNo("QTN", fy, seq);

  await db.insert(quotations).values({
    id: quotationId,
    quoteNo,
    requirementId,
    customerId: req.customerId,
    primaryOemId,
    version,
    parentQuoteId,
    status: "draft",
    deliveryTerms: "Ex-works",
    paymentTerms: req.approvalRequirements ?? null,
    validityDate: null,
    createdBy: user.id,
    updatedBy: user.id,
  });

  let lineNo = 1;
  await db.insert(quotationItems).values(
    items.map((i) => {
      const cost = costByItem.get(i.id) ?? null;
      return {
        id: newId(),
        quotationId,
        requirementItemId: i.id,
        lineNo: lineNo++,
        partNumber: i.partNumber,
        description: i.description,
        quantity: i.quantity,
        oemUnitPrice: cost ?? i.targetPrice ?? null,
        unitPrice: 0,
        lineTotal: 0,
      };
    }),
  );

  await recalcQuotation(db, quotationId);

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "quotation",
    entityId: quotationId,
    after: { quoteNo, requirementId, version },
    summary: `Created quotation ${quoteNo} v${version} from ${req.refNo}`,
  });

  revalidatePath(`/requirements/${requirementId}`);
  redirect(`/quotations/${quotationId}`);
}

export async function updateQuoteItemsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "submit_quote")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const quotationId = String(formData.get("quotationId") ?? "");
  const quote = (await db.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1))[0];
  if (!quote) redirect("/quotations?error=Not+found");

  const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotationId));
  const before: Record<string, unknown> = {};

  for (const item of items) {
    const first = num(formData.get(`firstRate__${item.id}`));
    const second = num(formData.get(`secondRate__${item.id}`));
    const pnc = num(formData.get(`pncPrice__${item.id}`));
    const cost = num(formData.get(`oemUnitPrice__${item.id}`));
    const patch: Record<string, number | null> = {
      firstRate: first === undefined ? item.firstRate : first === null ? null : toPaise(first),
      secondRate: second === undefined ? item.secondRate : second === null ? null : toPaise(second),
      unitPrice: pnc === undefined ? item.unitPrice : pnc === null ? 0 : toPaise(pnc),
      oemUnitPrice: cost === undefined ? item.oemUnitPrice : cost === null ? null : toPaise(cost),
    };
    before[item.id] = { firstRate: item.firstRate, secondRate: item.secondRate, unitPrice: item.unitPrice, oemUnitPrice: item.oemUnitPrice };
    await db.update(quotationItems).set(patch).where(eq(quotationItems.id, item.id));
  }

  const targetMargin = num(formData.get("targetMarginPercent"));
  const discount = num(formData.get("discount"));
  await db
    .update(quotations)
    .set({
      targetMarginPercent:
        targetMargin === undefined
          ? quote.targetMarginPercent
          : targetMargin === null
            ? null
            : targetMargin,
      discount: discount === undefined ? quote.discount : discount === null ? 0 : toPaise(discount),
      deliveryTerms: str(formData.get("deliveryTerms")) ?? quote.deliveryTerms,
      paymentTerms: str(formData.get("paymentTerms")) ?? quote.paymentTerms,
      validityDate: str(formData.get("validityDate")) ?? quote.validityDate,
      taxesNote: str(formData.get("taxesNote")) ?? quote.taxesNote,
      remarks: str(formData.get("remarks")) ?? quote.remarks,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(quotations.id, quotationId));

  await recalcQuotation(db, quotationId);

  await recordAudit(db, {
    actorUserId: user.id,
    action: "update",
    entityType: "quotation",
    entityId: quotationId,
    before,
    summary: `Updated rates for ${quote.quoteNo}`,
  });

  revalidatePath(`/quotations/${quotationId}`);
}

export async function approveQuoteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "approve_quote")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const quotationId = String(formData.get("quotationId") ?? "");
  const quote = (await db.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1))[0];
  if (!quote) redirect("/quotations?error=Not+found");
  const decision = String(formData.get("decision") ?? "approve");
  const comments = str(formData.get("comments")) ?? null;

  // Rule: a quote below the configured margin floor cannot be approved without
  // an explicit, audited override. Human approval only — no automatic pricing.
  let marginOverrideNote: string | null = null;
  if (decision !== "reject") {
    const settings = await getSettings(db);
    const floor = numSetting(settings, "margin_floor_percent", 0);
    const margin = quote.marginPercent;
    const below = margin !== null && floor > 0 && margin < floor;
    if (below) {
      if (formData.get("marginOverride") !== "on") {
        redirect(
          `/quotations/${quotationId}?error=${encodeURIComponent(
            `Margin ${margin.toFixed(1)}% is below the ${floor}% floor. Tick the override and give a reason to approve.`,
          )}`,
        );
      }
      const reason = str(formData.get("overrideReason"));
      if (!reason) {
        redirect(
          `/quotations/${quotationId}?error=${encodeURIComponent("An override reason is required to approve below the margin floor.")}`,
        );
      }
      marginOverrideNote = `Margin override approved: ${margin.toFixed(1)}% below floor ${floor}% — ${reason}`;
    }
  }

  const status: QuotationStatus = decision === "reject" ? "draft" : "approved";
  await db
    .update(quotations)
    .set({
      status,
      approvedBy: decision === "reject" ? null : user.id,
      approvedAt: decision === "reject" ? null : new Date(),
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(quotations.id, quotationId));

  await db.insert(approvals).values({
    id: newId(),
    entityType: "quotation",
    entityId: quotationId,
    requestedBy: quote.createdBy,
    approverId: user.id,
    status: decision === "reject" ? "rejected" : "approved",
    comments,
    decidedAt: new Date(),
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: decision === "reject" ? "reject" : "approve",
    entityType: "quotation",
    entityId: quotationId,
    before: { status: quote.status },
    after: { status },
    summary: `${quote.quoteNo} ${decision === "reject" ? "rejected" : "approved"}`,
  });

  if (marginOverrideNote) {
    await recordAudit(db, {
      actorUserId: user.id,
      action: "override",
      entityType: "quotation",
      entityId: quotationId,
      after: { marginPercent: quote.marginPercent },
      summary: `${quote.quoteNo}: ${marginOverrideNote}`,
    });
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
}

export async function updateQuoteStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "submit_quote")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const quotationId = String(formData.get("quotationId") ?? "");
  const next = String(formData.get("status") ?? "") as QuotationStatus;
  if (!SUBMISSION_STATES.includes(next)) redirect(`/quotations/${quotationId}?error=Invalid+status`);
  const quote = (await db.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1))[0];
  if (!quote) redirect("/quotations?error=Not+found");

  // Rule: do not confidently commit to a quantity the OEMs have not covered.
  // Firm commitments only; availability and quote indications do not count.
  if (next === "submitted") {
    const settings = await getSettings(db);
    if (boolSetting(settings, "quote_uncovered_override_required", true)) {
      const detail = await getRequirementDetail(db, quote.requirementId);
      if (detail && !detail.rollup.allCovered) {
        const override = formData.get("uncoveredOverride") === "on";
        const reason = str(formData.get("overrideReason"));
        if (!override || !reason) {
          redirect(
            `/quotations/${quotationId}?error=${encodeURIComponent(
              `Cannot submit: ${detail.rollup.uncoveredLines} line(s) have ${detail.rollup.totalUncovered} unit(s) not covered by firm OEM commitments. Tick the override and give a reason if you intend to proceed.`,
            )}`,
          );
        }
        await recordAudit(db, {
          actorUserId: user.id,
          action: "override",
          entityType: "quotation",
          entityId: quotationId,
          after: { uncoveredUnits: detail.rollup.totalUncovered, uncoveredLines: detail.rollup.uncoveredLines },
          summary: `${quote.quoteNo} submitted with ${detail.rollup.totalUncovered} uncovered unit(s) — ${reason}`,
        });
      }
    }
  }

  await db
    .update(quotations)
    .set({
      status: next,
      submittedAt: next === "submitted" ? new Date() : quote.submittedAt,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(quotations.id, quotationId));

  await recordAudit(db, {
    actorUserId: user.id,
    action: "status_change",
    entityType: "quotation",
    entityId: quotationId,
    before: { status: quote.status },
    after: { status: next },
    summary: `${quote.quoteNo}: ${quote.status} → ${next}`,
  });

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  revalidatePath(`/requirements/${quote.requirementId}`);
}

function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: FormDataEntryValue | null): number | null | undefined {
  if (v === null) return undefined;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number.parseFloat(s.replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
