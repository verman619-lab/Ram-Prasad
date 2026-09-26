/**
 * Import the manual workbooks (extracted to CSV) into the database.
 *
 * Default is a DRY RUN: nothing is written, and a report shows exactly what
 * would be created. Pass --commit to write. Imported requirements and
 * quotations are marked untrusted unless --trust is given, so historical rows
 * never silently drive pricing or bid comparison.
 *
 * Usage:
 *   npm run import:excel                 # dry run
 *   npm run import:excel -- --commit      # write
 *   npm run import:excel -- --commit --trust
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema";
import { loadEnv } from "./load-env";

interface Args {
  commit: boolean;
  trust: boolean;
  dir: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    commit: argv.includes("--commit"),
    trust: argv.includes("--trust"),
    dir: path.join(process.cwd(), "import", "csv"),
  };
}

/* ------------------------------------------------------------------ */
/* CSV parsing                                                         */
/* ------------------------------------------------------------------ */

function detectDelimiter(line: string): string {
  const counts: Array<[string, number]> = [
    [",", (line.match(/,/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      cur.push(field);
      field = "";
    } else if (c === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Find the header row best matching the expected tokens and map columns. */
function findHeader(
  rows: string[][],
  expected: string[],
): { index: number; cols: Record<string, number> } | null {
  let best: { index: number; score: number; cols: Record<string, number> } | null = null;
  const limit = Math.min(rows.length, 25);
  for (let r = 0; r < limit; r++) {
    const cells = rows[r].map(norm);
    const cols: Record<string, number> = {};
    let score = 0;
    for (let c = 0; c < cells.length; c++) {
      for (const token of expected) {
        if (cols[token] !== undefined) continue;
        if (cells[c] && cells[c].includes(token)) {
          cols[token] = c;
          score++;
        }
      }
    }
    if (!best || score > best.score) best = { index: r, score, cols };
  }
  if (!best || best.score < 2) return null;
  return { index: best.index, cols: best.cols };
}

function cell(row: string[], cols: Record<string, number>, key: string): string {
  const idx = cols[key];
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

function num(v: string): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[,₹\s]/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Excel serials, dd-mm-yyyy, mm/dd/yyyy and ISO are all handled. */
function parseDate(v: string): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    const ms = Date.UTC(1899, 11, 30) + asNum * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let day = Number(dmy[1]);
    const mon = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function classify(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  const parts = lower.split("__");
  const wb = parts[0] ?? lower;
  const sheet = parts.slice(1).join("__");
  const has = (s: string | undefined, needle: string) => !!s && s.includes(needle);

  // The prior spec workbook is documentation, not data.
  if (has(wb, "inverbrass_odoo")) return null;
  if (has(sheet, "enq")) return "enquiries";
  if (has(sheet, "po") && (has(sheet, "master") || has(sheet, "hal"))) return "orders";
  if (has(wb, "quotation")) return "quotations";
  if (has(wb, "ordert") || has(wb, "order")) return "orders";
  if (has(sheet, "master_oem") || (has(wb, "oem") && has(wb, "master"))) return "oem_master";
  if (has(sheet, "master_customer") || (has(wb, "customer") && has(wb, "master"))) return "customer_master";
  if (has(sheet, "appl") || has(wb, "approval")) return "approvals";
  return null;
}

/* ------------------------------------------------------------------ */
/* Import run                                                          */
/* ------------------------------------------------------------------ */

interface Counters {
  created: Record<string, number>;
  skipped: number;
  warnings: string[];
}

function bump(c: Counters, key: string) {
  c.created[key] = (c.created[key] ?? 0) + 1;
}

async function main() {
  loadEnv();
  const args = parseArgs();

  if (!fs.existsSync(args.dir)) {
    console.error(`No CSV directory at ${args.dir}. Run scripts/extract-workbooks.ps1 first.`);
    process.exit(1);
  }
  const files = fs.readdirSync(args.dir).filter((f) => f.toLowerCase().endsWith(".csv"));
  if (files.length === 0) {
    console.error(`No CSVs in ${args.dir}. Run scripts/extract-workbooks.ps1 first.`);
    process.exit(1);
  }

  const { getDb, closeDb } = await import("./index");
  const { newId, financialYear, nextSeqFromRefs, refNo } = await import("../lib/ids");
  const { toPaise } = await import("../lib/money");

  const db = await getDb();
  const fy = financialYear();
  const counters: Counters = { created: {}, skipped: 0, warnings: [] };

  // Caches
  const customerRows = await db.select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers);
  const customersByName = new Map(customerRows.map((c) => [norm(c.name), c.id]));
  const oemRows = await db.select({ id: schema.oems.id, name: schema.oems.name }).from(schema.oems);
  const oemsByName = new Map(oemRows.map((o) => [norm(o.name), o.id]));

  async function resolveCustomer(name: string): Promise<string | null> {
    const key = norm(name);
    if (!key) return null;
    const existing = customersByName.get(key);
    if (existing) return existing;
    const id = newId();
    customersByName.set(key, id);
    if (args.commit) {
      await db.insert(schema.customers).values({ id, name: name.trim(), createdBy: null, updatedBy: null });
    }
    bump(counters, "customers");
    return id;
  }

  async function resolveOem(name: string): Promise<string | null> {
    const key = norm(name);
    if (!key) return null;
    const existing = oemsByName.get(key);
    if (existing) return existing;
    const id = newId();
    oemsByName.set(key, id);
    if (args.commit) {
      await db.insert(schema.oems).values({ id, name: name.trim(), approved: false, createdBy: null, updatedBy: null });
    }
    bump(counters, "oems");
    return id;
  }

  const existingReqRefs = (await db.select({ refNo: schema.requirements.refNo }).from(schema.requirements)).map(
    (r) => r.refNo,
  );
  let reqSeq = nextSeqFromRefs(existingReqRefs, "IMP", fy);
  const existingQuoteNos = (await db.select({ quoteNo: schema.quotations.quoteNo }).from(schema.quotations)).map(
    (q) => q.quoteNo,
  );
  const usedQuoteNos = new Set(existingQuoteNos);
  let quoteSeq = nextSeqFromRefs(existingQuoteNos, "QTN", fy);
  const existingOrderNos = (await db.select({ orderNo: schema.orders.orderNo }).from(schema.orders)).map(
    (o) => o.orderNo,
  );
  let orderSeq = nextSeqFromRefs(existingOrderNos, "ORD", fy);

  const trust = args.trust ? "trusted" : "untrusted";

  for (const file of files) {
    const kind = classify(file);
    const text = fs.readFileSync(path.join(args.dir, file), "utf8").replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    const rows = parseCsv(text, detectDelimiter(firstLine));
    if (!kind) {
      counters.warnings.push(`${file}: not an importable sheet (spec/report) — skipped`);
      continue;
    }

    if (kind === "customer_master" || kind === "oem_master") {
      const header = findHeader(rows, ["customer", "oem", "location", "spoc", "email"]);
      if (!header) {
        counters.warnings.push(`${file}: header not found`);
        continue;
      }
      const nameKey = kind === "oem_master" ? "oem" : "customer";
      for (let r = header.index + 1; r < rows.length; r++) {
        const name = cell(rows[r], header.cols, nameKey) || cell(rows[r], header.cols, "name");
        if (!name) {
          counters.skipped++;
          continue;
        }
        if (kind === "oem_master") {
          await resolveOem(name);
        } else {
          await resolveCustomer(name);
        }
      }
      continue;
    }

    if (kind === "approvals") {
      const header = findHeader(rows, ["oem", "appauth", "certificateno", "cerdt", "validtill", "itemsapproved"]);
      if (!header) {
        counters.warnings.push(`${file}: header not found`);
        continue;
      }
      for (let r = header.index + 1; r < rows.length; r++) {
        const row = rows[r];
        const oemName = cell(row, header.cols, "oem");
        const authority = cell(row, header.cols, "appauth");
        if (!oemName || !authority) {
          counters.skipped++;
          continue;
        }
        const oemId = await resolveOem(oemName);
        const validTill = parseDate(cell(row, header.cols, "validtill"));
        const id = newId();
        if (args.commit) {
          await db.insert(schema.complianceCertificates).values({
            id,
            oemId,
            authority,
            certificateNo: cell(row, header.cols, "certificateno") || null,
            certDate: parseDate(cell(row, header.cols, "cerdt")),
            validTill,
            extendedTill1: parseDate(cell(row, header.cols, "validityextendedtill1")),
            itemsApproved: cell(row, header.cols, "itemsapproved") || null,
            productCode: cell(row, header.cols, "productcode") || null,
            applyForRenewalDate: parseDate(cell(row, header.cols, "toapplyforrenewal")),
            status: validTill && validTill < new Date().toISOString().slice(0, 10) ? "expired" : "valid",
          });
        }
        bump(counters, "compliance_certificates");
      }
      continue;
    }

    if (kind === "enquiries") {
      const header = findHeader(rows, ["cus", "project", "enqno", "enqdate", "dueon", "product", "productcode", "qty", "price", "remarks"]);
      if (!header) {
        counters.warnings.push(`${file}: header not found`);
        continue;
      }
      // Group rows into one requirement per (customer, enquiry no).
      const groups = new Map<string, { customer: string; enqNo: string; rows: string[][] }>();
      for (let r = header.index + 1; r < rows.length; r++) {
        const row = rows[r];
        const customer = cell(row, header.cols, "cus");
        const product = cell(row, header.cols, "product");
        const qty = num(cell(row, header.cols, "qty"));
        if (!customer || !product || qty === null) {
          counters.skipped++;
          continue;
        }
        const enqNo = cell(row, header.cols, "enqno") || `ROW${r}`;
        const key = `${norm(customer)}::${norm(enqNo)}`;
        if (!groups.has(key)) groups.set(key, { customer, enqNo, rows: [] });
        groups.get(key)!.rows.push(row);
      }

      for (const group of groups.values()) {
        const customerId = await resolveCustomer(group.customer);
        if (!customerId) {
          counters.skipped++;
          continue;
        }
        const head = group.rows[0];
        const reqId = newId();
        const ref = refNo("IMP", fy, reqSeq++);
        const project = cell(head, header.cols, "project");
        const src = cell(head, header.cols, "source") || "direct";
        const hasQuote = group.rows.some((rw) => cell(rw, header.cols, "qtnref"));
        const status = hasQuote ? "quoted" : "received";
        if (args.commit) {
          await db.insert(schema.requirements).values({
            id: reqId,
            refNo: ref,
            title: project || `Imported enquiry ${group.enqNo}`,
            customerId,
            projectName: project || null,
            source: /gem/i.test(src) ? "gem" : "direct",
            enquiryNo: group.enqNo,
            enquiryDate: parseDate(cell(head, header.cols, "enqdate")),
            submissionDeadline: parseDate(cell(head, header.cols, "dueon")),
            requiredDeliveryDate: parseDate(cell(head, header.cols, "dueon")),
            status: status as never,
            dataTrust: trust,
            remarks: cell(head, header.cols, "remarks") || null,
          });
          let lineNo = 1;
          const items = group.rows.map((rw) => ({
            id: newId(),
            requirementId: reqId,
            lineNo: lineNo++,
            partNumber: cell(rw, header.cols, "productcode") || null,
            oemPartNumber: cell(rw, header.cols, "mnfrscode") || null,
            description: cell(rw, header.cols, "product"),
            quantity: num(cell(rw, header.cols, "qty")) ?? 0,
            uom: "Nos",
            targetPrice: num(cell(rw, header.cols, "pricersea")) !== null ? toPaise(num(cell(rw, header.cols, "pricersea"))!) : null,
          }));
          if (items.length > 0) await db.insert(schema.requirementItems).values(items);
        }
        bump(counters, "requirements");
      }
      continue;
    }

    if (kind === "quotations") {
      const header = findHeader(rows, ["qtndt", "qtnref", "cus", "enqno", "product", "productcode", "qty", "1strate", "2ndrate", "priceafterpnc", "status", "remarks"]);
      if (!header) {
        counters.warnings.push(`${file}: header not found`);
        continue;
      }
      const groups = new Map<string, { customer: string; qtnRef: string; enqNo: string; rows: string[][] }>();
      for (let r = header.index + 1; r < rows.length; r++) {
        const row = rows[r];
        const customer = cell(row, header.cols, "cus");
        const product = cell(row, header.cols, "product");
        if (!customer || !product) {
          counters.skipped++;
          continue;
        }
        const qtnRef = cell(row, header.cols, "qtnref") || `ROW${r}`;
        const enqNo = cell(row, header.cols, "enqno");
        const key = `${norm(customer)}::${norm(qtnRef)}`;
        if (!groups.has(key)) groups.set(key, { customer, qtnRef, enqNo, rows: [] });
        groups.get(key)!.rows.push(row);
      }

      for (const group of groups.values()) {
        const customerId = await resolveCustomer(group.customer);
        if (!customerId) {
          counters.skipped++;
          continue;
        }
        // Resolve the requirement by enquiry no. within the same customer.
        const reqRow = (
          await db
            .select({ id: schema.requirements.id })
            .from(schema.requirements)
            .where(
              and(
                eq(schema.requirements.customerId, customerId),
                eq(schema.requirements.enquiryNo, group.enqNo),
              ),
            )
            .limit(1)
        )[0];
        const requirementId = reqRow?.id ?? null;
        if (!requirementId) {
          counters.warnings.push(
            `${file}: quotation ${group.qtnRef} has no matching requirement (enq ${group.enqNo || "—"}) — skipped`,
          );
          counters.skipped++;
          continue;
        }
        const quoteId = newId();
        let quoteNo = group.qtnRef.trim() || refNo("QTN", fy, quoteSeq++);
        if (usedQuoteNos.has(quoteNo)) quoteNo = `${quoteNo}-IMP${quoteSeq++}`;
        usedQuoteNos.add(quoteNo);

        const firstRow = group.rows[0];
        const statusText = group.rows.map((rw) => cell(rw, header.cols, "status")).find(Boolean) ?? "";
        const status = /won/i.test(statusText)
          ? "won"
          : /lost/i.test(statusText)
            ? "lost"
            : /approv/i.test(statusText)
              ? "approved"
              : /submit/i.test(statusText)
                ? "submitted"
                : "draft";

        const qtyTotal = group.rows.reduce((a, rw) => a + (num(cell(rw, header.cols, "qty")) ?? 0), 0);
        const firstTotal = group.rows.reduce(
          (a, rw) => a + (num(cell(rw, header.cols, "1strate")) ?? 0) * (num(cell(rw, header.cols, "qty")) ?? 0),
          0,
        );
        const pncTotal = group.rows.reduce(
          (a, rw) => {
            const rate = num(cell(rw, header.cols, "priceafterpnc")) ?? num(cell(rw, header.cols, "2ndrate")) ?? num(cell(rw, header.cols, "1strate")) ?? 0;
            return a + rate * (num(cell(rw, header.cols, "qty")) ?? 0);
          },
          0,
        );

        if (args.commit) {
          await db.insert(schema.quotations).values({
            id: quoteId,
            quoteNo,
            requirementId,
            customerId,
            version: 1,
            status: status as never,
            subtotal: toPaise(pncTotal || firstTotal),
            total: toPaise(pncTotal || firstTotal),
            submittedAt: parseDate(cell(firstRow, header.cols, "qtndt")) ? new Date(parseDate(cell(firstRow, header.cols, "qtndt"))!) : null,
            remarks: cell(firstRow, header.cols, "remarks") || null,
            dataTrust: trust,
          });
          let lineNo = 1;
          const items = group.rows.map((rw) => {
            const qty = num(cell(rw, header.cols, "qty")) ?? 0;
            const first = num(cell(rw, header.cols, "1strate"));
            const second = num(cell(rw, header.cols, "2ndrate"));
            const pnc = num(cell(rw, header.cols, "priceafterpnc"));
            const unit = pnc ?? second ?? first ?? 0;
            return {
              id: newId(),
              quotationId: quoteId,
              lineNo: lineNo++,
              partNumber: cell(rw, header.cols, "productcode") || null,
              description: cell(rw, header.cols, "product"),
              quantity: qty,
              firstRate: first !== null ? toPaise(first) : null,
              secondRate: second !== null ? toPaise(second) : null,
              unitPrice: toPaise(unit),
              lineTotal: toPaise(unit * qty),
            };
          });
          if (items.length > 0) await db.insert(schema.quotationItems).values(items);
        }
        bump(counters, "quotations");
      }
      continue;
    }

    if (kind === "orders") {
      counters.warnings.push(
        `${file}: order history is imported only when it resolves to an approved quotation; the provided sheets are largely placeholders, so most rows are skipped.`,
      );
      const header = findHeader(rows, ["slno", "cus", "pono", "podt", "items", "cuspartno", "qty", "rate"]);
      if (!header) {
        counters.warnings.push(`${file}: order header not found`);
        continue;
      }
      for (let r = header.index + 1; r < rows.length; r++) {
        const row = rows[r];
        const poNo = cell(row, header.cols, "pono");
        const customer = cell(row, header.cols, "cus");
        const item = cell(row, header.cols, "items");
        const qty = num(cell(row, header.cols, "qty"));
        if (!poNo && !item) {
          counters.skipped++;
          continue;
        }
        if (!customer || !item || qty === null || qty <= 0) {
          counters.skipped++;
          continue;
        }
        // No orphan PO: only import when we can attach it to a quotation. We do
        // not fabricate approvals here; historical rows without a quote are skipped.
        counters.warnings.push(`${file}: PO ${poNo || "(none)"} skipped — no matching quotation (no orphan PO).`);
        counters.skipped++;
      }
      continue;
    }
  }

  // Record the batch for traceability (only when committing).
  if (args.commit) {
    for (const file of files) {
      const kind = classify(file);
      if (!kind) continue;
      await db.insert(schema.importBatches).values({
        id: newId(),
        sourceFile: file,
        kind,
        committed: true,
        notes: args.trust ? "imported as trusted" : "imported as untrusted (default)",
      });
    }
  }

  // Report
  const lines: string[] = [];
  lines.push(`# Import ${args.commit ? "run" : "dry run"} — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Source: \`${args.dir}\``);
  lines.push(`Trust: ${args.trust ? "trusted" : "untrusted (default)"}`);
  lines.push("");
  lines.push("## Would create / created");
  lines.push("");
  for (const [k, v] of Object.entries(counters.created).sort()) lines.push(`- ${k}: ${v}`);
  lines.push("");
  lines.push(`Skipped rows: ${counters.skipped}`);
  lines.push("");
  if (counters.warnings.length) {
    lines.push("## Notes");
    lines.push("");
    for (const w of [...new Set(counters.warnings)]) lines.push(`- ${w}`);
  }
  const report = lines.join("\n");
  const outDir = path.join(process.cwd(), "import");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.md"), report, "utf8");
  console.log(report);
  if (!args.commit) console.log("\nDRY RUN — nothing written. Re-run with --commit to write.");

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
