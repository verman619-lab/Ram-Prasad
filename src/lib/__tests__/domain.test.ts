import { describe, expect, it } from "vitest";
import { checkMargin, effectiveRate, marginPercent, recommendedPrice } from "../pricing";
import { computeDeductions, isCommissionMilestoneMet } from "../deductions";
import { lifecycleBalance } from "../lifecycle";

describe("pricing", () => {
  it("computes gross margin on the selling price", () => {
    expect(marginPercent(900, 1000)).toBeCloseTo(10);
    expect(marginPercent(1000, 1000)).toBe(0);
    expect(marginPercent(0, 0)).toBeNull();
  });

  it("recommends a price for a target margin", () => {
    expect(recommendedPrice(900, 10)).toBe(1000);
    expect(recommendedPrice(1000, 20)).toBe(1250);
  });

  it("uses the latest rate in the ladder", () => {
    expect(
      effectiveRate({ oemCostPaise: 100, firstRatePaise: 200, secondRatePaise: 190, pncPricePaise: 180, unitPricePaise: 200 }),
    ).toBe(180);
  });

  it("flags below-floor margin for override", () => {
    const check = checkMargin(950, 1000, 8);
    expect(check.marginPercent).toBeCloseTo(5);
    expect(check.belowFloor).toBe(true);
    expect(check.requiresOverride).toBe(true);
  });
});

describe("deductions", () => {
  it("computes TDS/LD deductions and a partial balance", () => {
    const r = computeDeductions({
      grossPaise: 7_646_400_00,
      receivedPaise: 4_000_000_00,
      tdsPaise: 76_464_00,
      ldPaise: 0,
      gstOnLdPaise: 0,
    });
    expect(r.totalDeductionPaise).toBe(76_464_00);
    expect(r.netPayablePaise).toBe(7_569_936_00);
    expect(r.balancePaise).toBe(3_569_936_00);
    expect(r.status).toBe("partial");
  });

  it("marks a fully received invoice completed with no balance", () => {
    const r = computeDeductions({ grossPaise: 1000_00, receivedPaise: 950_00, tdsPaise: 50_00 });
    expect(r.balancePaise).toBe(0);
    expect(r.status).toBe("completed");
  });
});

describe("commission milestone", () => {
  it("requires full OEM payment for oem_paid", () => {
    expect(isCommissionMilestoneMet("oem_paid", 500, 1000)).toBe(false);
    expect(isCommissionMilestoneMet("oem_paid", 1000, 1000)).toBe(true);
  });
  it("allows any OEM payment for oem_part_paid", () => {
    expect(isCommissionMilestoneMet("oem_part_paid", 1, 1000)).toBe(true);
  });
});

describe("lifecycle", () => {
  it("keeps cleared distinct from offered and rejected", () => {
    const b = lifecycleBalance({ requested: 1000, inspectedOffered: 1000, inspectedCleared: 900, inspectedRejected: 100 });
    expect(b.inspectedOffered).toBe(1000);
    expect(b.inspectedCleared).toBe(900);
    expect(b.inspectedRejected).toBe(100);
    expect(b.warning).toBeUndefined();
  });

  it("warns when offered does not equal cleared + rejected", () => {
    const b = lifecycleBalance({ requested: 1000, inspectedOffered: 1000, inspectedCleared: 900, inspectedRejected: 50 });
    expect(b.warning).toBeTruthy();
  });

  it("tracks the balance to accept", () => {
    const b = lifecycleBalance({ requested: 100, delivered: 60, accepted: 40 });
    expect(b.balanceToAccept).toBe(20);
    expect(b.outstandingDelivery).toBe(40);
  });
});
