import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={clsx("rounded-lg border border-[var(--line)] bg-white", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-[#344054]">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES | string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        TONES[tone] ?? TONES.gray,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "gray",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4 hover:border-[#c7cdd6]">
      <div className="text-[12px] font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-[var(--muted)]">{hint}</div>}
      <div className="mt-2">
        <Badge tone={tone}> </Badge>
      </div>
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-[var(--muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
  className,
  hint,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export function Table({
  head,
  children,
  empty,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
}) {
  const rows = Array.isArray(children) ? children : [children];
  const isEmpty = rows.flat().filter(Boolean).length === 0;
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
      <table className="text-[13px]">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[#fafbfc] text-left">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold text-[#475467] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-8 text-center text-[var(--muted)]">
                {empty ?? "Nothing here yet."}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-[13px] text-[var(--muted)]">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6">
      <p className="font-semibold text-red-700">{title}</p>
      {detail && <p className="mt-1 text-[12px] text-red-600">{detail}</p>}
    </div>
  );
}

export function Divider() {
  return <hr className="my-3 border-[var(--line)]" />;
}

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-4 border-b border-dashed border-[var(--line)] py-1">
          <dt className="text-[12px] text-[var(--muted)]">{k}</dt>
          <dd className="text-right text-[13px] font-medium">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
