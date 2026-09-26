import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { oems, taxonomies } from "@/db/schema";
import { getRequirementDetail } from "@/lib/requirements";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card, ErrorState, KeyValue, PageHeader, Table } from "@/components/ui";
import { CoverageBadge, RequirementStatusBadge, ResponseTypeBadge, labelize } from "@/components/status";
import {
  addOemRequestAction,
  addOemResponseAction,
  addTimelineNoteAction,
  updateRequirementStatusAction,
} from "@/app/actions/requirements";
import { createQuoteFromRequirementAction } from "@/app/actions/quotations";
import { StatusControl } from "./StatusControl";

export const dynamic = "force-dynamic";

const STATUSES = [
  { code: "received", label: "Received" },
  { code: "qualifying", label: "Qualifying" },
  { code: "quoted", label: "Quoted" },
  { code: "submitted", label: "Submitted" },
  { code: "won", label: "Won" },
  { code: "lost", label: "Lost" },
  { code: "cancelled", label: "Cancelled" },
];

const DEFAULT_LOSS_REASONS = [
  ["price", "Price"],
  ["technical_non_compliance", "Technical non-compliance"],
  ["delivery_timeline", "Delivery timeline"],
  ["competitor_preference", "Competitor preference"],
  ["quantity_capacity", "Quantity / capacity"],
  ["cancelled", "Cancelled"],
  ["not_pursued", "Not pursued"],
  ["other", "Other"],
] as const;

const TABS = [
  ["overview", "Overview"],
  ["items", "Line items & coverage"],
  ["sourcing", "OEM sourcing"],
  ["quotes", "Quotations"],
  ["timeline", "Timeline"],
  ["documents", "Documents"],
] as const;

