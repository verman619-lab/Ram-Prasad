"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  oemRequests,
  oemResponses,
  quotations,
  requirementItems,
  requirements,
  timelineEvents,
  type LossReason,
  type RequirementStatus,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { newId, financialYear, nextSeqFromRefs, refNo } from "@/lib/ids";
import { toPaise } from "@/lib/money";
import { can } from "@/lib/rbac";

const VALID_STATUSES: RequirementStatus[] = [
  "received",
  "qualifying",
  "quoted",
  "submitted",
  "won",
  "lost",
  "cancelled",
];

const VALID_LOSS_REASONS: LossReason[] = [
  "price",
  "technical_non_compliance",
  "delivery_timeline",
  "competitor_preference",
  "quantity_capacity",
  "cancelled",
  "not_pursued",
  "other",
];

export interface LineInput {
  partNumber?: string;
  clientPartNumber?: string;
  oemPartNumber?: string;
  description: string;
  quantity: number;
  uom?: string;
  requiredDeliveryDate?: string;
  technicalSpecs?: string;
}

export async function createRequirementAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) {
    redirect("/requirements?error=" + encodeURIComponent("You do not have permission to create requirements."));
  }
  const db = await getDb();

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) redirect("/requirements/new?error=" + encodeURIComponent("Customer is required."));

  let items: LineInput[] = [];
  const rawItems = String(formData.get("items") ?? "[]");
  try {
    const parsed = JSON.parse(rawItems) as LineInput[];
    items = parsed.filter((i) => i && i.description && Number.isFinite(i.quantity) && i.quantity > 0);
  } catch {
    redirect("/requirements/new?error=" + encodeURIComponent("Could not read line items."));
  }
  if (items.length === 0) {
    redirect("/requirements/new?error=" + encodeURIComponent("Add at least one line item with a quantity."));
  }
  if (items.length > 500) {
    redirect("/requirements/new?error=" + encodeURIComponent("A requirement supports up to 500 line items."));
  }

  const fy = financialYear();
  const existing = await db.select({ refNo: requirements.refNo }).from(requirements);
  const seq = nextSeqFromRefs(existing.map((e) => e.refNo), "RFI", fy);
  const id = newId();
  const ref = refNo("RFI", fy, seq);

  const deadline = str(formData.get("submissionDeadline"));
  const status: RequirementStatus = "received";

  await db.insert(requirements).values({
    id,
    refNo: ref,
    title: str(formData.get("title")) ?? undefined,
    customerId,
    projectName: str(formData.get("projectName")) ?? undefined,
    source: str(formData.get("source")) ?? "direct",
    bidType: str(formData.get("bidType")) ?? undefined,
    submissionType: str(formData.get("submissionType")) ?? undefined,
    gemTenderNo: str(formData.get("gemTenderNo")) ?? undefined,
    enquiryNo: str(formData.get("enquiryNo")) ?? undefined,
    enquiryDate: str(formData.get("enquiryDate")) ?? undefined,
    submissionDeadline: deadline ?? undefined,
    requiredDeliveryDate: str(formData.get("requiredDeliveryDate")) ?? undefined,
    quotationValidity: str(formData.get("quotationValidity")) ?? undefined,
    staggeredDelivery: formData.get("staggeredDelivery") === "on",
    moqNotes: str(formData.get("moqNotes")) ?? undefined,
    approvalRequirements: str(formData.get("approvalRequirements")) ?? undefined,
    assignedUserId: str(formData.get("assignedUserId")) ?? user.id,
    status,
    remarks: str(formData.get("remarks")) ?? undefined,
    createdBy: user.id,
    updatedBy: user.id,
  });

  let lineNo = 1;
  const itemValues = items.map((i) => ({
    id: newId(),
    requirementId: id,
    lineNo: lineNo++,
    partNumber: i.partNumber?.trim() || null,
    clientPartNumber: i.clientPartNumber?.trim() || null,
    oemPartNumber: i.oemPartNumber?.trim() || null,
    description: i.description.trim(),
    quantity: Number(i.quantity),
    uom: (i.uom || "Nos").trim(),
    requiredDeliveryDate: i.requiredDeliveryDate || null,
    technicalSpecs: i.technicalSpecs || null,
  }));
  await db.insert(requirementItems).values(itemValues);

  await db.insert(timelineEvents).values({
    id: newId(),
    requirementId: id,
    eventType: "created",
    summary: `Requirement ${ref} created with ${itemValues.length} line item(s)`,
    actorUserId: user.id,
    detail: { source: str(formData.get("source")) ?? "direct" },
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "requirement",
    entityId: id,
    after: { refNo: ref, customerId, lineItems: itemValues.length },
    summary: `Created requirement ${ref}`,
  });

  revalidatePath("/requirements");
  redirect(`/requirements/${id}`);
}

