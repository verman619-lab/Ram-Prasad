/**
 * Module 4 — pricing. Margin is gross margin on the SELLING price:
 *   margin% = (sell - cost) / sell * 100
 * Recommended price is a suggestion only. The final price is always a human
 * decision (brief non-goal: no automatic final bid price).
 */

export function marginPercent(oemCostPaise: number, sellPaise: number): number | null {
  if (!sellPaise || sellPaise <= 0) return null;
  return ((sellPaise - oemCostPaise) / sellPaise) * 100;
}

/** Markup on cost, kept separate so both views can be shown. */
export function markupPercent(oemCostPaise: number, sellPaise: number): number | null {
  if (!oemCostPaise || oemCostPaise <= 0) return null;
  return ((sellPaise - oemCostPaise) / oemCostPaise) * 100;
}

/** Price needed to achieve a target gross margin (on selling price). */
export function recommendedPrice(oemCostPaise: number, targetMarginPercent: number): number {
  const m = Math.min(Math.max(targetMarginPercent, 0), 99);
  return Math.round(oemCostPaise / (1 - m / 100));
}

export interface RateLadder {
  oemCostPaise: number | null;
  firstRatePaise: number | null;
  secondRatePaise: number | null;
  pncPricePaise: number | null;
  unitPricePaise: number;
}

/**
 * Effective selling rate: the latest step entered wins.
 * pncPrice > secondRate > firstRate > unitPrice.
 */
export function effectiveRate(ladder: RateLadder): number {
  return ladder.pncPricePaise ?? ladder.secondRatePaise ?? ladder.firstRatePaise ?? ladder.unitPricePaise;
}

export interface MarginCheck {
  marginPercent: number | null;
  floorPercent: number;
  belowFloor: boolean;
  requiresOverride: boolean;
}

export function checkMargin(
  oemCostPaise: number,
  sellPaise: number,
  floorPercent: number,
): MarginCheck {
  const m = marginPercent(oemCostPaise, sellPaise);
  const belowFloor = m !== null && m < floorPercent;
  return {
    marginPercent: m,
    floorPercent,
    belowFloor,
    requiresOverride: belowFloor,
  };
}

export function lineTotal(unitPaise: number, quantity: number): number {
  return Math.round(unitPaise * quantity);
}
