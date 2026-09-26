/**
 * Quantity balance across the whole lifecycle (brief rule 5):
 * requested -> quoted -> committed -> ready -> inspected -> invoiced -> delivered -> accepted.
 * "inspected" is offered; "cleared" and "rejected" are distinct (brief rule 6).
 */

export interface LifecycleQuantities {
  requested: number;
  quoted: number;
  committed: number;
  ready: number;
  inspectedOffered: number;
  inspectedCleared: number;
  inspectedRejected: number;
  invoiced: number;
  delivered: number;
  accepted: number;
}

export interface LifecycleBalance extends LifecycleQuantities {
  outstandingDelivery: number;
  outstandingInvoice: number;
  balanceToAccept: number;
  pdiPending: number;
  warning?: string;
}

export interface LifecycleInput {
  requested: number;
  quoted?: number;
  committed?: number;
  ready?: number;
  inspectedOffered?: number;
  inspectedCleared?: number;
  inspectedRejected?: number;
  invoiced?: number;
  delivered?: number;
  accepted?: number;
}

export function lifecycleBalance(input: LifecycleInput): LifecycleBalance {
  const requested = nn(input.requested);
  const quoted = nn(input.quoted);
  const committed = nn(input.committed);
  const ready = nn(input.ready);
  const inspectedOffered = nn(input.inspectedOffered);
  const inspectedCleared = nn(input.inspectedCleared);
  const inspectedRejected = nn(input.inspectedRejected);
  const invoiced = nn(input.invoiced);
  const delivered = nn(input.delivered);
  const accepted = nn(input.accepted);

  let warning: string | undefined;
  if (inspectedOffered > 0 && Math.abs(inspectedOffered - (inspectedCleared + inspectedRejected)) > 0.001) {
    warning = "PDI offered does not equal cleared + rejected";
  }

  return {
    requested,
    quoted,
    committed,
    ready,
    inspectedOffered,
    inspectedCleared,
    inspectedRejected,
    invoiced,
    delivered,
    accepted,
    outstandingDelivery: Math.max(requested - delivered, 0),
    outstandingInvoice: Math.max(requested - invoiced, 0),
    balanceToAccept: Math.max(delivered - accepted, 0),
    pdiPending: Math.max(ready - inspectedCleared, 0),
    warning,
  };
}

function nn(n: number | undefined | null): number {
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0;
}

/** Delivery risk: expected completion vs committed deadline. */
export type RiskLevel = "on_track" | "at_risk" | "late" | "unknown";

export function deliveryRisk(
  expectedCompletionISO: string | null | undefined,
  deadlineISO: string | null | undefined,
  daysUntil: (iso: string) => number,
  bufferDays = 3,
): { level: RiskLevel; daysToDeadline: number | null; slackDays: number | null } {
  if (!deadlineISO) return { level: "unknown", daysToDeadline: null, slackDays: null };
  const daysToDeadline = daysUntil(deadlineISO);
  if (!expectedCompletionISO) return { level: "unknown", daysToDeadline, slackDays: null };
  const slackDays = daysUntil(deadlineISO) - daysUntil(expectedCompletionISO);
  let level: RiskLevel;
  if (slackDays < 0) level = "late";
  else if (slackDays <= bufferDays) level = "at_risk";
  else level = "on_track";
  return { level, daysToDeadline, slackDays };
}
