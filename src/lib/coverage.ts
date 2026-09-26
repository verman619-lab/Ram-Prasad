/**
 * Module 3 — Quantity coverage. The hard part.
 *
 * A requirement line is covered only by FIRM commitments. Availability and
 * quote indications are surfaced but never counted as coverage. If the team
 * wants to submit against an uncovered balance it must record an audited
 * override (enforced in the server action, not here).
 */

export type CapacityMode = "per_order" | "global";

export interface CoverageInput {
  /** Quantity the customer asked for. */
  required: number;
  /** Sum of firm_commitment responses on THIS requirement line. */
  firmCommittedHere: number;
  /** Sum of availability + quote_indication responses on THIS line. */
  indicatedHere: number;
  /**
   * Same OEM(s) firm commitments on the same part number for OTHER active
   * requirements (excludes won/lost/cancelled). Only used in global mode.
   */
  firmCommittedElsewhere?: number;
  /**
   * OEM's declared capacity for this part, if known. `null`/absent means
   * UNKNOWN and is reported as unknown, never as zero.
   */
  declaredCapacity?: number | null;
}

export type CoverageState = "uncovered" | "partial" | "covered" | "over";

export interface CoverageResult {
  required: number;
  firmCommittedHere: number;
  indicatedHere: number;
  firmCommittedElsewhere: number;
  /** covered = firm commitments on this line. */
  covered: number;
  /** uncovered = what firm commitments do not yet cover. */
  uncovered: number;
  /** covered / required (0 when required is 0). */
  coverageRatio: number;
  state: CoverageState;
  /** declaredCapacity - firmCommittedElsewhere, or null when unknown. */
  availableGlobal: number | null;
  /** The headline "available" figure under the active mode. */
  availableForThis: number | null;
  /** True when this line relies on commitments consumed elsewhere. */
  capacityConflict: boolean;
  mode: CapacityMode;
}

function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeCoverage(
  input: CoverageInput,
  mode: CapacityMode = "per_order",
): CoverageResult {
  const required = nonNeg(input.required);
  const firmCommittedHere = nonNeg(input.firmCommittedHere);
  const indicatedHere = nonNeg(input.indicatedHere);
  const firmCommittedElsewhere = nonNeg(input.firmCommittedElsewhere ?? 0);
  const declaredCapacity =
    input.declaredCapacity === null || input.declaredCapacity === undefined
      ? null
      : nonNeg(input.declaredCapacity);

  const covered = firmCommittedHere;
  const uncovered = Math.max(required - covered, 0);
  const coverageRatio = required > 0 ? covered / required : 0;

  let state: CoverageState;
  if (required === 0) state = "covered";
  else if (covered === 0) state = "uncovered";
  else if (covered < required) state = "partial";
  else if (covered > required) state = "over";
  else state = "covered";

  let availableGlobal: number | null = null;
  if (declaredCapacity !== null) {
    availableGlobal = Math.max(declaredCapacity - firmCommittedElsewhere, 0);
  }

  let availableForThis: number | null;
  if (mode === "global") {
    availableForThis = availableGlobal; // null == unknown
  } else {
    availableForThis = uncovered;
  }

  const capacityConflict =
    mode === "global" && declaredCapacity !== null && firmCommittedElsewhere > 0;

  return {
    required,
    firmCommittedHere,
    indicatedHere,
    firmCommittedElsewhere,
    covered,
    uncovered,
    coverageRatio,
    state,
    availableGlobal,
    availableForThis,
    capacityConflict,
    mode,
  };
}

export interface OemCoverageLine {
  oemId: string;
  oemName: string;
  firmQuantity: number;
  indicatedQuantity: number;
  /** Declared capacity for this part, when recorded. */
  declaredCapacity?: number | null;
  /** declared capacity minus this OEM's firm commitments elsewhere (null = unknown). */
  availableGlobal?: number | null;
}

export interface OemCoverageResult extends CoverageResult {
  byOem: OemCoverageLine[];
}

/** Aggregate per-OEM splits for an item, then compute overall coverage. */
export function computeCoverageWithOemSplit(
  input: CoverageInput,
  byOem: OemCoverageLine[],
  mode: CapacityMode = "per_order",
): OemCoverageResult {
  return { ...computeCoverage(input, mode), byOem };
}

export function coverageLabel(state: CoverageState): string {
  switch (state) {
    case "uncovered":
      return "Uncovered";
    case "partial":
      return "Partially covered";
    case "covered":
      return "Covered";
    case "over":
      return "Over-committed";
  }
}

/** A requirement may be submitted only when every line is covered (or override). */
export function requirementCoverageRollup(lines: CoverageResult[]): {
  totalRequired: number;
  totalCovered: number;
  totalUncovered: number;
  allCovered: boolean;
  uncoveredLines: number;
} {
  const totalRequired = lines.reduce((a, l) => a + l.required, 0);
  const totalCovered = lines.reduce((a, l) => a + l.covered, 0);
  const totalUncovered = lines.reduce((a, l) => a + l.uncovered, 0);
  return {
    totalRequired,
    totalCovered,
    totalUncovered,
    allCovered: totalUncovered === 0,
    uncoveredLines: lines.filter((l) => l.uncovered > 0).length,
  };
}
