/**
 * Module 8 — payment deductions. Mirrors workbook 5 columns:
 * gross, TDS, LD (liquidated damages), GST on LD, total deduction,
 * balance, final balance.
 */

export interface DeductionInput {
  grossPaise: number;
  receivedPaise: number;
  tdsPaise?: number;
  ldPaise?: number;
  gstOnLdPaise?: number;
}

export interface DeductionResult {
  grossPaise: number;
  receivedPaise: number;
  tdsPaise: number;
  ldPaise: number;
  gstOnLdPaise: number;
  totalDeductionPaise: number;
  /** gross - totalDeduction: amount payable before receipts. */
  netPayablePaise: number;
  /** netPayable - received: still outstanding (>= 0). */
  balancePaise: number;
  /** received - netPayable: over-received, if any (>= 0). */
  excessPaise: number;
  status: "pending" | "partial" | "completed";
}

export function computeDeductions(input: DeductionInput): DeductionResult {
  const grossPaise = Math.max(input.grossPaise ?? 0, 0);
  const receivedPaise = Math.max(input.receivedPaise ?? 0, 0);
  const tdsPaise = Math.max(input.tdsPaise ?? 0, 0);
  const ldPaise = Math.max(input.ldPaise ?? 0, 0);
  const gstOnLdPaise = Math.max(input.gstOnLdPaise ?? 0, 0);

  const totalDeductionPaise = tdsPaise + ldPaise + gstOnLdPaise;
  const netPayablePaise = Math.max(grossPaise - totalDeductionPaise, 0);
  const diff = netPayablePaise - receivedPaise;
  const balancePaise = Math.max(diff, 0);
  const excessPaise = Math.max(-diff, 0);

  let status: DeductionResult["status"] = "pending";
  if (receivedPaise > 0 && balancePaise > 0) status = "partial";
  else if (netPayablePaise > 0 && balancePaise === 0) status = "completed";
  else if (netPayablePaise === 0 && receivedPaise > 0) status = "completed";
  else if (grossPaise === 0) status = "pending";

  return {
    grossPaise,
    receivedPaise,
    tdsPaise,
    ldPaise,
    gstOnLdPaise,
    totalDeductionPaise,
    netPayablePaise,
    balancePaise,
    excessPaise,
    status,
  };
}

export function isCommissionMilestoneMet(
  milestone: "oem_paid" | "oem_part_paid",
  oemPaidPaise: number,
  oemInvoicePaise: number,
): boolean {
  if (oemInvoicePaise <= 0) return false;
  if (milestone === "oem_part_paid") return oemPaidPaise > 0;
  return oemPaidPaise >= oemInvoicePaise;
}
