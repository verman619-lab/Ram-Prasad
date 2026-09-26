/**
 * Module 10 — plain-language questions.
 *
 * Deterministic intent matching only. No LLM, no invention. Each match returns
 * a typed, parameterised query spec plus a human-readable explanation of the
 * basis used, which the UI shows alongside the number. If nothing matches, we
 * return null and the UI says it cannot answer from stored data rather than
 * guessing.
 */

export type Period = "this_month" | "last_month" | "this_year" | "all";

export type QuerySpec =
  | { kind: "count_orders"; scope: "open" | "all" | "completed" | "cancelled" }
  | { kind: "orders_by_state" }
  | { kind: "won_count"; period: Period }
  | { kind: "lost_list"; period: Period }
  | { kind: "loss_reasons"; period: Period }
  | { kind: "quotes_awaiting_response" }
  | { kind: "delivery_risk" }
  | { kind: "payments_pending" }
  | { kind: "oem_responses_pending" }
  | { kind: "documents_expiring" }
  | { kind: "orders_for_customer"; customer: string }
  | { kind: "search_requirements"; keyword: string };

export interface IntentMatch {
  spec: QuerySpec;
  /** Why we think this is the intent — shown to the user. */
  explain: string;
}

export function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/[?!.,;:"'`()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPeriod(s: string): Period {
  if (/\blast month\b/.test(s)) return "last_month";
  if (/\bthis month\b|\bthis mnth\b/.test(s)) return "this_month";
  if (/\bthis year\b|\bytd\b/.test(s)) return "this_year";
  return "all";
}

export function matchIntent(question: string): IntentMatch | null {
  const s = normalize(question);
  if (!s) return null;

  // "why did we lose ..." must be checked before generic "what did we lose".
  if (/\bwhy\b.*\blose\b|\bloss reasons?\b|\breasons? (for|of) (our )?loss/.test(s)) {
    const period = detectPeriod(s);
    return {
      spec: { kind: "loss_reasons", period },
      explain: `Group lost requirements by structured loss reason (period: ${period.replace("_", " ")})`,
    };
  }

  if (/\bwhat did we lose\b|\blost (requirements|opportunities|enquiries|enquiries)\b|\bwhich .* did we lose\b/.test(s)) {
    const period = detectPeriod(s);
    return {
      spec: { kind: "lost_list", period },
      explain: `List requirements with status = lost (period: ${period.replace("_", " ")})`,
    };
  }

  if (/\bwon\b.*\b(month|year|contracts?|orders?|deals?)\b|\bhow many .*\bwon\b|\bcontracts? did we win\b/.test(s)) {
    const period = detectPeriod(s);
    return {
      spec: { kind: "won_count", period },
      explain: `Count requirements with status = won (period: ${period.replace("_", " ")}, by status-change date)`,
    };
  }

  if (/\bopen orders?\b.*\bstate\b|\borders? by state\b|\bstate of (each|every) order\b/.test(s)) {
    return { spec: { kind: "orders_by_state" }, explain: "Group orders by status" };
  }

  if (/\bdelivery risk\b|\bat risk\b|\blate order|\boverdue deliver|\bwhere is our order\b|\bdelayed order/.test(s)) {
    return {
      spec: { kind: "delivery_risk" },
      explain: "Open orders whose expected completion is late or within 3 days of the committed deadline",
    };
  }

  if (/\bpayments? (pending|due|overdue|outstanding)\b|\boutstanding payments?\b|\bpayment.*due\b/.test(s)) {
    return {
      spec: { kind: "payments_pending" },
      explain: "Invoices with a balance outstanding and their due dates",
    };
  }

  if (/\boem (responses?|replies?)? ?pending\b|\bawaiting (oem|supplier)\b|\bno response\b|\bresponses? pending\b/.test(s)) {
    return { spec: { kind: "oem_responses_pending" }, explain: "OEM sourcing requests still pending or without a firm response" };
  }

  if (/\bdocuments? .*(expir|renew)/.test(s) || /\bexpir(ing|ed|y)\b/.test(s) || /\brenewals?\b/.test(s)) {
    return { spec: { kind: "documents_expiring" }, explain: "Documents and certificates expiring within 90 days or already expired" };
  }

  if (/\bquotes? .*(awaiting|pending|response|reply)\b|\bquotations? (awaiting|pending)\b/.test(s)) {
    return {
      spec: { kind: "quotes_awaiting_response" },
      explain: "Quotations submitted or under negotiation, awaiting a customer response",
    };
  }

  const forCustomer = s.match(/\borders? for ([a-z0-9 &.]+)$/);
  if (forCustomer) {
    return {
      spec: { kind: "orders_for_customer", customer: forCustomer[1].trim() },
      explain: `Orders whose customer name matches "${forCustomer[1].trim()}"`,
    };
  }

  const hasOrderWord = /\borders?\b/.test(s);
  const hasQuantifier = /\bhow many\b|\bnumber of\b|\bcount\b|\btotal\b/.test(s);
  if (hasOrderWord && hasQuantifier) {
    let scope: "open" | "all" | "completed" | "cancelled" = "all";
    if (/\bopen\b/.test(s)) scope = "open";
    else if (/\bcompleted?\b|\bclosed\b/.test(s)) scope = "completed";
    else if (/\bcancell?ed\b/.test(s)) scope = "cancelled";
    return {
      spec: { kind: "count_orders", scope },
      explain: scope === "open"
        ? "Count orders with status open or processing"
        : scope === "all"
          ? "Count all orders"
          : `Count orders with status ${scope}`,
    };
  }

  const search = s.match(/\b(?:find|search|show|history|comparable|similar)\b.*?\b(?:for|about|matching|with)\s+(.+)$/);
  if (search) {
    return {
      spec: { kind: "search_requirements", keyword: search[1].trim() },
      explain: `Search requirement history for "${search[1].trim()}"`,
    };
  }

  return null;
}

export const SAMPLE_QUESTIONS = [
  "how many orders are there?",
  "how many contracts did we win this month?",
  "what did we lose?",
  "why did we lose them?",
];
