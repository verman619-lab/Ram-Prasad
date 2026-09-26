import { describe, expect, it } from "vitest";
import { matchIntent, normalize } from "../nlq";

describe("nlq deterministic intent matching", () => {
  it("matches order counts", () => {
    expect(matchIntent("how many orders are there?")?.spec).toEqual({ kind: "count_orders", scope: "all" });
    expect(matchIntent("how many open orders?")?.spec).toEqual({ kind: "count_orders", scope: "open" });
  });

  it("matches won-this-month", () => {
    const m = matchIntent("how many contracts did we win this month?");
    expect(m?.spec).toEqual({ kind: "won_count", period: "this_month" });
  });

  it("distinguishes what we lost from why we lost", () => {
    expect(matchIntent("what did we lose?")?.spec.kind).toBe("lost_list");
    expect(matchIntent("why did we lose them?")?.spec.kind).toBe("loss_reasons");
  });

  it("matches operational intents", () => {
    expect(matchIntent("orders at delivery risk")?.spec.kind).toBe("delivery_risk");
    expect(matchIntent("payments pending")?.spec.kind).toBe("payments_pending");
    expect(matchIntent("documents expiring")?.spec.kind).toBe("documents_expiring");
    expect(matchIntent("oem responses pending")?.spec.kind).toBe("oem_responses_pending");
  });

  it("refuses unmatched questions instead of guessing", () => {
    expect(matchIntent("will it rain tomorrow")).toBeNull();
  });

  it("normalizes punctuation and case", () => {
    expect(normalize("How many Orders, are there?!")).toBe("how many orders are there");
  });
});
