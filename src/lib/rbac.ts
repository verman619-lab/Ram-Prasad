import type { Role } from "@/db/schema";

export type Capability =
  | "manage_users"
  | "manage_settings"
  | "manage_requirements"
  | "submit_quote"
  | "approve_quote"
  | "approve_order"
  | "select_oem"
  | "convert_order"
  | "manage_fulfilment"
  | "manage_pdi"
  | "manage_delivery"
  | "manage_finance"
  | "manage_documents"
  | "view_audit";

const MATRIX: Record<Role, Capability[]> = {
  owner: [
    "manage_users",
    "manage_settings",
    "manage_requirements",
    "submit_quote",
    "approve_quote",
    "approve_order",
    "select_oem",
    "convert_order",
    "manage_fulfilment",
    "manage_pdi",
    "manage_delivery",
    "manage_finance",
    "manage_documents",
    "view_audit",
  ],
  management: [
    "manage_settings",
    "manage_requirements",
    "submit_quote",
    "approve_quote",
    "approve_order",
    "select_oem",
    "convert_order",
    "manage_fulfilment",
    "manage_pdi",
    "manage_delivery",
    "manage_finance",
    "manage_documents",
    "view_audit",
  ],
  sales: [
    "manage_requirements",
    "submit_quote",
    "convert_order",
    "manage_documents",
  ],
  operations: [
    "convert_order",
    "manage_fulfilment",
    "manage_pdi",
    "manage_delivery",
    "manage_documents",
  ],
  finance: ["manage_finance", "manage_documents"],
};

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role]?.includes(capability) ?? false;
}

export function capabilitiesFor(role: Role): Capability[] {
  return MATRIX[role] ?? [];
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "management":
      return "Management";
    case "sales":
      return "Sales";
    case "operations":
      return "Operations";
    case "finance":
      return "Finance";
  }
}

export const APPROVER_ROLES: Role[] = ["owner", "management"];
