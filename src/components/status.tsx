import { Badge } from "./ui";

const REQUIREMENT_TONES: Record<string, string> = {
  received: "gray",
  qualifying: "blue",
  quoted: "violet",
  submitted: "amber",
  won: "green",
  lost: "red",
  cancelled: "gray",
};

export function RequirementStatusBadge({ status }: { status: string }) {
  return <Badge tone={REQUIREMENT_TONES[status] ?? "gray"}>{labelize(status)}</Badge>;
}

const QUOTE_TONES: Record<string, string> = {
  draft: "gray",
  pending_approval: "amber",
  approved: "green",
  sent: "blue",
  submitted: "blue",
  clarification_requested: "amber",
  technical_clarification: "amber",
  commercial_negotiation: "violet",
  awaiting_approval: "amber",
  won: "green",
  lost: "red",
  cancelled: "gray",
  superseded: "gray",
};

export function QuoteStatusBadge({ status }: { status: string }) {
  return <Badge tone={QUOTE_TONES[status] ?? "gray"}>{labelize(status)}</Badge>;
}

const ORDER_TONES: Record<string, string> = {
  open: "blue",
  processing: "violet",
  completed: "green",
  cancelled: "gray",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={ORDER_TONES[status] ?? "gray"}>{labelize(status)}</Badge>;
}

const RESPONSE_TONES: Record<string, string> = {
  firm_commitment: "green",
  quote_indication: "amber",
  availability: "gray",
};

export function ResponseTypeBadge({ type }: { type: string }) {
  return <Badge tone={RESPONSE_TONES[type] ?? "gray"}>{labelize(type)}</Badge>;
}

export function CoverageBadge({ state }: { state: string }) {
  const tone =
    state === "covered" ? "green" : state === "partial" ? "amber" : state === "over" ? "violet" : "red";
  return <Badge tone={tone}>{labelize(state)}</Badge>;
}

export function RiskBadge({ level }: { level: string }) {
  const tone =
    level === "on_track" ? "green" : level === "at_risk" ? "amber" : level === "late" ? "red" : "gray";
  return <Badge tone={tone}>{labelize(level)}</Badge>;
}

export function PdiBadge({ status }: { status: string }) {
  const tone = status === "passed" ? "green" : status === "failed" ? "red" : "amber";
  return <Badge tone={tone}>{labelize(status)}</Badge>;
}

export function labelize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
