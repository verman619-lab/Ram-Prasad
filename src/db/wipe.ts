import type { DB } from "./index";
import { sql } from "drizzle-orm";

export const ALL_TABLES = [
  "audit_logs",
  "import_batches",
  "follow_up_tasks",
  "commissions",
  "payments",
  "deliveries",
  "invoices",
  "pdi_records",
  "fulfilment_milestones",
  "order_amendments",
  "order_items",
  "orders",
  "approvals",
  "quotation_items",
  "quotations",
  "oem_responses",
  "oem_requests",
  "oem_capacity_declarations",
  "compliance_certificates",
  "oem_capabilities",
  "oem_contacts",
  "oems",
  "timeline_events",
  "requirement_items",
  "requirements",
  "documents",
  "taxonomies",
  "app_settings",
  "sessions",
  "users",
];

/** Wipe all application data. Development/demo helper only. */
export async function wipe(db: DB): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}