export default async function RequirementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab = "overview", error } = await searchParams;

  let detail;
  let oemOptions: Array<{ id: string; name: string; approved: boolean }> = [];
  let lossReasonOptions: Array<{ code: string; label: string }> = DEFAULT_LOSS_REASONS.map(([code, label]) => ({
    code,
    label,
  }));

  try {
    const db = await getDb();
    detail = await getRequirementDetail(db, id);
    if (!detail) return <ErrorState title="Requirement not found" detail={`No requirement with id ${id}`} />;
    oemOptions = await db
      .select({ id: oems.id, name: oems.name, approved: oems.approved })
      .from(oems)
      .orderBy(asc(oems.name));
    const reasonRows = await db.select().from(taxonomies).where(eq(taxonomies.kind, "loss_reason"));
    if (reasonRows.length > 0) {
      lossReasonOptions = reasonRows
        .filter((r) => r.active)
        .sort((a, b) => a.sort - b.sort)
        .map((r) => ({ code: r.code, label: r.label }));
    }
  } catch (err) {
    return <ErrorState title="Could not load requirement" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const r = detail.requirement;
  const editable = can(user.role, "manage_requirements");
  const linkedOemIds = new Set(detail.oemRequests.map((x) => x.oemId));

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {r.refNo} <RequirementStatusBadge status={r.status} />
          </span>
        }
        subtitle={
          <>
            {r.customer}
            {r.projectName ? ` · ${r.projectName}` : ""} · received {formatDate(
              new Date(r.createdAt).toISOString().slice(0, 10),
            )}
          </>
        }
        actions={
          <>
            <Link className="btn btn-ghost" href={`/requirements?q=${encodeURIComponent(r.refNo)}`}>
              Search history
            </Link>
            {editable && (
              <form action={createQuoteFromRequirementAction}>
                <input type="hidden" name="requirementId" value={r.id} />
                <button className="btn btn-primary" type="submit">
                  Build quotation
                </button>
              </form>
            )}
          </>
        }
      />

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--line)]">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/requirements/${r.id}?tab=${key}`}
            className={
              "rounded-t-md px-3 py-2 text-[13px] font-medium " +
              (tab === key
                ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
                : "text-[#475467] hover:text-[var(--brand)]")
            }
          >
            {label}
            {key === "items" && ` (${detail.items.length})`}
            {key === "quotes" && ` (${detail.quotes.length})`}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Requirement" className="lg:col-span-2">
            <KeyValue
              items={[
                ["Customer / agency", r.customer],
                ["Project", r.projectName],
                ["Source", labelize(r.source)],
                ["Bid type", r.bidType ? labelize(r.bidType) : "—"],
                ["Submission type", r.submissionType ? labelize(r.submissionType) : "—"],
                ["GeM tender no.", r.gemTenderNo],
                ["Enquiry no. / date", `${r.enquiryNo ?? "—"} · ${formatDate(r.enquiryDate)}`],
                ["Submission deadline", formatDate(r.submissionDeadline)],
                ["Required delivery", formatDate(r.requiredDeliveryDate)],
                ["Quotation validity", r.quotationValidity],
                ["Approvals required", r.approvalRequirements],
                ["Assigned to", r.assignedUserName],
                ["Staggered delivery", r.staggeredDelivery ? "Yes" : "No"],
                ["MOQ notes", r.moqNotes],
                ["Remarks", r.remarks],
              ]}
            />
          </Card>

          <Card title="Coverage rollup">
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Total required</span>
                <span className="font-semibold">{detail.rollup.totalRequired}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Firm committed</span>
                <span className="font-semibold">{detail.rollup.totalCovered}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Uncovered</span>
                <span className={"font-semibold " + (detail.rollup.totalUncovered > 0 ? "text-red-600" : "text-emerald-600")}>
                  {detail.rollup.totalUncovered}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-[var(--brand)]"
                  style={{
                    width: `${detail.rollup.totalRequired > 0 ? Math.min((detail.rollup.totalCovered / detail.rollup.totalRequired) * 100, 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-[12px] text-[var(--muted)]">
                Mode: <strong>{detail.capacityMode === "global" ? "global OEM capacity" : "per order"}</strong>
                {detail.capacityMode === "per_order" && detail.items.some((i) => i.firmElsewhere > 0) && (
                  <> · some part numbers have commitments elsewhere — see Line items.</>
                )}
              </p>
              <Link className="text-[12px] text-[var(--brand)]" href={`/requirements/${r.id}?tab=items`}>
                Open line items →
              </Link>
            </div>
          </Card>

          <Card title="Status">
            {editable ? (
              <StatusControl
                requirementId={r.id}
                currentStatus={r.status}
                statuses={STATUSES}
                lossReasons={lossReasonOptions}
                action={updateRequirementStatusAction}
              />
            ) : (
              <p className="text-[13px] text-[var(--muted)]">Read-only for your role.</p>
            )}
            {(r.lossReason || r.competitorDetails) && (
              <div className="mt-3 rounded border border-[var(--line)] p-2 text-[12px]">
                <div>
                  <strong>Loss reason:</strong> {labelize(r.lossReason)}
                </div>
                {r.competitorDetails && (
                  <div>
                    <strong>Competitor:</strong> {r.competitorDetails}
                  </div>
                )}
                {r.lossNotes && (
                  <div>
                    <strong>Notes:</strong> {r.lossNotes}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "items" && (
        <div className="space-y-4">
          <Card title={`Line items (${detail.items.length})`}>
            <Table
              head={["#", "Part no.", "Description", "Qty", "Required", "Firm", "Indicated", "Elsewhere", "Uncovered", "Coverage"]}
              empty="No line items."
            >
              {detail.items.map((i) => (
                <tr key={i.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{i.lineNo}</td>
                  <td className="px-3 py-2 font-medium">{i.partNumber ?? "—"}</td>
                  <td className="px-3 py-2">
                    {i.description}
                    {i.byOem.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {i.byOem.map((o) => (
                          <span
                            key={o.oemId}
                            className={
                              "rounded px-1.5 py-0.5 text-[11px] " +
                              (o.availableGlobal === 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")
                            }
                          >
                            {o.oemName}: firm {o.firmQuantity}
                            {o.indicatedQuantity > 0 ? ` · ind ${o.indicatedQuantity}` : ""}
                            {o.availableGlobal !== null && o.availableGlobal !== undefined
                              ? ` · available ${o.availableGlobal}`
                              : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{i.quantity}</td>
                  <td className="px-3 py-2">{formatDate(i.requiredDeliveryDate)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-700">{i.firmCommitted}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{i.indicated}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{i.firmElsewhere || "—"}</td>
                  <td className={"px-3 py-2 text-right font-semibold " + (i.coverage.uncovered > 0 ? "text-red-600" : "text-emerald-700")}>
                    {i.coverage.uncovered}
                  </td>
                  <td className="px-3 py-2">
                    <CoverageBadge state={i.coverage.state} />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Why availability is not coverage">
            <p className="text-[13px] text-[var(--muted)]">
              Only <strong>firm commitments</strong> count toward the covered quantity. <strong>Availability</strong> and{" "}
              <strong>quote indications</strong> are shown separately and never close the uncovered balance. If OEM A can
              supply 1,000 and 700 is committed elsewhere, the <em>Elsewhere</em> column shows it; the headline
              &quot;available&quot; figure follows the capacity mode in settings.
            </p>
          </Card>
        </div>
      )}

      {tab === "sourcing" && (
        <div className="space-y-4">
          <Card title={`OEM sourcing requests (${detail.oemRequests.length})`}>
            <Table head={["OEM", "Type", "Status", "Channel", "Requested", "Notes"]} empty="No OEMs sourced yet.">
              {detail.oemRequests.map((q) => (
                <tr key={q.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2 font-medium">{q.oemName}</td>
                  <td className="px-3 py-2">{labelize(q.requestType)}</td>
                  <td className="px-3 py-2">{labelize(q.status)}</td>
                  <td className="px-3 py-2">{q.channel ?? "—"}</td>
                  <td className="px-3 py-2">{formatDate(new Date(q.requestedAt).toISOString().slice(0, 10))}</td>
                  <td className="px-3 py-2">{q.notes ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </Card>

          {editable && (
            <Card title="Add OEM request">
              <form action={addOemRequestAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <input type="hidden" name="requirementId" value={r.id} />
                <label className="block">
                  <span className="label">OEM *</span>
                  <select className="input" name="oemId" required defaultValue="">
                    <option value="" disabled>
                      Select OEM
                    </option>
                    {oemOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.approved ? " (approved)" : ""}
                        {linkedOemIds.has(o.id) ? " · already asked" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Request type</span>
                  <select className="input" name="requestType" defaultValue="rfq">
                    <option value="rfq">RFQ</option>
                    <option value="availability">Availability check</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Channel</span>
                  <input className="input" name="channel" placeholder="email / phone / portal" />
                </label>
                <label className="block">
                  <span className="label">Notes</span>
                  <input className="input" name="notes" />
                </label>
                <div className="sm:col-span-4">
                  <button className="btn btn-primary" type="submit">
                    Record request
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title={`OEM responses (${detail.responses.length})`}>
            <Table
              head={["OEM", "Line", "Type", "Qty", "Unit price", "Lead time", "Valid till", "Remarks"]}
              empty="No OEM responses recorded."
            >
              {detail.responses.map((resp) => (
                <tr key={resp.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2 font-medium">{resp.oemName}</td>
                  <td className="px-3 py-2">{resp.itemDescription}</td>
                  <td className="px-3 py-2">
                    <ResponseTypeBadge type={resp.responseType} />
                  </td>
                  <td className="px-3 py-2 text-right">{resp.quantity}</td>
                  <td className="px-3 py-2 text-right">{resp.unitPrice ? formatINR(resp.unitPrice) : "—"}</td>
                  <td className="px-3 py-2">{resp.leadTimeDays ? `${resp.leadTimeDays} d` : "—"}</td>
                  <td className="px-3 py-2">{formatDate(resp.validUntil)}</td>
                  <td className="px-3 py-2">{resp.remarks ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </Card>

          {editable && detail.oemRequests.length > 0 && (
            <Card title="Record an OEM response">
              <form action={addOemResponseAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <input type="hidden" name="requirementId" value={r.id} />
                <label className="block">
                  <span className="label">Against request *</span>
                  <select className="input" name="oemRequestId" required defaultValue="">
                    <option value="" disabled>
                      Select request
                    </option>
                    {detail.oemRequests.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.oemName} · {labelize(q.requestType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Line item *</span>
                  <select className="input" name="requirementItemId" required defaultValue="">
                    <option value="" disabled>
                      Select line
                    </option>
                    {detail.items.map((i) => (
                      <option key={i.id} value={i.id}>
                        #{i.lineNo} {i.description} (need {i.quantity})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Response type *</span>
                  <select className="input" name="responseType" defaultValue="availability">
                    <option value="availability">Availability (does not count)</option>
                    <option value="quote_indication">Quote indication (does not count)</option>
                    <option value="firm_commitment">Firm commitment (counts toward coverage)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Quantity</span>
                  <input className="input" name="quantity" inputMode="decimal" defaultValue="0" />
                </label>
                <label className="block">
                  <span className="label">Unit price (₹)</span>
                  <input className="input" name="unitPrice" inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="label">Lead time (days)</span>
                  <input className="input" name="leadTimeDays" inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="label">Valid until</span>
                  <input className="input" type="date" name="validUntil" />
                </label>
                <label className="block">
                  <span className="label">Remarks</span>
                  <input className="input" name="remarks" />
                </label>
                <div className="sm:col-span-3 lg:col-span-4">
                  <button className="btn btn-primary" type="submit">
                    Record response
                  </button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "quotes" && (
        <Card
          title={`Quotations (${detail.quotes.length})`}
          action={
            editable ? (
              <form action={createQuoteFromRequirementAction}>
                <input type="hidden" name="requirementId" value={r.id} />
                <button className="btn btn-primary" type="submit">
                  New quotation version
                </button>
              </form>
            ) : undefined
          }
        >
          <Table head={["Quote", "Version", "Status", "Value", "Margin", "Created", ""]} empty="No quotations yet.">
            {detail.quotes.map((q) => (
              <tr key={q.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2">
                  <Link className="font-medium text-[var(--brand)]" href={`/quotations/${q.id}`}>
                    {q.quoteNo}
                  </Link>
                </td>
                <td className="px-3 py-2">v{q.version}</td>
                <td className="px-3 py-2">{labelize(q.status)}</td>
                <td className="px-3 py-2 text-right">{formatINR(q.total)}</td>
                <td className="px-3 py-2 text-right">{q.marginPercent !== null ? `${q.marginPercent.toFixed(1)}%` : "—"}</td>
                <td className="px-3 py-2">{formatDate(new Date(q.createdAt).toISOString().slice(0, 10))}</td>
                <td className="px-3 py-2">
                  <Link className="text-[12px] text-[var(--brand)]" href={`/quotations/${q.id}`}>
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === "timeline" && (
        <div className="space-y-4">
          <Card title="Add a note">
            <form action={addTimelineNoteAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="requirementId" value={r.id} />
              <label className="block flex-1">
                <span className="label">Note</span>
                <input className="input" name="summary" placeholder="Called OEM A, revised lead time to 6 weeks" />
              </label>
              <button className="btn btn-primary" type="submit">
                Add
              </button>
            </form>
          </Card>
          <Card title="Timeline">
            <ol className="space-y-3">
              {detail.timeline.length === 0 && <li className="text-[13px] text-[var(--muted)]">No events yet.</li>}
              {detail.timeline.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-dashed border-[var(--line)] pb-2 last:border-0">
                  <div className="w-32 shrink-0 text-[12px] text-[var(--muted)]">
                    {formatDate(new Date(e.happenedAt).toISOString().slice(0, 10))}
                  </div>
                  <div>
                    <div className="text-[13px]">{e.summary}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {labelize(e.eventType)}
                      {e.actor ? ` · ${e.actor}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <Card title={`Documents (${detail.documents.length})`} action={<Link className="text-[12px] text-[var(--brand)]" href="/documents">Document vault →</Link>}>
          <Table head={["Title", "Type", "Source", "Issued", "Expires", ""]} empty="No documents linked to this requirement.">
            {detail.documents.map((d) => (
              <tr key={d.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2 font-medium">{d.title}</td>
                <td className="px-3 py-2">{labelize(d.docType)}</td>
                <td className="px-3 py-2">{labelize(d.source)}</td>
                <td className="px-3 py-2">{formatDate(d.issueDate)}</td>
                <td className="px-3 py-2">{formatDate(d.expiryDate)}</td>
                <td className="px-3 py-2 text-[12px] text-[var(--muted)]">{d.fileRef ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
