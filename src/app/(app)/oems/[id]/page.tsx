import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  complianceCertificates,
  customers,
  deliveries,
  oemCapabilities,
  oemCapacityDeclarations,
  oemContacts,
  oems,
  orders,
  pdiRecords,
} from "@/db/schema";
import { formatDate, daysUntil } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Badge, Card, ErrorState, KeyValue, PageHeader, Table } from "@/components/ui";
import { labelize } from "@/components/status";
import {
  addCapabilityAction,
  addCapacityDeclarationAction,
  addComplianceAction,
  addContactAction,
  approveOemAction,
  updateOemAction,
} from "@/app/actions/oems";

export const dynamic = "force-dynamic";

export default async function OemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  let data;
  try {
    const db = await getDb();
    const oem = (await db.select().from(oems).where(eq(oems.id, id)).limit(1))[0];
    if (!oem) return <ErrorState title="OEM not found" detail={`No OEM with id ${id}`} />;

    const [caps, contacts, certs, oemOrders, declarations] = await Promise.all([
      db.select().from(oemCapabilities).where(eq(oemCapabilities.oemId, id)),
      db.select().from(oemContacts).where(eq(oemContacts.oemId, id)),
      db.select().from(complianceCertificates).where(eq(complianceCertificates.oemId, id)).orderBy(asc(complianceCertificates.validTill)),
      db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          status: orders.status,
          poValue: orders.poValue,
          deadline: orders.deliveryDeadline,
          customer: customers.name,
        })
        .from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(eq(orders.oemId, id))
        .orderBy(desc(orders.createdAt)),
      db
        .select()
        .from(oemCapacityDeclarations)
        .where(eq(oemCapacityDeclarations.oemId, id))
        .orderBy(desc(oemCapacityDeclarations.declaredAt)),
    ]);

    const orderIds = oemOrders.map((o) => o.id);
    const pdis = orderIds.length
      ? await db.select().from(pdiRecords).where(inArray(pdiRecords.orderId, orderIds))
      : [];
    const dels = orderIds.length
      ? await db.select().from(deliveries).where(inArray(deliveries.orderId, orderIds))
      : [];

    data = { oem, caps, contacts, certs, oemOrders, pdis, dels, declarations };
  } catch (err) {
    return <ErrorState title="Could not load OEM" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const { oem, caps, contacts, certs, oemOrders, pdis, dels, declarations } = data;
  const editable = can(user.role, "manage_requirements");
  const canApprove = can(user.role, "approve_quote");
  const canDocs = can(user.role, "manage_documents");

  const offered = pdis.reduce((a, p) => a + p.quantityOffered, 0);
  const rejected = pdis.reduce((a, p) => a + p.quantityRejected, 0);
  const delivered = dels.filter((d) => d.status === "delivered").length;
  const pdiPassRate = offered > 0 ? ((offered - rejected) / offered) * 100 : null;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {oem.name}
            <Badge tone={oem.approved ? "green" : "gray"}>{oem.approved ? "Approved" : "Not approved"}</Badge>
          </span>
        }
        subtitle={`${oem.location ?? "—"} · ${oem.countryOfOrigin ?? "—"} · lead ${oem.leadTimeDays ?? "—"} days`}
        actions={
          <>
            <Link className="btn btn-ghost" href="/oems">
              All OEMs
            </Link>
            {canApprove && (
              <form action={approveOemAction}>
                <input type="hidden" name="oemId" value={oem.id} />
                <input type="hidden" name="approved" value={oem.approved ? "no" : "yes"} />
                <button className={oem.approved ? "btn btn-ghost" : "btn btn-primary"} type="submit">
                  {oem.approved ? "Remove approval" : "Approve OEM"}
                </button>
              </form>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Profile">
            {editable ? (
              <form action={updateOemAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input type="hidden" name="oemId" value={oem.id} />
                <label className="block">
                  <span className="label">Name</span>
                  <input className="input" name="name" defaultValue={oem.name} />
                </label>
                <label className="block">
                  <span className="label">Location</span>
                  <input className="input" name="location" defaultValue={oem.location ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Country of origin</span>
                  <input className="input" name="countryOfOrigin" defaultValue={oem.countryOfOrigin ?? ""} />
                </label>
                <label className="block">
                  <span className="label">SPOC</span>
                  <input className="input" name="spoc" defaultValue={oem.spoc ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Phone</span>
                  <input className="input" name="phone" defaultValue={oem.phone ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Email</span>
                  <input className="input" name="email" defaultValue={oem.email ?? ""} />
                </label>
                <label className="block">
                  <span className="label">GST no.</span>
                  <input className="input" name="gstNo" defaultValue={oem.gstNo ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Vendor code</span>
                  <input className="input" name="vendorCode" defaultValue={oem.vendorCode ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Lead time (days)</span>
                  <input className="input" name="leadTimeDays" defaultValue={oem.leadTimeDays ?? ""} inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="label">Commission %</span>
                  <input className="input" name="commissionPercent" defaultValue={oem.commissionPercent ?? ""} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">MOQ rules</span>
                  <input className="input" name="moqRules" defaultValue={oem.moqRules ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Freight terms</span>
                  <input className="input" name="freightTerms" defaultValue={oem.freightTerms ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Warranty terms</span>
                  <input className="input" name="warrantyTerms" defaultValue={oem.warrantyTerms ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Payment terms</span>
                  <input className="input" name="paymentTerms" defaultValue={oem.paymentTerms ?? ""} />
                </label>
                <label className="block">
                  <span className="label">NDA status</span>
                  <input className="input" name="ndaStatus" defaultValue={oem.ndaStatus ?? ""} />
                </label>
                <label className="block sm:col-span-3">
                  <span className="label">Product portfolio</span>
                  <input className="input" name="productPortfolio" defaultValue={oem.productPortfolio ?? ""} />
                </label>
                <label className="block sm:col-span-3">
                  <span className="label">Capacity note</span>
                  <input className="input" name="capacityNote" defaultValue={oem.capacityNote ?? ""} />
                </label>
                <label className="block sm:col-span-3">
                  <span className="label">Approval notes</span>
                  <input className="input" name="approvalNotes" defaultValue={oem.approvalNotes ?? ""} />
                </label>
                <div className="sm:col-span-3">
                  <button className="btn btn-primary" type="submit">
                    Save profile
                  </button>
                </div>
              </form>
            ) : (
              <KeyValue
                items={[
                  ["Location", oem.location],
                  ["SPOC", oem.spoc],
                  ["Email", oem.email],
                  ["Lead time", oem.leadTimeDays ? `${oem.leadTimeDays} days` : null],
                  ["Commission", oem.commissionPercent !== null ? `${oem.commissionPercent}%` : null],
                  ["Payment terms", oem.paymentTerms],
                  ["Portfolio", oem.productPortfolio],
                ]}
              />
            )}
          </Card>

          <Card title="Past performance">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Orders" value={String(oemOrders.length)} />
              <Metric label="Delivered" value={String(delivered)} />
              <Metric label="PDI pass rate" value={pdiPassRate !== null ? `${pdiPassRate.toFixed(0)}%` : "—"} />
              <Metric label="Order value" value={formatINR(oemOrders.reduce((a, o) => a + o.poValue, 0))} />
            </div>
            <div className="mt-3">
              <Table head={["Order", "Customer", "Status", "Deadline", "Value"]} empty="No orders with this OEM yet.">
                {oemOrders.slice(0, 10).map((o) => (
                  <tr key={o.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2">
                      <Link className="text-[var(--brand)]" href={`/orders/${o.id}`}>
                        {o.orderNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{o.customer}</td>
                    <td className="px-3 py-2">{labelize(o.status)}</td>
                    <td className="px-3 py-2">{formatDate(o.deadline)}</td>
                    <td className="px-3 py-2 text-right">{formatINR(o.poValue)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>

          <Card title={`Compliance certificates (${certs.length})`}>
            <Table head={["Authority", "Certificate", "Issued", "Valid till", "Items", "Status"]} empty="No compliance certificates.">
              {certs.map((c) => {
                const expired = c.validTill ? daysUntil(c.validTill) < 0 : false;
                return (
                  <tr key={c.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2 font-medium">{c.authority}</td>
                    <td className="px-3 py-2">{c.certificateNo ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(c.certDate)}</td>
                    <td className="px-3 py-2">{formatDate(c.validTill)}</td>
                    <td className="px-3 py-2">{c.itemsApproved ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={expired ? "red" : c.status === "valid" ? "green" : "amber"}>
                        {expired ? "Expired" : labelize(c.status)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {canDocs && (
              <form action={addComplianceAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <input type="hidden" name="oemId" value={oem.id} />
                <label className="block">
                  <span className="label">Authority</span>
                  <select className="input" name="authority" defaultValue="RCMA">
                    <option value="CEMILAC">CEMILAC</option>
                    <option value="LCSO">LCSO</option>
                    <option value="RCMA">RCMA</option>
                    <option value="DGQA">DGQA</option>
                    <option value="MIL">MIL</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Certificate no.</span>
                  <input className="input" name="certificateNo" />
                </label>
                <label className="block">
                  <span className="label">Cert date</span>
                  <input className="input" type="date" name="certDate" />
                </label>
                <label className="block">
                  <span className="label">Valid till</span>
                  <input className="input" type="date" name="validTill" />
                </label>
                <label className="block">
                  <span className="label">Items approved</span>
                  <input className="input" name="itemsApproved" />
                </label>
                <label className="block">
                  <span className="label">Product code</span>
                  <input className="input" name="productCode" />
                </label>
                <label className="block">
                  <span className="label">Apply for renewal</span>
                  <input className="input" type="date" name="applyForRenewalDate" />
                </label>
                <div className="flex items-end">
                  <button className="btn btn-primary" type="submit">
                    Add certificate
                  </button>
                </div>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={`Capabilities (${caps.length})`}>
            <ul className="mb-3 space-y-1 text-[13px]">
              {caps.length === 0 && <li className="text-[var(--muted)]">None recorded.</li>}
              {caps.map((c) => (
                <li key={c.id} className="rounded border border-[var(--line)] px-2 py-1">
                  <div className="font-medium">{c.productCategory ?? "—"}</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {c.description ?? ""} {c.partNumberPattern ? `· ${c.partNumberPattern}` : ""}
                  </div>
                </li>
              ))}
            </ul>
            {editable && (
              <form action={addCapabilityAction} className="space-y-2">
                <input type="hidden" name="oemId" value={oem.id} />
                <input className="input" name="productCategory" placeholder="Product category" />
                <input className="input" name="drawing" placeholder="" hidden />
                <input className="input" name="partNumberPattern" placeholder="Part number pattern" />
                <input className="input" name="description" placeholder="Description" />
                <button className="btn btn-ghost" type="submit">
                  Add capability
                </button>
              </form>
            )}
          </Card>

          <Card title={`Contacts (${contacts.length})`}>
            <ul className="mb-3 space-y-1 text-[13px]">
              {contacts.length === 0 && <li className="text-[var(--muted)]">None recorded.</li>}
              {contacts.map((c) => (
                <li key={c.id} className="rounded border border-[var(--line)] px-2 py-1">
                  <div className="font-medium">
                    {c.name} {c.isPrimary && <Badge tone="blue">Primary</Badge>}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {c.role ?? ""} {c.phone ? `· ${c.phone}` : ""} {c.email ? `· ${c.email}` : ""}
                  </div>
                </li>
              ))}
            </ul>
            {editable && (
              <form action={addContactAction} className="space-y-2">
                <input type="hidden" name="oemId" value={oem.id} />
                <input className="input" name="name" placeholder="Name" required />
                <input className="input" name="role" placeholder="Role" />
                <input className="input" name="phone" placeholder="Phone" />
                <input className="input" name="email" placeholder="Email" />
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" name="isPrimary" /> Primary contact
                </label>
                <button className="btn btn-ghost" type="submit">
                  Add contact
                </button>
              </form>
            )}
          </Card>

          <Card title={`Capacity declarations (${declarations.length})`}>
            <p className="mb-2 text-[12px] text-[var(--muted)]">
              Declared capacity makes cross-order availability real. Without it, global availability is reported as
              unknown — never as zero.
            </p>
            <ul className="mb-3 space-y-1 text-[13px]">
              {declarations.length === 0 && <li className="text-[var(--muted)]">None recorded.</li>}
              {declarations.map((dec) => (
                <li key={dec.id} className="rounded border border-[var(--line)] px-2 py-1">
                  <div className="font-medium">
                    {dec.partNumber} · {dec.declaredCapacity}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {dec.periodNote ?? ""}{" "}
                    {formatDate(new Date(dec.declaredAt).toISOString().slice(0, 10))}
                  </div>
                </li>
              ))}
            </ul>
            {editable && (
              <form action={addCapacityDeclarationAction} className="space-y-2">
                <input type="hidden" name="oemId" value={oem.id} />
                <input className="input" name="partNumber" placeholder="Part number" required />
                <input className="input" name="declaredCapacity" inputMode="decimal" placeholder="Declared capacity" required />
                <input className="input" name="periodNote" placeholder="Period note (e.g. FY 26-27)" />
                <button className="btn btn-ghost" type="submit">
                  Add capacity declaration
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--line)] p-2">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="text-[15px] font-semibold">{value}</div>
    </div>
  );
}
