import Link from "next/link";
import { getDb } from "@/db";
import { getSettings } from "@/lib/settings";
import { listRequirements } from "@/lib/requirements";
import { formatDate } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { Card, ErrorState, PageHeader, Table } from "@/components/ui";
import { RequirementStatusBadge, labelize } from "@/components/status";

export const dynamic = "force-dynamic";

const STATUSES = ["received", "qualifying", "quoted", "submitted", "won", "lost", "cancelled"];

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; error?: string }>;
}) {
  await requireUser();
  const { status, q, error } = await searchParams;

  let rows;
  try {
    const db = await getDb();
    await getSettings(db);
    rows = await listRequirements(db, { status, q });
  } catch (err) {
    return (
      <ErrorState title="Could not load requirements" detail={err instanceof Error ? err.message : String(err)} />
    );
  }

  return (
    <div>
      <PageHeader
        title="Requirements / RFI"
        subtitle="One requirement, one record, one timeline. Everything else hangs off this."
        actions={<Link className="btn btn-primary" href="/requirements/new">New requirement</Link>}
      />

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}

      <Card className="mb-3">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="block">
            <span className="label">Search</span>
            <input className="input w-64" name="q" defaultValue={q ?? ""} placeholder="ref, part number, project, GeM no." />
          </label>
          <label className="block">
            <span className="label">Status</span>
            <select className="input w-44" name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labelize(s)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost" type="submit">
            Filter
          </button>
          {(status || q) && (
            <Link className="text-[12px] text-[var(--brand)]" href="/requirements">
              Clear
            </Link>
          )}
        </form>
      </Card>

      <Table
        head={["Ref", "Customer / project", "Status", "Lines", "Qty", "Quotes", "Enquiry", "Deadline", "Delivery due"]}
        empty="No requirements match. Create one to get started."
      >
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[#fafbfc]">
            <td className="px-3 py-2">
              <Link className="font-semibold text-[var(--brand)]" href={`/requirements/${r.id}`}>
                {r.refNo}
              </Link>
              {r.title && <div className="text-[11px] text-[var(--muted)]">{r.title}</div>}
            </td>
            <td className="px-3 py-2">
              <div>{r.customer}</div>
              <div className="text-[11px] text-[var(--muted)]">{r.projectName ?? "—"}</div>
            </td>
            <td className="px-3 py-2">
              <RequirementStatusBadge status={r.status} />
            </td>
            <td className="px-3 py-2 text-right">{r.itemCount}</td>
            <td className="px-3 py-2 text-right">{r.totalQuantity}</td>
            <td className="px-3 py-2 text-right">{r.quoteCount}</td>
            <td className="px-3 py-2">{formatDate(r.enquiryDate)}</td>
            <td className="px-3 py-2">{formatDate(r.submissionDeadline)}</td>
            <td className="px-3 py-2">{formatDate(r.requiredDeliveryDate)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
