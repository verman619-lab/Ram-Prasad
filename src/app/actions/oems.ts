"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { complianceCertificates, oemCapabilities, oemCapacityDeclarations, oemContacts, oems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { can } from "@/lib/rbac";

export async function createOemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/oems?error=OEM+name+is+required");
  const id = newId();
  await db.insert(oems).values({
    id,
    name,
    location: str(formData.get("location")) ?? null,
    countryOfOrigin: str(formData.get("countryOfOrigin")) ?? null,
    spoc: str(formData.get("spoc")) ?? null,
    phone: str(formData.get("phone")) ?? null,
    email: str(formData.get("email")) ?? null,
    gstNo: str(formData.get("gstNo")) ?? null,
    vendorCode: str(formData.get("vendorCode")) ?? null,
    productPortfolio: str(formData.get("productPortfolio")) ?? null,
    leadTimeDays: formData.get("leadTimeDays") ? Number(formData.get("leadTimeDays")) : null,
    paymentTerms: str(formData.get("paymentTerms")) ?? null,
    commissionPercent: formData.get("commissionPercent") ? Number(formData.get("commissionPercent")) : null,
    approved: false,
    createdBy: user.id,
    updatedBy: user.id,
  });
  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "oem",
    entityId: id,
    after: { name },
    summary: `OEM added: ${name}`,
  });
  revalidatePath("/oems");
  redirect(`/oems/${id}`);
}

export async function updateOemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const id = String(formData.get("oemId") ?? "");
  const current = (await db.select().from(oems).where(eq(oems.id, id)).limit(1))[0];
  if (!current) redirect("/oems?error=Not+found");

  await db
    .update(oems)
    .set({
      name: str(formData.get("name")) ?? current.name,
      location: str(formData.get("location")) ?? current.location,
      countryOfOrigin: str(formData.get("countryOfOrigin")) ?? current.countryOfOrigin,
      spoc: str(formData.get("spoc")) ?? current.spoc,
      phone: str(formData.get("phone")) ?? current.phone,
      email: str(formData.get("email")) ?? current.email,
      gstNo: str(formData.get("gstNo")) ?? current.gstNo,
      vendorCode: str(formData.get("vendorCode")) ?? current.vendorCode,
      productPortfolio: str(formData.get("productPortfolio")) ?? current.productPortfolio,
      moqRules: str(formData.get("moqRules")) ?? current.moqRules,
      leadTimeDays: formData.get("leadTimeDays") ? Number(formData.get("leadTimeDays")) : current.leadTimeDays,
      freightTerms: str(formData.get("freightTerms")) ?? current.freightTerms,
      warrantyTerms: str(formData.get("warrantyTerms")) ?? current.warrantyTerms,
      paymentTerms: str(formData.get("paymentTerms")) ?? current.paymentTerms,
      commissionPercent: formData.get("commissionPercent")
        ? Number(formData.get("commissionPercent"))
        : current.commissionPercent,
      ndaStatus: str(formData.get("ndaStatus")) ?? current.ndaStatus,
      capacityNote: str(formData.get("capacityNote")) ?? current.capacityNote,
      approvalNotes: str(formData.get("approvalNotes")) ?? current.approvalNotes,
      notes: str(formData.get("notes")) ?? current.notes,
      updatedAt: new Date(),
      updatedBy: user.id,
    })
    .where(eq(oems.id, id));

  await recordAudit(db, {
    actorUserId: user.id,
    action: "update",
    entityType: "oem",
    entityId: id,
    before: { name: current.name, approved: current.approved },
    summary: `OEM updated: ${current.name}`,
  });
  revalidatePath(`/oems/${id}`);
}

