"use client";

import { useMemo, useState } from "react";

export interface Option {
  id: string;
  name: string;
}

interface Line {
  key: string;
  partNumber: string;
  clientPartNumber: string;
  oemPartNumber: string;
  description: string;
  quantity: string;
  uom: string;
  requiredDeliveryDate: string;
  technicalSpecs: string;
}

function blankLine(): Line {
  return {
    key: crypto.randomUUID(),
    partNumber: "",
    clientPartNumber: "",
    oemPartNumber: "",
    description: "",
    quantity: "",
    uom: "Nos",
    requiredDeliveryDate: "",
    technicalSpecs: "",
  };
}

const MAX_LINES = 500;

export function RequirementForm({
  customers,
  users,
  action,
}: {
  customers: Option[];
  users: Option[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [bulk, setBulk] = useState("");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const parsed = useMemo(() => JSON.stringify(
    lines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l) => ({
        partNumber: l.partNumber,
        clientPartNumber: l.clientPartNumber,
        oemPartNumber: l.oemPartNumber,
        description: l.description,
        quantity: Number(l.quantity),
        uom: l.uom,
        requiredDeliveryDate: l.requiredDeliveryDate,
        technicalSpecs: l.technicalSpecs,
      })),
  ), [lines]);

  function update(key: string, field: keyof Line, value: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    if (lines.length >= MAX_LINES) return;
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function parseBulk() {
    const rows = bulk
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (rows.length === 0) {
      setBulkMessage("Nothing to parse.");
      return;
    }
    const next: Line[] = [];
    let skipped = 0;
    for (const row of rows) {
      const cols = row.includes("|")
        ? row.split("|")
        : row.includes("\t")
          ? row.split("\t")
          : row.split(",");
      const [partNumber = "", description = "", qty = "", uom = "", delivery = ""] = cols.map((c) => c.trim());
      const quantity = Number(qty);
      if (!description || !Number.isFinite(quantity) || quantity <= 0) {
        skipped++;
        continue;
      }
      next.push({
        key: crypto.randomUUID(),
        partNumber,
        clientPartNumber: "",
        oemPartNumber: "",
        description,
        quantity: String(quantity),
        uom: uom || "Nos",
        requiredDeliveryDate: delivery,
        technicalSpecs: "",
      });
    }
    if (next.length === 0) {
      setBulkMessage(`Parsed 0 lines. Expected: partNumber | description | qty | uom | deliveryDate`);
      return;
    }
    setLines(next.slice(0, MAX_LINES));
    setBulkMessage(`Parsed ${next.length} line(s)${skipped ? `, skipped ${skipped}` : ""}. Review below.`);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="items" value={parsed} />

      <section className="rounded-lg border border-[var(--line)] bg-white p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-[#344054]">Enquiry details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="label">Customer / agency *</span>
            <select className="input" name="customerId" required defaultValue="">
              <option value="" disabled>
                Select customer
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Title / subject</span>
            <input className="input" name="title" placeholder="e.g. LCA power panel supply" />
          </label>
          <label className="block">
            <span className="label">Project name</span>
            <input className="input" name="projectName" placeholder="LCA / Radar / Shelter" />
          </label>
          <label className="block">
            <span className="label">Source of enquiry</span>
            <select className="input" name="source" defaultValue="direct">
              <option value="gem">GeM</option>
              <option value="client_portal">Client portal</option>
              <option value="direct">Direct enquiry</option>
              <option value="oem">OEM</option>
              <option value="srm">SRM</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label className="block">
            <span className="label">GeM tender number</span>
            <input className="input" name="gemTenderNo" />
          </label>
          <label className="block">
            <span className="label">Bid type</span>
            <select className="input" name="bidType" defaultValue="">
              <option value="">—</option>
              <option value="single">Single bid</option>
              <option value="double">Double bid</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Submission type</span>
            <select className="input" name="submissionType" defaultValue="">
              <option value="">—</option>
              <option value="hard">Hard copy</option>
              <option value="soft">Soft copy</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Enquiry no.</span>
            <input className="input" name="enquiryNo" />
          </label>
          <label className="block">
            <span className="label">Enquiry date</span>
            <input className="input" type="date" name="enquiryDate" />
          </label>
          <label className="block">
            <span className="label">Submission deadline</span>
            <input className="input" type="date" name="submissionDeadline" />
          </label>
          <label className="block">
            <span className="label">Required delivery date</span>
            <input className="input" type="date" name="requiredDeliveryDate" />
          </label>
          <label className="block">
            <span className="label">Quotation validity</span>
            <input className="input" name="quotationValidity" placeholder="e.g. 90 days" />
          </label>
          <label className="block">
            <span className="label">Approval requirements</span>
            <input className="input" name="approvalRequirements" placeholder="RCMA / CEMILAC / LCSO / MIL" />
          </label>
          <label className="block">
            <span className="label">Assigned to</span>
            <select className="input" name="assignedUserId" defaultValue="">
              <option value="">Me (default)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5">
            <input type="checkbox" name="staggeredDelivery" />
            <span className="text-[13px]">Staggered delivery</span>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">MOQ notes</span>
            <input className="input" name="moqNotes" />
          </label>
          <label className="block">
            <span className="label">Remarks</span>
            <input className="input" name="remarks" />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line)] bg-white p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-[#344054]">
          Line items ({lines.length} of {MAX_LINES})
        </h2>
        <div className="overflow-x-auto">
          <table className="text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-[#475467]">
                <th className="px-2 py-1">Part no.</th>
                <th className="px-2 py-1">Client part no.</th>
                <th className="px-2 py-1">OEM part no.</th>
                <th className="px-2 py-1">Description *</th>
                <th className="px-2 py-1">Qty *</th>
                <th className="px-2 py-1">UoM</th>
                <th className="px-2 py-1">Required by</th>
                <th className="px-2 py-1">Specs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.key} className="border-t border-[var(--line)]">
                  <td className="px-1 py-1">
                    <input className="input w-28" value={l.partNumber} onChange={(e) => update(l.key, "partNumber", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="input w-28" value={l.clientPartNumber} onChange={(e) => update(l.key, "clientPartNumber", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="input w-28" value={l.oemPartNumber} onChange={(e) => update(l.key, "oemPartNumber", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="input min-w-56" value={l.description} onChange={(e) => update(l.key, "description", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className="input w-20"
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) => update(l.key, "quantity", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input className="input w-16" value={l.uom} onChange={(e) => update(l.key, "uom", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="input w-36" type="date" value={l.requiredDeliveryDate} onChange={(e) => update(l.key, "requiredDeliveryDate", e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="input min-w-40" value={l.technicalSpecs} onChange={(e) => update(l.key, "technicalSpecs", e.target.value)} />
                  </td>
                  <td className="px-1 py-1 text-right">
                    <button
                      type="button"
                      className="btn btn-ghost px-2 py-1"
                      onClick={() => removeLine(l.key)}
                      aria-label={`Remove line ${idx + 1}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="btn btn-ghost" onClick={addLine}>
            Add line
          </button>
          <span className="text-[12px] text-[var(--muted)]">
            {lines.filter((l) => l.description.trim() && Number(l.quantity) > 0).length} valid line(s) will be saved.
          </span>
        </div>

        <details className="mt-3 rounded border border-[var(--line)] p-3">
          <summary className="cursor-pointer text-[13px] font-medium">
            Bulk paste up to 500 part numbers
          </summary>
          <p className="mt-2 text-[12px] text-[var(--muted)]">
            One line per item. Format: <code>partNumber | description | qty | uom | deliveryDate</code>. Tab or comma
            separated also works (e.g. pasted from Excel).
          </p>
          <textarea
            className="input mt-2 h-40 font-mono text-[12px]"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"1140 043 042 82 | EM Mast | 26 | Nos | 2026-12-31\n3843 166 601 28 | Shelter Lifting Jack | 1 | Nos | 2026-11-15"}
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" className="btn btn-ghost" onClick={parseBulk}>
              Parse into lines
            </button>
            {bulkMessage && <span className="text-[12px] text-[var(--muted)]">{bulkMessage}</span>}
          </div>
        </details>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" type="submit">
          Create requirement
        </button>
        <a className="btn btn-ghost" href="/requirements">
          Cancel
        </a>
      </div>
    </form>
  );
}
