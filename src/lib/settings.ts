import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { appSettings } from "@/db/schema";

export const SETTING_DEFAULTS: Record<string, string> = {
  company_name: "Inverbrass",
  /** per_order | global — see docs/DECISIONS_AND_ASSUMPTIONS.md A1 */
  oem_capacity_mode: "per_order",
  margin_floor_percent: "8",
  quote_uncovered_override_required: "true",
  /** oem_paid | oem_part_paid — see A2 */
  commission_milestone: "oem_paid",
  followup_no_response_days: "7",
  document_expiry_warning_days: "90",
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export interface SettingsMap extends Record<string, string> {}

export async function getSettings(db: DB): Promise<SettingsMap> {
  const rows = await db.select().from(appSettings);
  const out: SettingsMap = { ...SETTING_DEFAULTS };
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function getSetting(db: DB, key: string): Promise<string> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export async function setSetting(
  db: DB,
  key: string,
  value: string,
  updatedBy: string | null,
): Promise<void> {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: new Date(), updatedBy })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedBy });
  }
}

export function numSetting(settings: SettingsMap, key: string, fallback: number): number {
  const n = Number.parseFloat(settings[key] ?? "");
  return Number.isFinite(n) ? n : fallback;
}

export function boolSetting(settings: SettingsMap, key: string, fallback: boolean): boolean {
  const v = settings[key];
  if (v === undefined) return fallback;
  return v === "true" || v === "1" || v === "yes";
}
