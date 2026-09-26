/**
 * Money is stored as integer paise (1 rupee = 100 paise) to avoid float drift.
 * All helpers accept/return numbers representing paise unless suffixed Rupees.
 */

export function toPaise(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = String(input).replace(/[,₹\s]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toRupees(paise: number | null | undefined): number {
  return (paise ?? 0) / 100;
}

export function formatINR(paise: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  const v = toRupees(paise);
  const decimals = opts.decimals ?? false;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(v);
}

/** Compact Indian form: 1,23,45,678 -> "1.23 Cr". */
export function formatINRCompact(paise: number | null | undefined): string {
  const r = toRupees(paise);
  const abs = Math.abs(r);
  if (abs >= 1_00_00_000) return `₹${(r / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(r / 1_00_000).toFixed(2)} L`;
  return formatINR(paise);
}

export function sumPaise(values: Array<number | null | undefined>): number {
  return values.reduce<number>((a, b) => a + (b ?? 0), 0);
}

export function multiplyPaise(unitPaise: number, quantity: number): number {
  return Math.round(unitPaise * quantity);
}
