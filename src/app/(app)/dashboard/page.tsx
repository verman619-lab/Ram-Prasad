import Link from "next/link";
import { getDb } from "@/db";
import { getDashboardData } from "@/lib/dashboard";
import { generateFollowUps } from "@/lib/followups";
import { formatDate } from "@/lib/dates";
import { formatINR, formatINRCompact } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { Card, ErrorState, PageHeader, StatCard, Table } from "@/components/ui";
import { RequirementStatusBadge, RiskBadge, labelize } from "@/components/status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();

  let data;
  try {
    const db = await getDb();
    // Idempotent rule sweep so the morning view reflects fresh follow-ups.
    try {
      await generateFollowUps(db);
    } catch (err) {
      console.error("[followups] sweep failed", err);
    }
    data = await getDashboardData(db);
  } catch (err) {
    return (
      <ErrorState
        title="Could not load the dashboard"
        detail={err instanceof Error ? err.message : String(err)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Morning view"
        subtitle="Open orders, quotes awaiting a response, delivery risk, payments, OEM responses and expiring documents."
        actions={
          <>
            <Link className="btn btn-ghost" href="/requirements/new">
              New requirement
            </Link>
            <Link className="btn btn-primary" href="/ask">
              Ask a question
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open orders"
          value={data.openOrders}
          hint={`${formatINRCompact(data.totals.openOrderValue)} in open order value`}
          href="/orders?scope=open"
          tone="blue"
        />
        <StatCard
          label="Active requirements"
          value={data.activeRequirements}
          hint="received → qualifying → quoted → submitted"
          href="/requirements"
          tone="violet"
        />
        <StatCard
          label="Won this month"
          value={data.wonThisMonth}
          hint={`${data.lostThisMonth} lost this month`}
          href="/requirements?status=won"
          tone="green"
        />
        <StatCard
          label="Payments outstanding"
          value={formatINRCompact(data.totals.outstandingPayments)}
          hint={`${data.paymentsPending.length} invoice(s) with a balance`}
          href="/orders"
          tone="amber"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title={`Orders at delivery risk (${data.deliveryRisk.length})`}
          action={<Link className="text-[12px] text-[var(--brand)]" href="/orders?scope=risk">View all</Link>}
        >
          <Table
            head={["Order", "Customer", "Deadline", "", ""]}
            empty="No open order is at delivery risk."
          >
            {data.deliveryRisk.map((o) => (
              <tr key={o.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2">
                  <Link className="font-medium text-[var(--brand)]" href={`/orders/${o.id}`}>
                    {o.orderNo}
                  </Link>
                  <div className="text-[11px] text-[var(--muted)]">{o.poNumber ?? "no PO no."}</div>
                </td>
                <td className="px-3 py-2">{o.customer}</td>
                <td className="px-3 py-2">{formatDate(o.deadline)}</td>
                <td className="px-3 py-2">
                  <span className="text-[12px] text-[var(--muted)]">
                    {o.daysToDeadline === null
                      ? "no deadline"
                      : o.daysToDeadline < 0
                        ? `${Math.abs(o.daysToDeadline)}d overdue`
                        : `${o.daysToDeadline}d left`}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <RiskBadge level={o.daysToDeadline !== null && o.daysToDeadline < 0 ? "late" : "at_risk"} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card
          title={`Quotes awaiting a response (${data.quotesAwaitingResponse.length})`}
          action={<Link className="text-[12px] text-[var(--brand)]" href="/quotations">View all</Link>}
        >
          <Table head={["Quote", "Customer", "Status", "Value"]} empty="No quotes are awaiting a response.">
            {data.quotesAwaitingResponse.map((q) => (
              <tr key={q.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2">
                  <Link className="font-medium text-[var(--brand)]" href={`/quotations/${q.id}`}>
                    {q.quoteNo}
                  </Link>
                  <div className="text-[11px] text-[var(--muted)]">{q.requirementRef}</div>
                </td>
                <td className="px-3 py-2">{q.customer}</td>
                <td className="px-3 py-2">{labelize(q.status)}</td>
                <td className="px-3 py-2 text-right">{formatINR(q.total)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`Payments pending (${data.paymentsPending.length})`}>
          <Table head={["Invoice", "Customer", "Due", "Balance"]} empty="No pending payments.">
            {data.paymentsPending.map((p) => (
              <tr key={p.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2 font-medium">{p.invoiceNo}</td>
                <td className="px-3 py-2">{p.customer}</td>
                <td className="px-3 py-2">
                  {formatDate(p.dueDate)}
                  {p.overdueDays > 0 && (
                    <span className="ml-1 text-[11px] font-semibold text-red-600">
                      {p.overdueDays}d overdue
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{formatINR(p.balance)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`OEM responses pending (${data.oemResponsesPending.length})`}>
          <Table head={["OEM", "Requirement", "Requested"]} empty="No OEM responses are pending.">
            {data.oemResponsesPending.map((r) => (
              <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2 font-medium">{r.oem}</td>
                <td className="px-3 py-2">{r.requirementRef}</td>
                <td className="px-3 py-2">{formatDate(new Date(r.requestedAt).toISOString().slice(0, 10))}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`Documents expiring (${data.documentsExpiring.length})`}>
          <Table head={["Document", "Type", "Expiry", ""]} empty="No documents expire in the next 90 days.">
            {data.documentsExpiring.map((d) => (
              <tr key={d.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2 font-medium">{d.title}</td>
                <td className="px-3 py-2">{labelize(d.docType)}</td>
                <td className="px-3 py-2">{formatDate(d.expiryDate)}</td>
                <td className="px-3 py-2 text-right text-[12px]">
                  {d.daysLeft !== null && d.daysLeft < 0 ? (
                    <span className="font-semibold text-red-600">expired</span>
                  ) : (
                    <span className="text-amber-700">{d.daysLeft}d</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`Follow-ups due (${data.followUpsDue.length})`}>
          <Table head={["Task", "Type", "Due"]} empty="No open follow-up tasks.">
            {data.followUpsDue.map((t) => (
              <tr key={t.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2 font-medium">{t.title}</td>
                <td className="px-3 py-2">{labelize(t.type)}</td>
                <td className="px-3 py-2">{formatDate(new Date(t.dueAt).toISOString().slice(0, 10))}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Requirements by status" className="lg:col-span-2">
          <div className="flex flex-wrap gap-3">
            {data.requirementsByStatus.length === 0 && (
              <p className="text-[13px] text-[var(--muted)]">No requirements captured yet.</p>
            )}
            {data.requirementsByStatus.map((r) => (
              <Link
                key={r.status}
                href={`/requirements?status=${r.status}`}
                className="flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 hover:border-[#c7cdd6]"
              >
                <RequirementStatusBadge status={r.status} />
                <span className="text-lg font-semibold">{r.count}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
