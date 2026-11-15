"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [["/", "Dashboard"], ["/campaigns/new", "New campaign"], ["/senders", "Senders"]];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1 bg-slate-900 px-4 py-3 text-sm text-slate-300 lg:min-h-screen lg:w-56 lg:flex-col lg:items-stretch lg:gap-1 lg:px-3 lg:py-6">
      <Link href="/" className="mr-4 flex items-center px-2 lg:mb-6 lg:mr-0">
        <img src="/logo.png" alt="Sire Mailer" className="h-9 w-auto lg:h-auto lg:w-44" />
      </Link>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href}
          className={`rounded-md px-3 py-2 hover:bg-slate-800 ${path === href ? "bg-slate-800 text-white" : ""}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}