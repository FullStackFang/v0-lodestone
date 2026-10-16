"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { n: "01", label: "Cards", href: "/lodestone" },
  { n: "02", label: "Digest", href: "/lodestone/digest" },
  { n: "03", label: "Map", href: "/lodestone/map", operator: true },
];

/** Cards is the home of the card and token pages too; the others match by
 *  prefix. */
function active(href: string, pathname: string): boolean {
  if (href === "/lodestone") return pathname === "/lodestone" || pathname.startsWith("/lodestone/cards") || pathname.startsWith("/lodestone/tokens");
  return pathname === href || pathname.startsWith(href + "/");
}

export function WorkspaceTabs({ operator }: { operator: boolean }) {
  const pathname = usePathname() ?? "";
  return <nav className="tabs" aria-label="Workspace">
    {TABS.filter((t) => !t.operator || operator).map((t) => (
      <Link key={t.href} className={active(t.href, pathname) ? "tab on" : "tab"} href={t.href} aria-current={active(t.href, pathname) ? "page" : undefined}>
        <i>{t.n}</i>{t.label}
      </Link>
    ))}
  </nav>;
}
