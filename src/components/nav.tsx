"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "rounded-md px-3 py-1.5 text-[13px] font-medium",
              active ? "bg-[#eef2ff] text-[var(--brand)]" : "text-[#475467] hover:bg-[#f2f4f7]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
