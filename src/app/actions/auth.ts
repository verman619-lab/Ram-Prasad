"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, getSessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { verifyPassword } from "@/lib/password";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !user.active) {
    redirect(`/login?error=${encodeURIComponent("No active account with that email.")}`);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    redirect(`/login?error=${encodeURIComponent("Incorrect password.")}`);
  }

  await createSession(user.id, "web");
  await recordAudit(db, {
    actorUserId: user.id,
    action: "login",
    entityType: "user",
    entityId: user.id,
    summary: `${user.name} signed in`,
  });
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    const db = await getDb();
    await recordAudit(db, {
      actorUserId: user.id,
      action: "logout",
      entityType: "user",
      entityId: user.id,
      summary: `${user.name} signed out`,
    });
  }
  await destroySession();
  redirect("/login");
}
