import { describe, expect, it } from "vitest";
import { computeCoverage, requirementCoverageRollup } from "../coverage";

describe("computeCoverage", () => {
  it("reports 1,000 needed covered by 600 + 400 as fully covered", () => {
    const c = computeCoverage({ required: 1000, firmCommittedHere: 600 + 400, indicatedHere: 0 });
    expect(c.covered).toBe(1000);
    expect(c.uncovered).toBe(0);
    expect(c.state).toBe("covered");
    expect(c.coverageRatio).toBe(1);
  });

  it("does not count availability or quote indications as coverage", () => {
    const c = computeCoverage({ required: 1000, firmCommittedHere: 600, indicatedHere: 400 });
    expect(c.covered).toBe(600);
    expect(c.uncovered).toBe(400);
    expect(c.state).toBe("partial");
  });

  it("is uncovered when there are no firm commitments even if availability exists", () => {
    const c = computeCoverage({ required: 500, firmCommittedHere: 0, indicatedHere: 500 });
    expect(c.state).toBe("uncovered");
    expect(c.uncovered).toBe(500);
  });

  it("flags over-commitment", () => {
    const c = computeCoverage({ required: 100, firmCommittedHere: 150, indicatedHere: 0 });
    expect(c.state).toBe("over");
    expect(c.uncovered).toBe(0);
  });

  it("per-order mode exposes the uncovered balance as available", () => {
    const c = computeCoverage(
      { required: 1000, firmCommittedHere: 700, indicatedHere: 0, firmCommittedElsewhere: 700, declaredCapacity: 1000 },
      "per_order",
    );
    expect(c.availableForThis).toBe(300);
  });

  it("global mode exposes capacity minus commitments elsewhere", () => {
    const c = computeCoverage(
      { required: 1000, firmCommittedHere: 0, indicatedHere: 0, firmCommittedElsewhere: 700, declaredCapacity: 1000 },
      "global",
    );
    expect(c.availableGlobal).toBe(300);
    expect(c.availableForThis).toBe(300);
    expect(c.capacityConflict).toBe(true);
  });

  it("reports unknown capacity as null, never as zero", () => {
    const c = computeCoverage(
      { required: 1000, firmCommittedHere: 0, indicatedHere: 0, declaredCapacity: null },
      "global",
    );
    expect(c.availableGlobal).toBeNull();
    expect(c.availableForThis).toBeNull();
  });
});

describe("requirementCoverageRollup", () => {
  it("rolls up and reports whether all lines are covered", () => {
    const lines = [
      computeCoverage({ required: 100, firmCommittedHere: 100, indicatedHere: 0 }),
      computeCoverage({ required: 50, firmCommittedHere: 20, indicatedHere: 30 }),
    ];
    const rollup = requirementCoverageRollup(lines);
    expect(rollup.totalRequired).toBe(150);
    expect(rollup.totalCovered).toBe(120);
    expect(rollup.totalUncovered).toBe(30);
    expect(rollup.allCovered).toBe(false);
    expect(rollup.uncoveredLines).toBe(1);
  });
});
