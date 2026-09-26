import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { oems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, ErrorState, PageHeader, Table } from "@/components/ui";
import { labelize } from "@/components/status";
import { createOemAction } from "@/app/actions/oems";

export const dynamic = "force-dynamic";

export default async function OemsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;

  let rows;
  try {
    const db = await getDb();
    rows = await db
      .select({
        id: oems.id,
        name: oems.name,
        location: oems.location,
        countryOfOrigin: oems.countryOfOrigin,
        spoc: oems.spoc,
        email: oems.email,
        leadTimeDays: oems.leadTimeDays,
        commissionPercent: oems.commissionPercent,
        approved: oems.approved,
        productPortfolio: oems.productPortfolio,
        capabilities: sql<number>`(select count(*)::int from oem_capabilities c where c.oem_id = ${oems.id})`,
        orderCount: sql<number>`(select count(*)::int from orders o where o.oem_id = ${oems.id})`,
      })
      .from(oems)
      .orderBy(asc(oems.name));
  } catch (err) {
    return <ErrorState title="Could not load OEM master" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const editable = can(user.role, "manage_requirements");

  return (
    <div>
      <PageHeader
        title="OEM master & sourcing"
        subtitle="Approved or not, capabilities, lead times, commission and compliance. No OEM is chosen for an order without human approval."
      />

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}

      {editable && (
        <Card title="Add an OEM" className="mb-4">
          <form action={createOemAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label className="block">
              <span className="label">OEM name *</span>
              <input className="input" name="name" required />
            </label>
            <label className="block">
              <span className="label">Location</span>
              <input className="input" name="location" />
            </label>
            <label className="block">
              <span className="label">Country of origin</span>
              <input className="input" name="countryOfOrigin" />
            </label>
            <label className="block">
              <span className="label">SPOC</span>
              <input className="input" name="spoc" />
            </label>
            <label className="block">
              <span className="label">Email</span>
              <input className="input" name="email" />
            </label>
            <label className="block">
              <span className="label">Lead time (days)</span>
              <input className="input" name="leadTimeDays" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="label">Commission %</span>
              <input className="input" name="commissionPercent" inputMode="decimal" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Product portfolio</span>
              <input className="input" name="productPortfolio" />
            </label>
            <div className="flex items-end">
              <button className="btn btn-primary" type="submit">
                Add OEM
              </button>
            </div>
          </form>
        </Card>
      )}

      <Table
        head={["OEM", "Location", "SPOC", "Lead time", "Commission", "Capabilities", "Orders", "Status", ""]}
        empty="No OEMs yet. Add one above."
      >
        {rows.map((o) => (
          <tr key={o.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[#fafbfc]">
            <td className="px-3 py-2">
              <Link className="font-semibold text-[var(--brand)]" href={`/oems/${o.id}`}>
                {o.name}
              </Link>
              <div className="text-[11px] text-[var(--muted)]">{o.productPortfolio ?? "—"}</div>
            </td>
            <td className="px-3 py-2">
              {o.location ?? "—"}
              <div className="text-[11px] text-[var(--muted)]">{o.countryOfOrigin ?? ""}</div>
            </td>
            <td className="px-3 py-2">{o.spoc ?? "—"}</td>
            <td className="px-3 py-2">{o.leadTimeDays ? `${o.leadTimeDays} d` : "—"}</td>
            <td className="px-3 py-2">{o.commissionPercent !== null ? `${o.commissionPercent}%` : "—"}</td>
            <td className="px-3 py-2 text-right">{o.capabilities}</td>
            <td className="px-3 py-2 text-right">{o.orderCount}</td>
            <td className="px-3 py-2">
              <Badge tone={o.approved ? "green" : "gray"}>{o.approved ? "Approved" : "Not approved"}</Badge>
            </td>
            <td className="px-3 py-2">
              <Link className="text-[12px] text-[var(--brand)]" href={`/oems/${o.id}`}>
                Open →
              </Link>
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-[11px] text-[var(--muted)]">{rows.length} OEM(s) · {labelize("master")}</p>
    </div>
  );
}