export async function updateRequirementStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) {
    redirect("/dashboard?denied=1");
  }
  const db = await getDb();
  const id = String(formData.get("requirementId") ?? "");
  const next = String(formData.get("status") ?? "") as RequirementStatus;
  if (!VALID_STATUSES.includes(next)) redirect(`/requirements/${id}?error=Invalid+status`);

  const current = (await db.select().from(requirements).where(eq(requirements.id, id)).limit(1))[0];
  if (!current) redirect("/requirements?error=Not+found");

  // Rule: submission requires at least one approved quotation.
  if (next === "submitted") {
    const q = await db.select().from(quotations).where(eq(quotations.requirementId, id));
    if (!q.some((x) => x.status === "approved")) {
      redirect(
        `/requirements/${id}?error=${encodeURIComponent("Cannot mark submitted: no approved quotation exists (every quotation must come from an RFI, and submission needs an approved quote).")}`,
      );
    }
  }

  if (next === "lost") {
    const reason = String(formData.get("lossReason") ?? "");
    if (!VALID_LOSS_REASONS.includes(reason as LossReason)) {
      redirect(
        `/requirements/${id}?error=${encodeURIComponent("A structured loss reason is required to mark a requirement lost.")}`,
      );
    }
    await db
      .update(requirements)
      .set({
        status: next,
        lossReason: reason as LossReason,
        lossNotes: str(formData.get("lossNotes")) ?? null,
        competitorDetails: str(formData.get("competitorDetails")) ?? null,
        updatedAt: new Date(),
        updatedBy: user.id,
      })
      .where(eq(requirements.id, id));
  } else {
    await db
      .update(requirements)
      .set({ status: next, updatedAt: new Date(), updatedBy: user.id })
      .where(eq(requirements.id, id));
  }

  await db.insert(timelineEvents).values({
    id: newId(),
    requirementId: id,
    eventType: "status_change",
    summary: `Status changed ${current.status} → ${next}`,
    actorUserId: user.id,
    detail: { from: current.status, to: next },
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "status_change",
    entityType: "requirement",
    entityId: id,
    before: { status: current.status },
    after: { status: next },
    summary: `${current.refNo}: ${current.status} → ${next}`,
  });

  revalidatePath(`/requirements/${id}`);
  revalidatePath("/requirements");
}

export async function addOemRequestAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const requirementId = String(formData.get("requirementId") ?? "");
  const oemId = String(formData.get("oemId") ?? "");
  if (!oemId) redirect(`/requirements/${requirementId}?error=Select+an+OEM`);

  const id = newId();
  await db.insert(oemRequests).values({
    id,
    requirementId,
    oemId,
    requestType: String(formData.get("requestType") ?? "rfq"),
    requestedBy: user.id,
    status: "pending",
    channel: str(formData.get("channel")) ?? null,
    notes: str(formData.get("notes")) ?? null,
  });

  await db.insert(timelineEvents).values({
    id: newId(),
    requirementId,
    eventType: "oem_request",
    summary: `OEM request sent (${String(formData.get("requestType") ?? "rfq")})`,
    actorUserId: user.id,
  });

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "oem_request",
    entityId: id,
    after: { requirementId, oemId },
    summary: "OEM sourcing request recorded",
  });

  revalidatePath(`/requirements/${requirementId}`);
}

export async function addOemResponseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const oemRequestId = String(formData.get("oemRequestId") ?? "");
  const requirementItemId = String(formData.get("requirementItemId") ?? "");
  const responseType = String(formData.get("responseType") ?? "availability") as
    | "availability"
    | "quote_indication"
    | "firm_commitment";
  const requirementId = String(formData.get("requirementId") ?? "");

  const request = (await db.select().from(oemRequests).where(eq(oemRequests.id, oemRequestId)).limit(1))[0];
  if (!request) redirect(`/requirements/${requirementId}?error=OEM+request+not+found`);

  await db.insert(oemResponses).values({
    id: newId(),
    oemRequestId,
    requirementItemId,
    responseType,
    quantity: Number(formData.get("quantity") ?? 0) || 0,
    unitPrice: str(formData.get("unitPrice")) ? toPaise(String(formData.get("unitPrice"))) : null,
    leadTimeDays: formData.get("leadTimeDays") ? Number(formData.get("leadTimeDays")) : null,
    validUntil: str(formData.get("validUntil")) ?? null,
    remarks: str(formData.get("remarks")) ?? null,
    createdBy: user.id,
  });

  await db.update(oemRequests).set({ status: "responded" }).where(eq(oemRequests.id, oemRequestId));

  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "oem_response",
    entityId: oemRequestId,
    after: { responseType, requirementItemId, quantity: Number(formData.get("quantity") ?? 0) },
    summary: `OEM response recorded as ${responseType}`,
  });

  revalidatePath(`/requirements/${requirementId}`);
}

export async function addTimelineNoteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const requirementId = String(formData.get("requirementId") ?? "");
  const summary = str(formData.get("summary"));
  if (!summary) redirect(`/requirements/${requirementId}?error=Note+is+empty`);
  await db.insert(timelineEvents).values({
    id: newId(),
    requirementId,
    eventType: "note",
    summary,
    actorUserId: user.id,
  });
  revalidatePath(`/requirements/${requirementId}`);
}

function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
