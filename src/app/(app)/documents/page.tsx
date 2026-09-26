import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, documents, oems, requirements } from "@/db/schema";
import { addDaysISO, daysUntil, formatDate, todayISO } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, ErrorState, PageHeader, Table } from "@/components/ui";
import { labelize } from "@/components/status";
import { addDocumentAction } from "@/app/actions/orders";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const DOC_TYPES = [
  "tender_document",
  "technical_drawing",
  "technical_specification",
  "test_certificate",
  "compliance_certificate",
  "rfq",
  "quotation",
  "purchase_order",
  "invoice",
  "delivery_challan",
  "lr_copy",
  "payment_proof",
  "pdi_report",
  "approval_certificate",
  "other",
];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { filter, error } = await searchParams;

  let rows;
  let oemOptions: Array<{ id: string; name: string }> = [];
  let customerOptions: Array<{ id: string; name: string }> = [];
  let requirementOptions: Array<{ id: string; refNo: string }> = [];
  let warnDays = 90;
  try {
    const db = await getDb();
    const settings = await getSettings(db);
    warnDays = Number.parseInt(settings.document_expiry_warning_days ?? "90", 10) || 90;

    const base = db
      .select({
        id: documents.id,
        title: documents.title,
        docType: documents.docType,
        source: documents.source,
        issueDate: documents.issueDate,
        expiryDate: documents.expiryDate,
        fileRef: documents.fileRef,
        approvalStatus: documents.approvalStatus,
        oem: oems.name,
        customer: customers.name,
        requirementRef: requirements.refNo,
        requirementId: requirements.id,
      })
      .from(documents)
      .leftJoin(oems, eq(oems.id, documents.supplierOemId))
      .leftJoin(customers, eq(customers.id, documents.customerId))
      .leftJoin(requirements, eq(requirements.id, documents.linkedRequirementId))
      .orderBy(asc(documents.expiryDate));

    rows = await base;
    [oemOptions, customerOptions, requirementOptions] = await Promise.all([
      db.select({ id: oems.id, name: oems.name }).from(oems).orderBy(asc(oems.name)),
      db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name)),
      db
        .select({ id: requirements.id, refNo: requirements.refNo })
        .from(requirements)
        .orderBy(asc(requirements.refNo)),
    ]);
  } catch (err) {
    return <ErrorState title="Could not load documents" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const in90 = addDaysISO(todayISO(), warnDays);
  const filtered = rows.filter((d) => {
    if (filter === "expiring") return d.expiryDate !== null && d.expiryDate <= in90;
    if (filter === "expired") return d.expiryDate !== null && daysUntil(d.expiryDate) < 0;
    if (filter === "valid") return d.expiryDate === null || d.expiryDate > in90;
    return true;
  });

  const editable = can(user.role, "manage_documents");

  return (
    <div>
      <PageHeader
        title="Documents & compliance vault"
        subtitle="Type, supplier, issue and expiry dates, linked product and requirement, with expiry reminders."
      />

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}

      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-3">
          {[
            ["", "All"],
            ["expiring", `Expiring in ${warnDays} days`],
            ["expired", "Expired"],
            ["valid", "Valid"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={value ? `/documents?filter=${value}` : "/documents"}
              className={
                "rounded-md px-3 py-1.5 text-[13px] font-medium " +
                ((filter ?? "") === value ? "bg-[#eef2ff] text-[var(--brand)]" : "text-[#475467] hover:bg-[#f2f4f7]")
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </Card>

      <Table
        head={["Title", "Type", "Source", "Supplier / customer", "Linked", "Issued", "Expires", "Approval"]}
        empty="No documents. Add one below."
      >
        {filtered.map((d) => {
          const expired = d.expiryDate ? daysUntil(d.expiryDate) < 0 : false;
          const expiring = d.expiryDate ? !expired && d.expiryDate <= in90 : false;
          return (
            <tr key={d.id} className="border-b border-[var(--line)] last:border-0">
              <td className="px-3 py-2 font-medium">
                {d.title}
                {d.fileRef && <div className="text-[11px] text-[var(--muted)]">{d.fileRef}</div>}
              </td>
              <td className="px-3 py-2">{labelize(d.docType)}</td>
              <td className="px-3 py-2">{labelize(d.source)}</td>
              <td className="px-3 py-2">{d.oem ?? d.customer ?? "—"}</td>
              <td className="px-3 py-2">
                {d.requirementRef ? (
                  <Link className="text-[var(--brand)]" href={`/requirements/${d.requirementId}`}>
                    {d.requirementRef}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">{formatDate(d.issueDate)}</td>
              <td className="px-3 py-2">
                {formatDate(d.expiryDate)}
                {expired && <Badge tone="red" className="ml-1">Expired</Badge>}
                {expiring && <Badge tone="amber" className="ml-1">{daysUntil(d.expiryDate!)}d</Badge>}
              </td>
              <td className="px-3 py-2">{labelize(d.approvalStatus)}</td>
            </tr>
          );
        })}
      </Table>

      {editable && (
        <Card title="Add a document" className="mt-4">
          <form action={addDocumentAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <label className="block">
              <span className="label">Title *</span>
              <input className="input" name="title" required />
            </label>
            <label className="block">
              <span className="label">Type</span>
              <select className="input" name="docType" defaultValue="other">
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Source (measures where the week goes)</span>
              <select className="input" name="source" defaultValue="manual">
                <option value="generated">Generated from data</option>
                <option value="reused">Reused</option>
                <option value="oem_supplied">Obtained from OEM</option>
                <option value="manual">Prepared by hand</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Supplier OEM</span>
              <select className="input" name="supplierOemId" defaultValue="">
                <option value="">—</option>
                {oemOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Customer</span>
              <select className="input" name="customerId" defaultValue="">
                <option value="">—</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Linked requirement</span>
              <select className="input" name="linkedRequirementId" defaultValue="">
                <option value="">—</option>
                {requirementOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.refNo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Issue date</span>
              <input className="input" type="date" name="issueDate" />
            </label>
            <label className="block">
              <span className="label">Expiry date</span>
              <input className="input" type="date" name="expiryDate" />
            </label>
            <label className="block">
              <span className="label">Approval status</span>
              <select className="input" name="approvalStatus" defaultValue="none">
                <option value="none">None</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="block">
              <span className="label">File reference / path</span>
              <input className="input" name="fileRef" placeholder="path or URL" />
            </label>
            <div className="flex items-end">
              <button className="btn btn-primary" type="submit">
                Add document
              </button>
            </div>
          </form>
        </Card>
      )}

      <p className="mt-2 text-[11px] text-[var(--muted)]">
        {filtered.length} document(s) shown · {rows.length} total in the vault.
      </p>
    </div>
  );
}
