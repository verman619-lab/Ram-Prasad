import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, customers, importBatches, quotations, requirements, taxonomies, users } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { can, roleLabel } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { Badge, Card, ErrorState, PageHeader, Table } from "@/components/ui";
import { labelize } from "@/components/status";
import { addTaxonomyAction, createUserAction, markTrustedAction, toggleUserActiveAction, updateSettingsAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

const TABS = [
  ["settings", "Settings"],
  ["users", "Users & roles"],
  ["taxonomy", "Taxonomy"],
  ["import", "Import & trust"],
  ["audit", "Audit trail"],
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const actor = await requireUser();
  const { tab = "settings", error } = await searchParams;

  let data;
  try {
    const db = await getDb();
    const [settings, userRows, taxRows, auditRows, batchRows, untrustedRequirements, untrustedQuotations] =
      await Promise.all([
        getSettings(db),
        db.select().from(users).orderBy(asc(users.name)),
        db.select().from(taxonomies).orderBy(asc(taxonomies.kind), asc(taxonomies.sort)),
        db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            entityType: auditLogs.entityType,
            entityId: auditLogs.entityId,
            summary: auditLogs.summary,
            createdAt: auditLogs.createdAt,
            actor: users.name,
          })
          .from(auditLogs)
          .leftJoin(users, eq(users.id, auditLogs.actorUserId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(100),
        db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(50),
        db
          .select({
            id: requirements.id,
            refNo: requirements.refNo,
            title: requirements.title,
            customer: customers.name,
            createdAt: requirements.createdAt,
          })
          .from(requirements)
          .innerJoin(customers, eq(customers.id, requirements.customerId))
          .where(eq(requirements.dataTrust, "untrusted"))
          .orderBy(desc(requirements.createdAt))
          .limit(50),
        db
          .select({
            id: quotations.id,
            quoteNo: quotations.quoteNo,
            status: quotations.status,
            total: quotations.total,
            createdAt: quotations.createdAt,
          })
          .from(quotations)
          .where(eq(quotations.dataTrust, "untrusted"))
          .orderBy(desc(quotations.createdAt))
          .limit(50),
      ]);
    data = { settings, userRows, taxRows, auditRows, batchRows, untrustedRequirements, untrustedQuotations };
  } catch (err) {
    return <ErrorState title="Could not load admin" detail={err instanceof Error ? err.message : String(err)} />;
  }

  const { settings, userRows, taxRows, auditRows, batchRows, untrustedRequirements, untrustedQuotations } = data;
  const canSettings = can(actor.role, "manage_settings");
  const canUsers = can(actor.role, "manage_users");

  const lossReasons = taxRows.filter((t) => t.kind === "loss_reason");

  return (
    <div>
      <PageHeader
        title="Admin & audit"
        subtitle="Roles, approvals, settings, configurable labels, and the audit trail of material changes."
      />

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--line)]">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/admin?tab=${key}`}
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

      {tab === "settings" && (
        <Card title="Application settings">
          {!canSettings ? (
            <p className="text-[13px] text-[var(--muted)]">Only owner/management can change settings.</p>
          ) : (
            <form action={updateSettingsAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className="label">Company name</span>
                <input className="input" name="company_name" defaultValue={settings.company_name} />
              </label>
              <label className="block">
                <span className="label">OEM capacity mode</span>
                <select className="input" name="oem_capacity_mode" defaultValue={settings.oem_capacity_mode}>
                  <option value="per_order">Per order (conservative)</option>
                  <option value="global">Global across orders</option>
                </select>
                <span className="mt-1 block text-[11px] text-[var(--muted)]">
                  Decides whether a new requirement sees an OEM&apos;s full capacity or only what is left after other
                  orders. The other figure is always shown alongside.
                </span>
              </label>
              <label className="block">
                <span className="label">Margin floor %</span>
                <input className="input" name="margin_floor_percent" defaultValue={settings.margin_floor_percent} />
              </label>
              <label className="block">
                <span className="label">Require override for uncovered quantity</span>
                <select
                  className="input"
                  name="quote_uncovered_override_required"
                  defaultValue={settings.quote_uncovered_override_required}
                >
                  <option value="true">Yes — block submission without override</option>
                  <option value="false">No — allow submission</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Commission milestone</span>
                <select className="input" name="commission_milestone" defaultValue={settings.commission_milestone}>
                  <option value="oem_paid">OEM fully paid</option>
                  <option value="oem_part_paid">OEM part-paid</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Follow-up: no response after (days)</span>
                <input className="input" name="followup_no_response_days" defaultValue={settings.followup_no_response_days} />
              </label>
              <label className="block">
                <span className="label">Document expiry warning (days)</span>
                <input className="input" name="document_expiry_warning_days" defaultValue={settings.document_expiry_warning_days} />
              </label>
              <div className="flex items-end">
                <button className="btn btn-primary" type="submit">
                  Save settings
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      {tab === "users" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title={`Users (${userRows.length})`} className="lg:col-span-2">
            <Table head={["Name", "Email", "Role", "Status", ""]} empty="No users.">
              {userRows.map((u) => (
                <tr key={u.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{roleLabel(u.role)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={u.active ? "green" : "gray"}>{u.active ? "Active" : "Disabled"}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {canUsers && u.id !== actor.id && (
                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button className="btn btn-ghost px-2 py-1" type="submit">
                          {u.active ? "Disable" : "Enable"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          {canUsers && (
            <Card title="Add a user">
              <form action={createUserAction} className="space-y-2">
                <label className="block">
                  <span className="label">Name *</span>
                  <input className="input" name="name" required />
                </label>
                <label className="block">
                  <span className="label">Email *</span>
                  <input className="input" type="email" name="email" required />
                </label>
                <label className="block">
                  <span className="label">Role</span>
                  <select className="input" name="role" defaultValue="sales">
                    <option value="owner">Owner</option>
                    <option value="management">Management</option>
                    <option value="sales">Sales</option>
                    <option value="operations">Operations</option>
                    <option value="finance">Finance</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Temporary password</span>
                  <input className="input" name="password" minLength={6} required />
                </label>
                <button className="btn btn-primary" type="submit">
                  Create user
                </button>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "taxonomy" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title={`Configurable labels (${taxRows.length})`} className="lg:col-span-2">
            <Table head={["Kind", "Code", "Label", "Active"]} empty="No taxonomy entries.">
              {taxRows.map((t) => (
                <tr key={t.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">{labelize(t.kind)}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{t.code}</td>
                  <td className="px-3 py-2">{t.label}</td>
                  <td className="px-3 py-2">{t.active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </Table>
            {lossReasons.length === 0 && (
              <p className="mt-2 text-[12px] text-[var(--muted)]">
                Loss reasons fall back to the built-in list until entries are added here.
              </p>
            )}
          </Card>

          {canSettings && (
            <Card title="Add a label">
              <form action={addTaxonomyAction} className="space-y-2">
                <label className="block">
                  <span className="label">Kind</span>
                  <select className="input" name="kind" defaultValue="loss_reason">
                    <option value="loss_reason">Loss reason</option>
                    <option value="document_type">Document type</option>
                    <option value="source">Enquiry source</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Code</span>
                  <input className="input" name="code" placeholder="e.g. budget_cut" />
                </label>
                <label className="block">
                  <span className="label">Label</span>
                  <input className="input" name="label" placeholder="e.g. Budget cut" />
                </label>
                <button className="btn btn-primary" type="submit">
                  Add label
                </button>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "import" && (
        <div className="space-y-4">
          <Card title="How importing works">
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-[var(--muted)]">
              <li>
                Run <code>npm run extract:workbooks</code> to export every sheet in <code>Template/</code> to CSV
                (uses Excel on this machine).
              </li>
              <li>
                Run <code>npm run import:excel</code> for a dry run, then{" "}
                <code>npm run import:excel -- --commit</code> to write. Imported requirements and quotations are
                marked <strong>untrusted</strong> so they never rank above verified history in bid comparison.
              </li>
              <li>Verify rows below and mark the ones you trust. Only trusted rows should drive pricing.</li>
            </ol>
          </Card>

          <Card title={`Import runs (${batchRows.length})`}>
            <Table head={["Source file", "Kind", "Committed", "When"]} empty="No import runs recorded yet.">
              {batchRows.map((b) => (
                <tr key={b.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2 font-mono text-[12px]">{b.sourceFile}</td>
                  <td className="px-3 py-2">{labelize(b.kind)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={b.committed ? "green" : "amber"}>{b.committed ? "Committed" : "Draft"}</Badge>
                  </td>
                  <td className="px-3 py-2">{formatDate(new Date(b.createdAt).toISOString().slice(0, 10))}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title={`Untrusted requirements (${untrustedRequirements.length})`}>
            <Table head={["Ref", "Customer", "Title", "Imported", ""]} empty="No untrusted requirements.">
              {untrustedRequirements.map((r) => (
                <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">
                    <Link className="text-[var(--brand)]" href={`/requirements/${r.id}`}>
                      {r.refNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.customer}</td>
                  <td className="px-3 py-2">{r.title ?? "—"}</td>
                  <td className="px-3 py-2">{formatDate(new Date(r.createdAt).toISOString().slice(0, 10))}</td>
                  <td className="px-3 py-2">
                    {canSettings && (
                      <form action={markTrustedAction}>
                        <input type="hidden" name="entity" value="requirement" />
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="trust" value="trusted" />
                        <button className="btn btn-ghost px-2 py-1" type="submit">
                          Mark trusted
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title={`Untrusted quotations (${untrustedQuotations.length})`}>
            <Table head={["Quote", "Status", "Value", "Imported", ""]} empty="No untrusted quotations.">
              {untrustedQuotations.map((q) => (
                <tr key={q.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">
                    <Link className="text-[var(--brand)]" href={`/quotations/${q.id}`}>
                      {q.quoteNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{labelize(q.status)}</td>
                  <td className="px-3 py-2 text-right">{formatINR(q.total)}</td>
                  <td className="px-3 py-2">{formatDate(new Date(q.createdAt).toISOString().slice(0, 10))}</td>
                  <td className="px-3 py-2">
                    {canSettings && (
                      <form action={markTrustedAction}>
                        <input type="hidden" name="entity" value="quotation" />
                        <input type="hidden" name="id" value={q.id} />
                        <input type="hidden" name="trust" value="trusted" />
                        <button className="btn btn-ghost px-2 py-1" type="submit">
                          Mark trusted
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {tab === "audit" && (
        <Card title="Audit trail (latest 100)">
          <Table head={["When", "Actor", "Action", "Entity", "Summary"]} empty="No audit entries yet.">
            {auditRows.map((a) => (
              <tr key={a.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2">{formatDate(new Date(a.createdAt).toISOString().slice(0, 10))}</td>
                <td className="px-3 py-2">{a.actor ?? "system"}</td>
                <td className="px-3 py-2">{labelize(a.action)}</td>
                <td className="px-3 py-2">
                  {labelize(a.entityType)}
                  <div className="font-mono text-[10px] text-[var(--muted)]">{a.entityId.slice(0, 8)}</div>
                </td>
                <td className="px-3 py-2">{a.summary ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
