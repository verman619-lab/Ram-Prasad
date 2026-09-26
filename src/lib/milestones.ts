import type { MilestoneStep } from "@/db/schema";

/** Fulfilment timeline order (brief module 7). */
export const MILESTONE_ORDER: MilestoneStep[] = [
  "oem_po_placed",
  "production_started",
  "production_done",
  "pdi_scheduled",
  "pdi_passed",
  "govt_inspection",
  "dispatched",
  "delivered",
  "accepted",
];
