import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  commissions,
  customers,
  deliveries,
  fulfilmentMilestones,
  invoices,
  oemRequests,
  oemResponses,
  oems,
  orderItems,
  orders,
  payments,
  pdiRecords,
  quotations,
  requirementItems,
  requirements,
  type MilestoneStep,
} from "@/db/schema";
import { lifecycleBalance, deliveryRisk } from "@/lib/lifecycle";
import { MILESTONE_ORDER } from "@/lib/milestones";
import { formatDate, daysUntil } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, ErrorState, KeyValue, PageHeader, Table } from "@/components/ui";
import { OrderStatusBadge, PdiBadge, RiskBadge, labelize } from "@/components/status";
import {
  addCommissionAction,
  addDeliveryAction,
  addInvoiceAction,
  addPdiAction,
  addPaymentAction,
  releaseCommissionAction,
  setMilestoneAction,
  updateOrderAction,
} from "@/app/actions/orders";

export const dynamic = "force-dynamic";

const TABS = [
  ["fulfilment", "Fulfilment"],
  ["pdi", "PDI & inspection"],
  ["invoices", "Invoices & delivery"],
  ["finance", "Payments & commission"],
] as const;

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab = "fulfilment", error } = await searchParams;

  let data;
  try {
    const db = await getDb();
    const headRows = await db
      .select({
        o: orders,
        customer: customers.name,
        oem: oems.name,
        quoteNo: quotations.quoteNo,
        quoteVersion: quotations.version,
        requirementId: requirements.id,
        requirementRef: requirements.refNo,
        requirementStatus: requirements.status,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(oems, eq(oems.id, orders.oemId))
      .innerJoin(quotations, eq(quotations.id, orders.quotationId))
      .innerJoin(requirements, eq(requirements.id, quotations.requirementId))
      .where(eq(orders.id, id))
      .limit(1);
    const head = headRows[0];
    if (!head) return <ErrorState title="Order not found" detail={`No order with id ${id}`} />;

    const [items, milestones, pdis, invoiceRows, deliveryRows, paymentRows, commissionRows, oemOptions, reqItems] =
      await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.lineNo)),
        db.select().from(fulfilmentMilestones).where(eq(fulfilmentMilestones.orderId, id)),
        db.select().from(pdiRecords).where(eq(pdiRecords.orderId, id)).orderBy(desc(pdiRecords.createdAt)),
        db.select().from(invoices).where(eq(invoices.orderId, id)).orderBy(desc(invoices.invoiceDate)),
        db.select().from(deliveries).where(eq(deliveries.orderId, id)).orderBy(desc(deliveries.deliveryDate)),
        db.select().from(payments).orderBy(desc(payments.createdAt)),
        db.select().from(commissions).where(eq(commissions.orderId, id)).orderBy(desc(commissions.createdAt)),
        db.select({ id: oems.id, name: oems.name }).from(oems).orderBy(asc(oems.name)),
        db.select().from(requirementItems).where(eq(requirementItems.requirementId, head.requirementId)),
      ]);

    const invoiceIds = new Set(invoiceRows.map((i) => i.id));
    const orderPayments = paymentRows.filter((p) => invoiceIds.has(p.invoiceId));

    // Committed quantities for this order's requirement lines.
    const itemIds = reqItems.map((r) => r.id);
    let firmByItem = new Map<string, number>();
    if (itemIds.length > 0) {
      const firmOnly = await db
        .select({
          requirementItemId: oemResponses.requirementItemId,
          quantity: oemResponses.quantity,
          type: oemResponses.responseType,
        })
        .from(oemResponses)
        .where(inArray(oemResponses.requirementItemId, itemIds));
      firmByItem = new Map();
      for (const f of firmOnly) {
        if (f.type !== "firm_commitment") continue;
        firmByItem.set(f.requirementItemId, (firmByItem.get(f.requirementItemId) ?? 0) + f.quantity);
      }
    }

    data = { head, items, milestones, pdis, invoiceRows, deliveryRows, orderPayments, commissionRows, oemOptions, reqItems, firmByItem };
  } catch (err) {
    return <ErrorState title="Could not load order" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const { head, items, milestones, pdis, invoiceRows, deliveryRows, orderPayments, commissionRows, oemOptions, reqItems, firmByItem } = data;
  const o = head.o;
  const canOps = can(user.role, "manage_fulfilment");
  const canPdi = can(user.role, "manage_pdi");
  const canFinance = can(user.role, "manage_finance");
  const canEditOrder = can(user.role, "convert_order");

  const requestedTotal = items.reduce((a, i) => a + i.quantity, 0);
  const committedTotal = reqItems.reduce((a, r) => a + (firmByItem.get(r.id) ?? 0), 0);
  const pdiOffered = pdis.reduce((a, p) => a + p.quantityOffered, 0);
  const pdiCleared = pdis.reduce((a, p) => a + p.quantityCleared, 0);
  const pdiRejected = pdis.reduce((a, p) => a + p.quantityRejected, 0);
  const invoicedQty = invoiceRows.reduce((a, i) => a + i.quantity, 0);
  const deliveredQty = deliveryRows.filter((d) => d.status === "delivered").reduce((a, d) => a + d.quantityDelivered, 0);
  const acceptedQty = deliveryRows.filter((d) => d.acceptanceStatus === "accepted").reduce((a, d) => a + d.quantityDelivered, 0);

  const lifecycle = lifecycleBalance({
    requested: requestedTotal,
    committed: committedTotal,
    ready: pdiOffered,
    inspectedOffered: pdiOffered,
    inspectedCleared: pdiCleared,
    inspectedRejected: pdiRejected,
    invoiced: invoicedQty,
    delivered: deliveredQty,
    accepted: acceptedQty,
  });

  const risk = deliveryRisk(o.deliveryDeadline, o.deliveryDeadline, daysUntil, 3);

  const clearedTotal = pdis.reduce((a, p) => a + p.quantityCleared, 0);
  const deliveredTotal = deliveryRows
    .filter((d) => d.status === "delivered")
    .reduce((a, d) => a + d.quantityDelivered, 0);
  const onHold = pdis.some((p) => p.dispatchClearance === "hold" && p.status !== "passed");

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {o.orderNo} <OrderStatusBadge status={o.status} />{" "}
            {o.deliveryDeadline && <RiskBadge level={daysUntil(o.deliveryDeadline) < 0 ? "late" : risk.level} />}
          </span>
        }
        subtitle={
          <>
            {head.customer} · PO {o.poNumber ?? "—"} · OEM {head.oem ?? "not selected"} · from{" "}
            <Link className="text-[var(--brand)]" href={`/quotations/${o.quotationId}`}>
              {head.quoteNo} v{head.quoteVersion}
            </Link>{" "}
            ·{" "}
            <Link className="text-[var(--brand)]" href={`/requirements/${head.requirementId}`}>
              {head.requirementRef}
            </Link>
          </>
        }
      />

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}

      <Card className="mb-4" title="Lifecycle quantity balance">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
          {[
            ["Requested", lifecycle.requested],
            ["Committed", lifecycle.committed],
            ["Ready", lifecycle.ready],
            ["Offered", lifecycle.inspectedOffered],
            ["Cleared", lifecycle.inspectedCleared],
            ["Rejected", lifecycle.inspectedRejected],
            ["Invoiced", lifecycle.invoiced],
            ["Delivered", lifecycle.delivered],
            ["Accepted", lifecycle.accepted],
            ["Balance", lifecycle.balanceToAccept],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border border-[var(--line)] p-2 text-center">
              <div className="text-[11px] text-[var(--muted)]">{label}</div>
              <div className="text-[15px] font-semibold">{value as number}</div>
            </div>
          ))}
        </div>
        {lifecycle.warning && (
          <p className="mt-2 text-[12px] text-amber-700">Warning: {lifecycle.warning}</p>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--line)]">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/orders/${o.id}?tab=${key}`}
            className={
              "rounded-t-md px-3 py-2 text-[13px] font-medium " +
              (tab === key
                ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
                : "text-[#475467] hover:text-[var(--brand)]")
            }
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "fulfilment" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card title="Fulfilment timeline">
              <Table head={["Step", "Owner", "Expected", "Actual", "Status", "Update"]} empty="No milestones.">
                {MILESTONE_ORDER.map((step) => {
                  const m = milestones.find((x) => x.step === step);
                  return (
                    <tr key={step} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-3 py-2 font-medium">{labelize(step)}</td>
                      <td className="px-3 py-2">{m?.ownerUserId ? "assigned" : "—"}</td>
                      <td className="px-3 py-2">{formatDate(m?.expectedDate ?? null)}</td>
                      <td className="px-3 py-2">{formatDate(m?.actualDate ?? null)}</td>
                      <td className="px-3 py-2">{m ? labelize(m.status) : "—"}</td>
                      <td className="px-3 py-2">
                        {canOps ? (
                          <form action={setMilestoneAction} className="flex items-center gap-1">
                            <input type="hidden" name="orderId" value={o.id} />
                            <input type="hidden" name="step" value={step} />
                            <input
                              className="input w-32"
                              type="date"
                              name="expectedDate"
                              defaultValue={m?.expectedDate ?? ""}
                              title="Expected date"
                            />
                            <input
                              className="input w-32"
                              type="date"
                              name="actualDate"
                              defaultValue={m?.actualDate ?? ""}
                              title="Actual date"
                            />
                            <button className="btn btn-ghost px-2 py-1" type="submit">
                              Save
                            </button>
                          </form>
                        ) : (
                          <span className="text-[12px] text-[var(--muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </Card>

            <Card title={`Order lines (${items.length})`}>
              <Table head={["#", "Part", "Description", "Qty", "Rate", "Line total", "Committed", "PDI cleared"]} empty="No lines.">
                {items.map((i) => {
                  const reqItem = reqItems.find((r) => r.partNumber === i.partNumber && r.description === i.description);
                  const committed = reqItem ? (firmByItem.get(reqItem.id) ?? 0) : 0;
                  const cleared = pdis
                    .filter((p) => !p.orderItemId || p.orderItemId === i.id)
                    .reduce((a, p) => a + p.quantityCleared, 0);
                  return (
                    <tr key={i.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-3 py-2">{i.lineNo}</td>
                      <td className="px-3 py-2 font-medium">{i.partNumber ?? "—"}</td>
                      <td className="px-3 py-2">{i.description}</td>
                      <td className="px-3 py-2 text-right">{i.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatINR(i.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(i.lineTotal)}</td>
                      <td className="px-3 py-2 text-right">{committed || "—"}</td>
                      <td className="px-3 py-2 text-right">{cleared || "—"}</td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          </div>

          <Card title="Order details">
            {canEditOrder ? (
              <form action={updateOrderAction} className="space-y-2">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="block">
                  <span className="label">Customer PO number</span>
                  <input className="input" name="poNumber" defaultValue={o.poNumber ?? ""} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">PO date</span>
                    <input className="input" type="date" name="poDate" defaultValue={o.poDate ?? ""} />
                  </label>
                  <label className="block">
                    <span className="label">Delivery deadline</span>
                    <input className="input" type="date" name="deliveryDeadline" defaultValue={o.deliveryDeadline ?? ""} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">Supplier PO no.</span>
                    <input className="input" name="supplierPoNumber" defaultValue={o.supplierPoNumber ?? ""} />
                  </label>
                  <label className="block">
                    <span className="label">Supplier PO date</span>
                    <input className="input" type="date" name="supplierPoDate" defaultValue={o.supplierPoDate ?? ""} />
                  </label>
                </div>
                <label className="block">
                  <span className="label">OEM selected (human approval required)</span>
                  <select className="input" name="oemId" defaultValue={o.oemId ?? ""}>
                    <option value="">Not selected</option>
                    {oemOptions.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">PDI mode</span>
                  <select className="input" name="pdiMode" defaultValue={o.pdiMode ?? ""}>
                    <option value="">—</option>
                    <option value="physical">Physical</option>
                    <option value="vc">Video conference</option>
                    <option value="third_party">Third party</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">PDI inspector</span>
                  <input className="input" name="pdiInspector" defaultValue={o.pdiInspector ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Documentation required</span>
                  <input className="input" name="documentationRequired" defaultValue={o.documentationRequired ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Warranty terms</span>
                  <input className="input" name="warrantyTerms" defaultValue={o.warrantyTerms ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Payment terms</span>
                  <input className="input" name="paymentTerms" defaultValue={o.paymentTerms ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Special conditions</span>
                  <input className="input" name="specialConditions" defaultValue={o.specialConditions ?? ""} />
                </label>
                <label className="block">
                  <span className="label">Status</span>
                  <select className="input" name="status" defaultValue={o.status}>
                    <option value="open">Open</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <button className="btn btn-primary" type="submit">
                  Save order
                </button>
              </form>
            ) : (
              <KeyValue
                items={[
                  ["PO number", o.poNumber],
                  ["PO date", formatDate(o.poDate)],
                  ["Delivery deadline", formatDate(o.deliveryDeadline)],
                  ["Supplier PO", o.supplierPoNumber],
                  ["OEM", head.oem],
                  ["PDI mode", labelize(o.pdiMode)],
                  ["PDI inspector", o.pdiInspector],
                  ["Payment terms", o.paymentTerms],
                ]}
              />
            )}
          </Card>
        </div>
      )}

      {tab === "pdi" && (
        <div className="space-y-4">
          <Card title={`PDI / inspection records (${pdis.length})`}>
            <Table
              head={["Type", "Agency", "Inspector", "Scheduled", "Offered", "Cleared", "Rejected", "Status", "Dispatch"]}
              empty="No PDI recorded."
            >
              {pdis.map((p) => (
                <tr key={p.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{labelize(p.inspectionType)}</td>
                  <td className="px-3 py-2">{p.agency ?? "—"}</td>
                  <td className="px-3 py-2">{p.inspector ?? "—"}</td>
                  <td className="px-3 py-2">{formatDate(p.scheduledDate)}</td>
                  <td className="px-3 py-2 text-right">{p.quantityOffered}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{p.quantityCleared}</td>
                  <td className="px-3 py-2 text-right text-red-600">{p.quantityRejected}</td>
                  <td className="px-3 py-2">
                    <PdiBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={p.dispatchClearance === "approved" ? "text-emerald-700" : "text-red-600"}>
                      {labelize(p.dispatchClearance)}
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          {canPdi && (
            <Card title="Record a PDI">
              <form action={addPdiAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="block">
                  <span className="label">Inspection type</span>
                  <select className="input" name="inspectionType" defaultValue="physical">
                    <option value="physical">Physical</option>
                    <option value="vc">Video conference</option>
                    <option value="third_party">Third party</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Agency</span>
                  <input className="input" name="agency" placeholder="DGQA / Client / Internal" />
                </label>
                <label className="block">
                  <span className="label">Inspector</span>
                  <input className="input" name="inspector" />
                </label>
                <label className="block">
                  <span className="label">Scheduled date</span>
                  <input className="input" type="date" name="scheduledDate" />
                </label>
                <label className="block">
                  <span className="label">Quantity offered</span>
                  <input className="input" name="quantityOffered" inputMode="decimal" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">Quantity cleared</span>
                  <input className="input" name="quantityCleared" inputMode="decimal" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">Quantity rejected</span>
                  <input className="input" name="quantityRejected" inputMode="decimal" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">Rejection reason</span>
                  <input className="input" name="rejectionReason" />
                </label>
                <div className="sm:col-span-3 lg:col-span-4">
                  <button className="btn btn-primary" type="submit">
                    Save PDI
                  </button>
                  <span className="ml-3 text-[12px] text-[var(--muted)]">
                    A rejected quantity puts dispatch on hold until cleared.
                  </span>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="space-y-4">
          <Card title={`Invoices (${invoiceRows.length})`}>
            <Table head={["Invoice", "Kind", "Date", "Qty", "Net", "GST", "Gross", "Due", "Status"]} empty="No invoices.">
              {invoiceRows.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2 font-medium">{inv.invoiceNo}</td>
                  <td className="px-3 py-2">{labelize(inv.invoiceKind)}</td>
                  <td className="px-3 py-2">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-3 py-2 text-right">{inv.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatINR(inv.netAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(inv.gstAmount)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatINR(inv.grossAmount)}</td>
                  <td className="px-3 py-2">{formatDate(inv.paymentDueDate)}</td>
                  <td className="px-3 py-2">{labelize(inv.status)}</td>
                </tr>
              ))}
            </Table>
          </Card>

          {canFinance && (
            <Card title="Add an invoice (many per PO)">
              <form action={addInvoiceAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="block">
                  <span className="label">Invoice no.</span>
                  <input className="input" name="invoiceNo" />
                </label>
                <label className="block">
                  <span className="label">Invoice date</span>
                  <input className="input" type="date" name="invoiceDate" />
                </label>
                <label className="block">
                  <span className="label">Invoice kind</span>
                  <select className="input" name="invoiceKind" defaultValue="customer">
                    <option value="customer">Customer invoice</option>
                    <option value="oem">OEM invoice</option>
                    <option value="commission">Commission invoice</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Quantity</span>
                  <input className="input" name="quantity" inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">Gross amount ₹ (incl. GST)</span>
                  <input className="input" name="grossAmount" inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">GST %</span>
                  <input className="input" name="gstPercent" defaultValue="18" inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">Payment due date</span>
                  <input className="input" type="date" name="paymentDueDate" />
                </label>
                <label className="block">
                  <span className="label">Dispatch date</span>
                  <input className="input" type="date" name="dispatchDate" />
                </label>
                <label className="block">
                  <span className="label">LR / AWB</span>
                  <input className="input" name="lrAwb" />
                </label>
                <label className="block">
                  <span className="label">Courier</span>
                  <input className="input" name="courier" />
                </label>
                <div className="sm:col-span-3 lg:col-span-4">
                  <button className="btn btn-primary" type="submit">
                    Save invoice
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title={`Deliveries (${deliveryRows.length}) · partial allowed`}>
            {onHold && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                <strong>Dispatch on hold.</strong> PDI cleared {clearedTotal} of {pdiOffered} offered; delivered{" "}
                {deliveredTotal}. A failed or held PDI blocks dispatch of the uncleared quantity.
              </div>
            )}
            <Table head={["Date", "Location", "Qty", "Status", "Acceptance", "GRN", "Pending", "Closure"]} empty="No deliveries.">
              {deliveryRows.map((d) => (
                <tr key={d.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{formatDate(d.deliveryDate)}</td>
                  <td className="px-3 py-2">{d.location ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{d.quantityDelivered}</td>
                  <td className="px-3 py-2">{labelize(d.status)}</td>
                  <td className="px-3 py-2">{labelize(d.acceptanceStatus)}</td>
                  <td className="px-3 py-2">{d.grnNo ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{d.pendingBalanceQty}</td>
                  <td className="px-3 py-2">{labelize(d.closureStatus)}</td>
                </tr>
              ))}
            </Table>
          </Card>

          {can(user.role, "manage_delivery") && (
            <Card title="Record a delivery">
              <form action={addDeliveryAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="block">
                  <span className="label">Invoice</span>
                  <select className="input" name="invoiceId" defaultValue="">
                    <option value="">—</option>
                    {invoiceRows.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Delivery date</span>
                  <input className="input" type="date" name="deliveryDate" />
                </label>
                <label className="block">
                  <span className="label">Location</span>
                  <input className="input" name="location" />
                </label>
                <label className="block">
                  <span className="label">Quantity delivered</span>
                  <input className="input" name="quantityDelivered" inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">Status</span>
                  <select className="input" name="status" defaultValue="delivered">
                    <option value="in_transit">In transit</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Acceptance</span>
                  <select className="input" name="acceptanceStatus" defaultValue="pending">
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">GRN no.</span>
                  <input className="input" name="grnNo" />
                </label>
                <label className="block">
                  <span className="label">Pending balance qty</span>
                  <input className="input" name="pendingBalanceQty" inputMode="decimal" defaultValue="0" />
                </label>
                {onHold && (
                  <div className="sm:col-span-3 lg:col-span-4 rounded-md border border-amber-200 bg-amber-50 p-2">
                    <p className="text-[12px] font-semibold text-amber-800">
                      Dispatch is on hold (cleared {clearedTotal}, delivered {deliveredTotal}). Dispatching beyond the
                      cleared quantity requires an override.
                    </p>
                    <label className="mt-1 flex items-center gap-2 text-[12px]">
                      <input type="checkbox" name="holdOverride" /> Override the dispatch hold
                    </label>
                    <input className="input mt-1" name="overrideReason" placeholder="Reason (recorded in the audit trail)" />
                  </div>
                )}
                <div className="sm:col-span-3 lg:col-span-4">
                  <button className="btn btn-primary" type="submit">
                    Save delivery
                  </button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "finance" && (
        <div className="space-y-4">
          <Card title={`Payments (${orderPayments.length}) · partial payments supported`}>
            <Table head={["Date", "Amount", "TDS", "LD", "GST on LD", "Balance", "Status", "UTR"]} empty="No payments.">
              {orderPayments.map((p) => (
                <tr key={p.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{formatDate(p.paidDate)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(p.amount)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(p.tds)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(p.ld)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(p.gstOnLd)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatINR(p.balance)}</td>
                  <td className="px-3 py-2">{labelize(p.status)}</td>
                  <td className="px-3 py-2">{p.utr ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </Card>

          {canFinance && invoiceRows.length > 0 && (
            <Card title="Record a payment">
              <form action={addPaymentAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="block">
                  <span className="label">Invoice *</span>
                  <select className="input" name="invoiceId" required defaultValue="">
                    <option value="" disabled>
                      Select invoice
                    </option>
                    {invoiceRows.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNo} · {formatINR(inv.grossAmount)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Direction</span>
                  <select className="input" name="direction" defaultValue="customer_to_oem">
                    <option value="customer_to_oem">Customer → OEM (client payment)</option>
                    <option value="oem_to_us">OEM → us (commission base)</option>
                    <option value="customer_to_us">Customer → us</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Amount ₹</span>
                  <input className="input" name="amount" inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">Paid date</span>
                  <input className="input" type="date" name="paidDate" />
                </label>
                <label className="block">
                  <span className="label">TDS ₹</span>
                  <input className="input" name="tds" inputMode="decimal" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">LD ₹</span>
                  <input className="input" name="ld" inputMode="decimal" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">GST on LD ₹</span>
                  <input className="input" name="gstOnLd" inputMode="decimal" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">Mode</span>
                  <input className="input" name="mode" placeholder="RTGS / NEFT / wire" />
                </label>
                <label className="block">
                  <span className="label">UTR</span>
                  <input className="input" name="utr" />
                </label>
                <div className="sm:col-span-3 lg:col-span-4">
                  <button className="btn btn-primary" type="submit">
                    Save payment
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title={`Commission (${commissionRows.length}) · earned on OEM-payment milestone`}>
            <Table head={["Milestone", "%", "Base", "Commission", "GST", "Gross", "Status", "Outstanding", ""]} empty="No commission yet.">
              {commissionRows.map((c) => (
                <tr key={c.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{labelize(c.milestone)}</td>
                  <td className="px-3 py-2 text-right">{c.commissionPercent}%</td>
                  <td className="px-3 py-2 text-right">
                    {formatINR(c.baseInvoiceAmount)}
                    {c.baseInvoiceId && <div className="text-[10px] text-[var(--muted)]">per OEM invoice</div>}
                  </td>
                  <td className="px-3 py-2 text-right">{formatINR(c.commissionAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(c.gst)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatINR(c.gross)}</td>
                  <td className="px-3 py-2">
                    <span className={c.paymentStatus === "blocked" ? "text-red-600" : "text-emerald-700"}>
                      {labelize(c.paymentStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{formatINR(c.outstanding)}</td>
                  <td className="px-3 py-2">
                    {canFinance && c.paymentStatus === "blocked" && (
                      <form action={releaseCommissionAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="commissionId" value={c.id} />
                        <button className="btn btn-ghost px-2 py-1" type="submit">
                          Re-check
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          {canFinance && (
            <Card title="Create a commission entry">
              <form action={addCommissionAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <input type="hidden" name="orderId" value={o.id} />
                <label className="block sm:col-span-2">
                  <span className="label">Base OEM invoice (milestone basis)</span>
                  <select className="input" name="baseInvoiceId" defaultValue="">
                    <option value="">Manual base amount</option>
                    {invoiceRows.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNo} · {labelize(inv.invoiceKind)} · {formatINR(inv.grossAmount)}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]">
                    Commission is earned per OEM invoice, not on a global payment pool.
                  </span>
                </label>
                <label className="block">
                  <span className="label">Manual base ₹ (if no invoice selected)</span>
                  <input className="input" name="baseInvoiceAmount" inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">Commission % (blank = OEM default)</span>
                  <input className="input" name="commissionPercent" inputMode="decimal" />
                </label>
                <label className="block sm:col-span-3 lg:col-span-4">
                  <span className="label">Remarks</span>
                  <input className="input" name="remarks" />
                </label>
                <div className="sm:col-span-3 lg:col-span-4">
                  <button className="btn btn-primary" type="submit">
                    Create commission
                  </button>
                  <span className="ml-3 text-[12px] text-[var(--muted)]">
                    Stays <strong>blocked</strong> until the configured OEM-payment milestone is met.
                  </span>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
