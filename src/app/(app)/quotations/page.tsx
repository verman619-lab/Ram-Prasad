import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, quotations, requirements } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { Card, ErrorState, PageHeader, Table } from "@/components/ui";
import { QuoteStatusBadge, labelize } from "@/components/status";

export const dynamic = "force-dynamic";

const STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "submitted",
  "clarification_requested",
  "technical_clarification",
  "commercial_negotiation",
  "awaiting_approval",
  "won",
  "lost",
  "cancelled",
  "superseded",
];

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const { status } = await searchParams;

  let rows;
  try {
    const db = await getDb();
    rows = await db
      .select({
        id: quotations.id,
        quoteNo: quotations.quoteNo,
        version: quotations.version,
        status: quotations.status,
        total: quotations.total,
        marginPercent: quotations.marginPercent,
        submittedAt: quotations.submittedAt,
        createdAt: quotations.createdAt,
        customer: customers.name,
        requirementRef: requirements.refNo,
        requirementId: requirements.id,
        requirementStatus: requirements.status,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(requirements, eq(requirements.id, quotations.requirementId))
      .where(status ? and(eq(quotations.status, status as never)) : undefined)
      .orderBy(desc(quotations.createdAt))
      .limit(300);
  } catch (err) {
    return <ErrorState title="Could not load quotations" detail={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Every quotation comes from an RFI. Prices are versioned and approved, never final automatically."
      />

      <Card className="mb-3">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="block">
            <span className="label">Status</span>
            <select className="input w-56" name="status" defaultValue={status ?? ""}>
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
          {status && (
            <Link className="text-[12px] text-[var(--brand)]" href="/quotations">
              Clear
            </Link>
          )}
        </form>
      </Card>

      <Table
        head={["Quote", "Requirement", "Customer", "Ver", "Status", "Value", "Margin", "Submitted"]}
        empty="No quotations yet. Open a requirement and build one."
      >
        {rows.map((q) => (
          <tr key={q.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[#fafbfc]">
            <td className="px-3 py-2">
              <Link className="font-semibold text-[var(--brand)]" href={`/quotations/${q.id}`}>
                {q.quoteNo}
              </Link>
            </td>
            <td className="px-3 py-2">
              <Link className="text-[var(--brand)]" href={`/requirements/${q.requirementId}`}>
                {q.requirementRef}
              </Link>
              <div className="text-[11px] text-[var(--muted)]">{labelize(q.requirementStatus)}</div>
            </td>
            <td className="px-3 py-2">{q.customer}</td>
            <td className="px-3 py-2">v{q.version}</td>
            <td className="px-3 py-2">
              <QuoteStatusBadge status={q.status} />
            </td>
            <td className="px-3 py-2 text-right">{formatINR(q.total)}</td>
            <td className="px-3 py-2 text-right">{q.marginPercent !== null ? `${q.marginPercent.toFixed(1)}%` : "—"}</td>
            <td className="px-3 py-2">{q.submittedAt ? formatDate(new Date(q.submittedAt).toISOString().slice(0, 10)) : "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
