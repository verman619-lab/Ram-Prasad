export function newId(): string {
  return crypto.randomUUID();
}

/** Indian financial year label, e.g. 2026-27 -> "26-27". */
export function financialYear(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const startYear = m >= 3 ? y : y - 1; // April is month 3
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

/**
 * Build a human reference number, e.g. refNo("RFI", "26-27", 7) => "RFI-26-27-0007".
 */
export function refNo(prefix: string, fy: string, seq: number, pad = 4): string {
  return `${prefix}-${fy}-${String(seq).padStart(pad, "0")}`;
}

/** Parse the trailing integer of existing refs of the same shape, for next-seq. */
export function nextSeqFromRefs(refs: string[], prefix: string, fy: string): number {
  const head = `${prefix}-${fy}-`;
  let max = 0;
  for (const r of refs) {
    if (!r.startsWith(head)) continue;
    const n = Number.parseInt(r.slice(head.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
