import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  approvals,
  customers,
  oems,
  orders,
  quotationItems,
  quotations,
  requirementItems,
  requirements,
  users,
} from "@/db/schema";
import { getComparableBids, getRequirementDetail } from "@/lib/requirements";
import { summarizeBids, type BidRow } from "@/lib/bids";
import { boolSetting, getSettings, numSetting } from "@/lib/settings";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, ErrorState, KeyValue, PageHeader, Table } from "@/components/ui";
import { QuoteStatusBadge, labelize } from "@/components/status";
import { approveQuoteAction, updateQuoteItemsAction, updateQuoteStatusAction } from "@/app/actions/quotations";
import { convertQuoteToOrderAction } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

const POST_SUBMISSION = [
  "submitted",
  "clarification_requested",
  "technical_clarification",
  "commercial_negotiation",
  "awaiting_approval",
  "won",
  "lost",
  "cancelled",
];

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  let data;
  try {
    const db = await getDb();
    const rows = await db
      .select({
        q: quotations,
        customer: customers.name,
        requirementRef: requirements.refNo,
        requirementId: requirements.id,
        requirementStatus: requirements.status,
      })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(requirements, eq(requirements.id, quotations.requirementId))
      .where(eq(quotations.id, id))
      .limit(1);
    const head = rows[0];
    if (!head) return <ErrorState title="Quotation not found" detail={`No quotation with id ${id}`} />;

    const [items, versions, approvalRows, existingOrderRows] = await Promise.all([
      db
        .select({
          qi: quotationItems,
          reqItem: requirementItems,
        })
        .from(quotationItems)
        .leftJoin(requirementItems, eq(requirementItems.id, quotationItems.requirementItemId))
        .where(eq(quotationItems.quotationId, id))
        .orderBy(asc(quotationItems.lineNo)),
      db
        .select({
          id: quotations.id,
          quoteNo: quotations.quoteNo,
          version: quotations.version,
          status: quotations.status,
          total: quotations.total,
          createdAt: quotations.createdAt,
        })
        .from(quotations)
        .where(eq(quotations.requirementId, head.q.requirementId))
        .orderBy(desc(quotations.version)),
      db
        .select({
          id: approvals.id,
          status: approvals.status,
          comments: approvals.comments,
          decidedAt: approvals.decidedAt,
          approver: users.name,
        })
        .from(approvals)
        .leftJoin(users, eq(users.id, approvals.approverId))
        .where(eq(approvals.entityType, "quotation"))
        .orderBy(desc(approvals.createdAt)),
      db
        .select({ id: orders.id, orderNo: orders.orderNo })
        .from(orders)
        .where(eq(orders.quotationId, id))
        .limit(1),
    ]);

    const orderRows = existingOrderRows;

    const partNumbers = items.map((i) => i.qi.partNumber).filter((p): p is string => !!p);
    const comps = await getComparableBids(db, { partNumbers, excludeRequirementId: head.q.requirementId });

    const oemRows = head.q.primaryOemId
      ? await db.select().from(oems).where(eq(oems.id, head.q.primaryOemId)).limit(1)
      : [];

    const [settings, reqDetail] = await Promise.all([
      getSettings(db),
      getRequirementDetail(db, head.q.requirementId),
    ]);

    data = {
      head,
      items,
      versions,
      approvalRows,
      orderRows,
      comps,
      oem: oemRows[0] ?? null,
      settings,
      reqDetail,
    };
  } catch (err) {
    return <ErrorState title="Could not load quotation" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const { head, items, versions, approvalRows, orderRows, comps, oem, settings, reqDetail } = data;
  const q = head.q;
  const canEdit = can(user.role, "submit_quote");
  const canApprove = can(user.role, "approve_quote");

  const marginFloor = numSetting(settings, "margin_floor_percent", 0);
  const marginBelowFloor = q.marginPercent !== null && marginFloor > 0 && q.marginPercent < marginFloor;
  const coverageGate = boolSetting(settings, "quote_uncovered_override_required", true);
  const rollup = reqDetail?.rollup ?? null;
  const uncovered = rollup !== null && !rollup.allCovered;

  const bidRows: BidRow[] = comps.map((c) => ({
    quotationId: c.quotationId,
    quoteNo: c.quoteNo,
    requirementRef: c.requirementRef,
    customerName: c.customerName,
    partNumber: c.partNumber,
    quantity: c.quantity,
    unitPricePaise: c.unitPrice,
    outcome: c.outcome,
    quotedAt: c.quotedAt,
    oemName: c.oemName,
    dataTrust: c.dataTrust,
  }));
  const bidSummary = summarizeBids(bidRows, { limit: 10 });

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {q.quoteNo} <span className="text-[13px] text-[var(--muted)]">v{q.version}</span>{" "}
            <QuoteStatusBadge status={q.status} />
          </span>
        }
        subtitle={
          <>
            {head.customer} · from{" "}
            <Link className="text-[var(--brand)]" href={`/requirements/${head.requirementId}`}>
              {head.requirementRef}
            </Link>{" "}
            ({labelize(head.requirementStatus)})
          </>
        }
        actions={
          <>
            {q.status === "approved" && orderRows.length === 0 && can(user.role, "convert_order") && (
              <form action={convertQuoteToOrderAction}>
                <input type="hidden" name="quotationId" value={q.id} />
                <button className="btn btn-primary" type="submit">
                  Convert to order
                </button>
              </form>
            )}
            {orderRows.length > 0 && (
              <Link className="btn btn-ghost" href={`/orders/${orderRows[0].id}`}>
                Open order {orderRows[0].orderNo}
              </Link>
            )}
          </>
        }
      />

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Quote lines and rate ladder">
            <form action={updateQuoteItemsAction}>
              <input type="hidden" name="quotationId" value={q.id} />
              <Table
                head={["#", "Part", "Description", "Qty", "OEM cost ₹", "1st rate ₹", "2nd rate ₹", "PNC ₹", "Line total"]}
                empty="No lines."
              >
                {items.map(({ qi }) => (
                  <tr key={qi.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2">{qi.lineNo}</td>
                    <td className="px-3 py-2 font-medium">{qi.partNumber ?? "—"}</td>
                    <td className="px-3 py-2">{qi.description}</td>
                    <td className="px-3 py-2 text-right">{qi.quantity}</td>
                    <td className="px-1 py-1">
                      <input
                        className="input w-24"
                        name={`oemUnitPrice__${qi.id}`}
                        defaultValue={qi.oemUnitPrice !== null ? String(qi.oemUnitPrice / 100) : ""}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="input w-24"
                        name={`firstRate__${qi.id}`}
                        defaultValue={qi.firstRate !== null ? String(qi.firstRate / 100) : ""}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="input w-24"
                        name={`secondRate__${qi.id}`}
                        defaultValue={qi.secondRate !== null ? String(qi.secondRate / 100) : ""}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="input w-24"
                        name={`pncPrice__${qi.id}`}
                        defaultValue={qi.unitPrice ? String(qi.unitPrice / 100) : ""}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{formatINR(qi.lineTotal)}</td>
                  </tr>
                ))}
              </Table>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <label className="block">
                  <span className="label">Target margin %</span>
                  <input
                    className="input"
                    name="targetMarginPercent"
                    defaultValue={q.targetMarginPercent ?? ""}
                    inputMode="decimal"
                    disabled={!canEdit}
                  />
                </label>
                <label className="block">
                  <span className="label">Discount ₹</span>
                  <input className="input" name="discount" defaultValue={q.discount / 100} inputMode="decimal" disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="label">Delivery terms</span>
                  <input className="input" name="deliveryTerms" defaultValue={q.deliveryTerms ?? ""} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="label">Payment terms</span>
                  <input className="input" name="paymentTerms" defaultValue={q.paymentTerms ?? ""} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="label">Validity date</span>
                  <input className="input" type="date" name="validityDate" defaultValue={q.validityDate ?? ""} disabled={!canEdit} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="label">Remarks</span>
                  <input className="input" name="remarks" defaultValue={q.remarks ?? ""} disabled={!canEdit} />
                </label>
              </div>

              {canEdit && (
                <div className="mt-3">
                  <button className="btn btn-primary" type="submit">
                    Recalculate &amp; save
                  </button>
                  <span className="ml-3 text-[12px] text-[var(--muted)]">
                    Effective rate = PNC, else 2nd rate, else 1st rate. Line totals and margin recompute.
                  </span>
                </div>
              )}
            </form>
          </Card>

          <Card title={`Comparable past bids (${bidSummary.comparable.length})`}>
            <p className="mb-2 text-[12px] text-[var(--muted)]">{bidSummary.explanation}</p>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Win rate" value={bidSummary.winRate !== null ? `${(bidSummary.winRate * 100).toFixed(0)}%` : "—"} />
              <Metric label="Avg won price" value={bidSummary.avgWonPricePaise !== null ? formatINR(bidSummary.avgWonPricePaise) : "—"} />
              <Metric label="Avg lost price" value={bidSummary.avgLostPricePaise !== null ? formatINR(bidSummary.avgLostPricePaise) : "—"} />
              <Metric
                label="Won band"
                value={bidSummary.suggestedBand ? `${formatINR(bidSummary.suggestedBand.low)}–${formatINR(bidSummary.suggestedBand.high)}` : "—"}
              />
            </div>
            <Table
              head={["Requirement", "Customer", "Part", "Qty", "Quoted", "Outcome", "Trust", "Date"]}
              empty="No comparable past bids for these part numbers."
            >
              {bidSummary.comparable.map((b) => (
                <tr key={b.quotationId + (b.partNumber ?? "")} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{b.requirementRef}</td>
                  <td className="px-3 py-2">{b.customerName}</td>
                  <td className="px-3 py-2">{b.partNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{b.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatINR(b.unitPricePaise)}</td>
                  <td className="px-3 py-2">{labelize(b.outcome)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[11px] " +
                        (b.dataTrust === "untrusted" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")
                      }
                    >
                      {b.dataTrust === "untrusted" ? "Untrusted" : "Verified"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatDate(b.quotedAt)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Summary">
            <KeyValue
              items={[
                ["Subtotal", formatINR(q.subtotal)],
                ["Discount", formatINR(q.discount)],
                ["Total", formatINR(q.total)],
                ["Margin", q.marginPercent !== null ? `${q.marginPercent.toFixed(1)}%` : "—"],
                ["Recommended price", q.recommendedPrice !== null ? formatINR(q.recommendedPrice) : "—"],
                ["Target margin", q.targetMarginPercent !== null ? `${q.targetMarginPercent}%` : "—"],
                ["OEM", oem?.name ?? "Not selected"],
                ["Technical compliance", q.technicalCompliance ? "Yes" : "No"],
                ["Commercial compliance", q.commercialCompliance ? "Yes" : "No"],
              ]}
            />
            {marginFloor > 0 && (
              <p className={"mt-2 text-[11px] " + (marginBelowFloor ? "font-semibold text-red-600" : "text-[var(--muted)]")}>
                Margin floor: {marginFloor}%
                {marginBelowFloor ? " · this quote is below the floor" : q.marginPercent !== null ? " · above floor" : ""}
              </p>
            )}
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Recommended price is a suggestion from target margin only. The final price is always a human decision.
            </p>
          </Card>

          <Card title="Approval">
            {canApprove ? (
              <form action={approveQuoteAction} className="space-y-2">
                <input type="hidden" name="quotationId" value={q.id} />
                <label className="block">
                  <span className="label">Comments</span>
                  <input className="input" name="comments" />
                </label>
                {marginBelowFloor && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                    <p className="text-[12px] font-semibold text-amber-800">
                      Margin {q.marginPercent?.toFixed(1)}% is below the {marginFloor}% floor. Approval requires an
                      override with a reason.
                    </p>
                    <label className="mt-2 flex items-center gap-2 text-[12px]">
                      <input type="checkbox" name="marginOverride" /> I approve below the margin floor
                    </label>
                    <input className="input mt-1" name="overrideReason" placeholder="Reason (recorded in the audit trail)" />
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-primary" name="decision" value="approve" type="submit">
                    Approve
                  </button>
                  <button className="btn btn-ghost" name="decision" value="reject" type="submit">
                    Send back
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-[13px] text-[var(--muted)]">Only owner/management can approve quotations.</p>
            )}
            <div className="mt-3">
              <Table head={["Approver", "Decision", "When", "Comments"]} empty="No approval decisions yet.">
                {approvalRows.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-2 py-1">{a.approver ?? "—"}</td>
                    <td className="px-2 py-1">{labelize(a.status)}</td>
                    <td className="px-2 py-1">{a.decidedAt ? formatDate(new Date(a.decidedAt).toISOString().slice(0, 10)) : "—"}</td>
                    <td className="px-2 py-1">{a.comments ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>

          {canEdit && (
            <Card title="Response state">
              <form action={updateQuoteStatusAction} className="space-y-2">
                <input type="hidden" name="quotationId" value={q.id} />
                {rollup && (
                  <div
                    className={
                      "rounded-md border p-2 text-[12px] " +
                      (uncovered ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")
                    }
                  >
                    Coverage from firm OEM commitments: {rollup.totalCovered} / {rollup.totalRequired}
                    {uncovered
                      ? ` · ${rollup.totalUncovered} unit(s) uncovered on ${rollup.uncoveredLines} line(s)`
                      : " · fully covered"}
                  </div>
                )}
                {uncovered && coverageGate && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                    <p className="text-[12px] font-semibold text-amber-800">
                      Submitting with uncovered quantity requires an override. Availability and quote indications do
                      not count as coverage.
                    </p>
                    <label className="mt-2 flex items-center gap-2 text-[12px]">
                      <input type="checkbox" name="uncoveredOverride" /> Submit with uncovered quantity
                    </label>
                    <input className="input mt-1" name="overrideReason" placeholder="Reason (recorded in the audit trail)" />
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block flex-1">
                    <span className="label">Post-submission status</span>
                    <select className="input" name="status" defaultValue={q.status}>
                      {POST_SUBMISSION.map((s) => (
                        <option key={s} value={s}>
                          {labelize(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn btn-ghost" type="submit">
                    Update
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title={`Versions (${versions.length})`}>
            <Table head={["Quote", "Ver", "Status", "Value", "Created"]} empty="No versions.">
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-2 py-1">
                    <Link className="text-[var(--brand)]" href={`/quotations/${v.id}`}>
                      {v.quoteNo}
                    </Link>
                  </td>
                  <td className="px-2 py-1">v{v.version}</td>
                  <td className="px-2 py-1">{labelize(v.status)}</td>
                  <td className="px-2 py-1 text-right">{formatINR(v.total)}</td>
                  <td className="px-2 py-1">{formatDate(new Date(v.createdAt).toISOString().slice(0, 10))}</td>
                </tr>
              ))}
            </Table>
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
      <div className="text-[14px] font-semibold">{value}</div>
    </div>
  );
}