export async function approveOemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "approve_quote")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const id = String(formData.get("oemId") ?? "");
  const current = (await db.select().from(oems).where(eq(oems.id, id)).limit(1))[0];
  if (!current) redirect("/oems?error=Not+found");
  const approved = String(formData.get("approved") ?? "yes") === "yes";
  await db
    .update(oems)
    .set({ approved, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(oems.id, id));
  await recordAudit(db, {
    actorUserId: user.id,
    action: "approve",
    entityType: "oem",
    entityId: id,
    before: { approved: current.approved },
    after: { approved },
    summary: `${current.name} ${approved ? "approved" : "un-approved"}`,
  });
  revalidatePath(`/oems/${id}`);
}

export async function addCapabilityAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const oemId = String(formData.get("oemId") ?? "");
  const id = newId();
  await db.insert(oemCapabilities).values({
    id,
    oemId,
    productCategory: str(formData.get("productCategory")) ?? null,
    description: str(formData.get("description")) ?? null,
    partNumberPattern: str(formData.get("partNumberPattern")) ?? null,
  });
  revalidatePath(`/oems/${oemId}`);
}

export async function addContactAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const oemId = String(formData.get("oemId") ?? "");
  const id = newId();
  await db.insert(oemContacts).values({
    id,
    oemId,
    name: String(formData.get("name") ?? "").trim() || "Contact",
    role: str(formData.get("role")) ?? null,
    phone: str(formData.get("phone")) ?? null,
    email: str(formData.get("email")) ?? null,
    isPrimary: formData.get("isPrimary") === "on",
  });
  revalidatePath(`/oems/${oemId}`);
}

export async function addComplianceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_documents")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const oemId = String(formData.get("oemId") ?? "");
  const id = newId();
  const validTill = str(formData.get("validTill"));
  const status = !validTill
    ? "pending_renewal"
    : new Date(validTill).getTime() < Date.now()
      ? "expired"
      : "valid";
  await db.insert(complianceCertificates).values({
    id,
    oemId: oemId || null,
    authority: String(formData.get("authority") ?? "other"),
    certificateNo: str(formData.get("certificateNo")) ?? null,
    certDate: str(formData.get("certDate")) ?? null,
    validTill,
    extendedTill1: str(formData.get("extendedTill1")) ?? null,
    itemsApproved: str(formData.get("itemsApproved")) ?? null,
    productCode: str(formData.get("productCode")) ?? null,
    applyForRenewalDate: str(formData.get("applyForRenewalDate")) ?? null,
    renewalNo: str(formData.get("renewalNo")) ?? null,
    renewalDate: str(formData.get("renewalDate")) ?? null,
    renewalValidTill: str(formData.get("renewalValidTill")) ?? null,
    status,
    remarks: str(formData.get("remarks")) ?? null,
    createdBy: user.id,
    updatedBy: user.id,
  });
  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "compliance_certificate",
    entityId: id,
    after: { authority: String(formData.get("authority") ?? "") },
    summary: `Compliance certificate added`,
  });
  revalidatePath(`/oems/${oemId}`);
}

export async function addCapacityDeclarationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "manage_requirements")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const oemId = String(formData.get("oemId") ?? "");
  const partNumber = String(formData.get("partNumber") ?? "").trim();
  const declared = Number.parseFloat(String(formData.get("declaredCapacity") ?? ""));
  if (!partNumber || !Number.isFinite(declared) || declared <= 0) {
    redirect(`/oems/${oemId}?error=Part+number+and+a+positive+capacity+are+required`);
  }
  const id = newId();
  await db.insert(oemCapacityDeclarations).values({
    id,
    oemId,
    partNumber,
    declaredCapacity: declared,
    periodNote: str(formData.get("periodNote")) ?? null,
    createdBy: user.id,
  });
  await recordAudit(db, {
    actorUserId: user.id,
    action: "create",
    entityType: "oem_capacity",
    entityId: id,
    after: { oemId, partNumber, declaredCapacity: declared },
    summary: `Declared capacity ${declared} for ${partNumber}`,
  });
  revalidatePath(`/oems/${oemId}`);
}

function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
