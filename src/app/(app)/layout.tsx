import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/rbac";
import { NavLinks, type NavItem } from "@/components/nav";
import { logoutAction } from "../actions/auth";

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/requirements", label: "Requirements / RFI" },
  { href: "/oems", label: "OEM master & sourcing" },
  { href: "/quotations", label: "Quotations" },
  { href: "/orders", label: "Orders & fulfilment" },
  { href: "/documents", label: "Documents & compliance" },
  { href: "/ask", label: "Ask" },
  { href: "/admin", label: "Admin & audit" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-2.5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--brand)] text-[12px] font-bold text-white">
              IB
            </span>
            <span className="font-semibold tracking-tight">Inverbrass CRM</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[13px] font-medium leading-tight">{user.name}</div>
              <div className="text-[11px] text-[var(--muted)]">{roleLabel(user.role)}</div>
            </div>
            <form action={logoutAction}>
              <button className="btn btn-ghost" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-5">
        <aside className="hidden w-56 shrink-0 md:block">
          <NavLinks items={NAV} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
