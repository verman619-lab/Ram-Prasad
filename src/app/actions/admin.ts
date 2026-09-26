"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { quotations, requirements, taxonomies, users, type DataTrust, type Role } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { hashPassword, validatePassword } from "@/lib/password";
import { can } from "@/lib/rbac";
import { setSetting } from "@/lib/settings";

const ROLES: Role[] = ["owner", "management", "sales", "operations", "finance"];

export async function createUserAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!can(actor.role, "manage_users")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "sales") as Role;
  const password = String(formData.get("password") ?? "");
  if (!email || !name) redirect("/admin?error=Name+and+email+are+required");
  if (!ROLES.includes(role)) redirect("/admin?error=Invalid+role");
  const pwError = validatePassword(password);
  if (pwError) redirect(`/admin?error=${encodeURIComponent(pwError)}`);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) redirect("/admin?error=An+account+with+that+email+already+exists");

  const id = newId();
  await db.insert(users).values({
    id,
    email,
    name,
    role,
    passwordHash: await hashPassword(password),
    active: true,
    createdBy: actor.id,
    updatedBy: actor.id,
  });
  await recordAudit(db, {
    actorUserId: actor.id,
    action: "create",
    entityType: "user",
    entityId: id,
    after: { email, role },
    summary: `Created user ${name} (${role})`,
  });
  revalidatePath("/admin");
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!can(actor.role, "manage_users")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const id = String(formData.get("userId") ?? "");
  const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!target) redirect("/admin?error=User+not+found");
  if (target.id === actor.id) redirect("/admin?error=You+cannot+disable+your+own+account");
  await db.update(users).set({ active: !target.active, updatedAt: new Date(), updatedBy: actor.id }).where(eq(users.id, id));
  await recordAudit(db, {
    actorUserId: actor.id,
    action: "update",
    entityType: "user",
    entityId: id,
    before: { active: target.active },
    after: { active: !target.active },
    summary: `${target.name} ${target.active ? "disabled" : "enabled"}`,
  });
  revalidatePath("/admin");
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!can(actor.role, "manage_settings")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const keys = [
    "company_name",
    "oem_capacity_mode",
    "margin_floor_percent",
    "quote_uncovered_override_required",
    "commission_milestone",
    "followup_no_response_days",
    "document_expiry_warning_days",
  ];
  const before: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (value === null) continue;
    before[key] = String(value);
    await setSetting(db, key, String(value), actor.id);
  }
  await recordAudit(db, {
    actorUserId: actor.id,
    action: "update",
    entityType: "app_setting",
    entityId: "settings",
    after: before,
    summary: "Updated application settings",
  });
  revalidatePath("/admin");
}

export async function markTrustedAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!can(actor.role, "manage_settings")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const entity = String(formData.get("entity") ?? "");
  const id = String(formData.get("id") ?? "");
  const trust = (String(formData.get("trust") ?? "trusted") as DataTrust) ?? "trusted";

  if (entity === "requirement") {
    await db
      .update(requirements)
      .set({ dataTrust: trust, updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(requirements.id, id));
  } else if (entity === "quotation") {
    await db
      .update(quotations)
      .set({ dataTrust: trust, updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(quotations.id, id));
  } else {
    redirect("/admin?tab=import&error=Unknown+record+type");
  }

  await recordAudit(db, {
    actorUserId: actor.id,
    action: "update",
    entityType: entity,
    entityId: id,
    after: { dataTrust: trust },
    summary: `Marked ${entity} ${id.slice(0, 8)} as ${trust}`,
  });
  revalidatePath("/admin");
}

export async function addTaxonomyAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  if (!can(actor.role, "manage_settings")) redirect("/dashboard?denied=1");
  const db = await getDb();
  const kind = String(formData.get("kind") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  const label = String(formData.get("label") ?? "").trim();
  if (!kind || !code || !label) redirect("/admin?error=All+taxonomy+fields+are+required");
  const existing = await db.select().from(taxonomies).where(eq(taxonomies.kind, kind));
  if (existing.some((t) => t.code === code)) redirect("/admin?error=That+code+already+exists+for+this+kind");
  const id = newId();
  await db.insert(taxonomies).values({ id, kind, code, label, sort: existing.length + 1, active: true });
  await recordAudit(db, {
    actorUserId: actor.id,
    action: "create",
    entityType: "taxonomy",
    entityId: id,
    after: { kind, code, label },
    summary: `Added ${kind} label "${label}"`,
  });
  revalidatePath("/admin");
}
