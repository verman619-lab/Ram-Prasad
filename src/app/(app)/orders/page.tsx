import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, oems, orders, quotations } from "@/db/schema";
import { formatDate, daysUntil } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { Card, ErrorState, PageHeader, Table } from "@/components/ui";
import { OrderStatusBadge, RiskBadge, labelize } from "@/components/status";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  await requireUser();
  const { scope } = await searchParams;

  let rows;
  try {
    const db = await getDb();
    rows = await db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        poNumber: orders.poNumber,
        poDate: orders.poDate,
        status: orders.status,
        poValue: orders.poValue,
        deliveryDeadline: orders.deliveryDeadline,
        customer: customers.name,
        oem: oems.name,
        quoteNo: quotations.quoteNo,
        requested: sql<number>`coalesce((select sum(oi.quantity) from order_items oi where oi.order_id = ${orders.id}), 0)`,
        delivered: sql<number>`coalesce((select sum(d.quantity_delivered) from deliveries d where d.order_id = ${orders.id} and d.status = 'delivered'), 0)`,
        accepted: sql<number>`coalesce((select sum(d.quantity_delivered) from deliveries d where d.order_id = ${orders.id} and d.acceptance_status = 'accepted'), 0)`,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(oems, eq(oems.id, orders.oemId))
      .innerJoin(quotations, eq(quotations.id, orders.quotationId))
      .orderBy(desc(orders.createdAt))
      .limit(300);
  } catch (err) {
    return <ErrorState title="Could not load orders" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const filtered = rows.filter((r) => {
    if (scope === "open") return ["open", "processing"].includes(r.status);
    if (scope === "risk") {
      if (!["open", "processing"].includes(r.status)) return false;
      if (!r.deliveryDeadline) return true;
      return daysUntil(r.deliveryDeadline) <= 7;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Orders & fulfilment"
        subtitle="Every PO maps to an approved quotation. Partial deliveries and payments are normal; balances stay visible."
      />

      <Card className="mb-3">
        <div className="flex items-center gap-3">
          {[
            ["", "All"],
            ["open", "Open / processing"],
            ["risk", "At delivery risk"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={value ? `/orders?scope=${value}` : "/orders"}
              className={
                "rounded-md px-3 py-1.5 text-[13px] font-medium " +
                ((scope ?? "") === value ? "bg-[#eef2ff] text-[var(--brand)]" : "text-[#475467] hover:bg-[#f2f4f7]")
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </Card>

      <Table
        head={["Order", "Customer", "PO", "OEM", "Status", "Value", "Deadline", "Requested", "Delivered", "Accepted", ""]}
        empty="No orders yet. Approve a quotation and convert it."
      >
        {filtered.map((o) => {
          const risk =
            !o.deliveryDeadline
              ? "unknown"
              : daysUntil(o.deliveryDeadline) < 0
                ? "late"
                : daysUntil(o.deliveryDeadline) <= 3
                  ? "at_risk"
                  : "on_track";
          return (
            <tr key={o.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[#fafbfc]">
              <td className="px-3 py-2">
                <Link className="font-semibold text-[var(--brand)]" href={`/orders/${o.id}`}>
                  {o.orderNo}
                </Link>
                <div className="text-[11px] text-[var(--muted)]">from {o.quoteNo}</div>
              </td>
              <td className="px-3 py-2">{o.customer}</td>
              <td className="px-3 py-2">
                {o.poNumber ?? "—"}
                <div className="text-[11px] text-[var(--muted)]">{formatDate(o.poDate)}</div>
              </td>
              <td className="px-3 py-2">{o.oem ?? "—"}</td>
              <td className="px-3 py-2">
                <OrderStatusBadge status={o.status} />
              </td>
              <td className="px-3 py-2 text-right">{formatINR(o.poValue)}</td>
              <td className="px-3 py-2">
                {formatDate(o.deliveryDeadline)}
                <div className="mt-0.5">
                  <RiskBadge level={risk} />
                </div>
              </td>
              <td className="px-3 py-2 text-right">{o.requested}</td>
              <td className="px-3 py-2 text-right">{o.delivered}</td>
              <td className="px-3 py-2 text-right">{o.accepted}</td>
              <td className="px-3 py-2">
                <Link className="text-[12px] text-[var(--brand)]" href={`/orders/${o.id}`}>
                  Open →
                </Link>
              </td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        {filtered.length} order(s){scope ? ` · filter: ${labelize(scope)}` : ""}
      </p>
    </div>
  );
}
