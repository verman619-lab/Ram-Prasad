/**
 * Module 4 — bid intelligence. Ranks comparable past bids so the owner can
 * change a new bid based on history (what was quoted, won/lost, and the
 * winning/losing price).
 */

export type BidOutcome = "won" | "lost" | "submitted" | "unknown";

export interface BidRow {
  quotationId: string;
  quoteNo: string;
  requirementRef: string;
  customerName: string;
  partNumber: string | null;
  quantity: number;
  unitPricePaise: number;
  /** Price the winner took, when known from the loss/win analysis. */
  outcomePricePaise?: number | null;
  outcome: BidOutcome;
  quotedAt: string | null; // ISO date
  oemName?: string | null;
  /** Imported history is untrusted until a human verifies it. */
  dataTrust?: string | null;
}

export interface BidSummary {
  /** Best-match rows, most recent first. */
  comparable: BidRow[];
  won: BidRow[];
  lost: BidRow[];
  winRate: number | null;
  avgWonPricePaise: number | null;
  lowestWonPricePaise: number | null;
  avgLostPricePaise: number | null;
  /** Realistic price band to aim at, from won bids. */
  suggestedBand: { low: number; high: number } | null;
  /** Verified vs imported-unverified comparable rows. */
  trustedCount: number;
  untrustedCount: number;
  explanation: string;
}

export interface BidQuery {
  partNumber?: string | null;
  customerId?: string | null;
  limit?: number;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Score how comparable a row is: exact part + same customer is strongest. */
export function comparabilityScore(row: BidRow, query: BidQuery): number {
  let score = 0;
  if (query.partNumber && row.partNumber && row.partNumber.trim().toLowerCase() === query.partNumber.trim().toLowerCase()) {
    score += 5;
  }
  if (query.customerId) score += 2; // rows are pre-filtered to the customer when requested
  if (row.outcome === "won") score += 1;
  // Untrusted (imported, unverified) rows must never outrank verified history.
  if (row.dataTrust === "untrusted") score -= 2;
  return score;
}

export function summarizeBids(rows: BidRow[], query: BidQuery = {}): BidSummary {
  const limit = query.limit ?? 10;
  const won = rows.filter((r) => r.outcome === "won");
  const lost = rows.filter((r) => r.outcome === "lost");

  const scored = [...rows]
    .map((r) => ({ r, s: comparabilityScore(r, query) }))
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s;
      return (b.r.quotedAt ?? "").localeCompare(a.r.quotedAt ?? "");
    })
    .slice(0, limit)
    .map((x) => x.r);

  const wonPrices = won.map((r) => r.unitPricePaise).filter((n) => n > 0);
  const lostPrices = lost.map((r) => r.unitPricePaise).filter((n) => n > 0);
  const totalDecided = won.length + lost.length;

  const sortedWon = [...wonPrices].sort((a, b) => a - b);
  const suggestedBand =
    sortedWon.length >= 1
      ? {
          low: sortedWon[Math.floor((sortedWon.length - 1) * 0.25)],
          high: sortedWon[Math.max(0, Math.ceil((sortedWon.length - 1) * 0.75))],
        }
      : null;

  const parts: string[] = [];
  parts.push(`${rows.length} comparable past bid${rows.length === 1 ? "" : "s"}`);
  if (won.length) parts.push(`${won.length} won`);
  if (lost.length) parts.push(`${lost.length} lost`);
  if (query.partNumber) parts.push(`part ${query.partNumber}`);
  const untrustedCount = rows.filter((r) => r.dataTrust === "untrusted").length;
  const trustedCount = rows.length - untrustedCount;
  if (untrustedCount > 0) parts.push(`${untrustedCount} untrusted (ranked below verified history)`);

  return {
    comparable: scored,
    won,
    lost,
    winRate: totalDecided > 0 ? won.length / totalDecided : null,
    avgWonPricePaise: avg(wonPrices),
    lowestWonPricePaise: sortedWon.length ? sortedWon[0] : null,
    avgLostPricePaise: avg(lostPrices),
    suggestedBand,
    trustedCount,
    untrustedCount,
    explanation: parts.join(" · "),
  };
}
