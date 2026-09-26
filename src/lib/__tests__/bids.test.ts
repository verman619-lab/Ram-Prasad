import { describe, expect, it } from "vitest";
import { comparabilityScore, summarizeBids, type BidRow } from "../bids";

function row(over: Partial<BidRow>): BidRow {
  return {
    quotationId: "q1",
    quoteNo: "QTN-1",
    requirementRef: "RFI-1",
    customerName: "BEL",
    partNumber: "4769 247 702 73",
    quantity: 1000,
    unitPricePaise: 1000,
    outcome: "won",
    quotedAt: "2026-01-01",
    oemName: null,
    dataTrust: null,
    ...over,
  };
}

describe("bid trust handling", () => {
  it("penalises untrusted imported rows", () => {
    const trusted = comparabilityScore(row({ dataTrust: null }), { partNumber: "4769 247 702 73" });
    const untrusted = comparabilityScore(row({ dataTrust: "untrusted" }), { partNumber: "4769 247 702 73" });
    expect(untrusted).toBe(trusted - 2);
  });

  it("ranks verified history above an untrusted row even if the untrusted row is newer", () => {
    const summary = summarizeBids(
      [
        row({ quotationId: "u", quoteNo: "QTN-U", dataTrust: "untrusted", quotedAt: "2026-06-01" }),
        row({ quotationId: "t", quoteNo: "QTN-T", dataTrust: "trusted", quotedAt: "2025-01-01" }),
      ],
      { partNumber: "4769 247 702 73" },
    );
    expect(summary.comparable[0].quotationId).toBe("t");
    expect(summary.untrustedCount).toBe(1);
    expect(summary.trustedCount).toBe(1);
    expect(summary.explanation).toContain("untrusted");
  });
});
