import { and, eq, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { quotationItems, quotations, requirements } from "@/db/schema";
import { effectiveRate, lineTotal, marginPercent, recommendedPrice } from "./pricing";

/** Recompute line totals, subtotal, total and margin for a quotation. */
export async function recalcQuotation(db: DB, quotationId: string): Promise<void> {
  const q = (await db.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1))[0];
  if (!q) return;
  const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotationId));

  let subtotal = 0;
  let cost = 0;

  for (const item of items) {
    const unit = effectiveRate({
      oemCostPaise: item.oemUnitPrice,
      firstRatePaise: item.firstRate,
      secondRatePaise: item.secondRate,
      pncPricePaise: item.unitPrice,
      unitPricePaise: item.unitPrice,
    });
    const lt = lineTotal(unit, item.quantity);
    const m = item.oemUnitPrice ? marginPercent(item.oemUnitPrice, unit) : null;
    subtotal += lt;
    cost += (item.oemUnitPrice ?? 0) * item.quantity;
    await db
      .update(quotationItems)
      .set({ unitPrice: unit, lineTotal: lt, marginPercent: m })
      .where(eq(quotationItems.id, item.id));
  }

  const total = Math.max(subtotal - q.discount, 0);
  const margin = cost > 0 && subtotal > 0 ? ((subtotal - cost) / subtotal) * 100 : null;
  const recommended =
    q.targetMarginPercent !== null && q.targetMarginPercent !== undefined && cost > 0
      ? recommendedPrice(cost, q.targetMarginPercent)
      : null;

  await db
    .update(quotations)
    .set({
      subtotal,
      total,
      marginPercent: margin,
      recommendedPrice: recommended,
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, quotationId));
}

export async function getQuoteVersions(db: DB, requirementId: string, excludeId?: string) {
  const base = excludeId
    ? and(eq(quotations.requirementId, requirementId), ne(quotations.id, excludeId))
    : eq(quotations.requirementId, requirementId);
  return db.select().from(quotations).where(base);
}

export async function getRequirementForQuote(db: DB, requirementId: string) {
  return (await db.select().from(requirements).where(eq(requirements.id, requirementId)).limit(1))[0];
}
