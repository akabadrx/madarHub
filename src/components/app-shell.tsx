"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, CalendarDays, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquareText, Package, Settings, Users, X, Clock3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/auth-actions";

const links = [
  ["Dashboard", "/", LayoutDashboard], ["Leads", "/leads", Users], ["Lead Assistant", "/lead-assistant", Sparkles],
  ["Follow-ups", "/follow-ups", Clock3],
  ["Visits", "/visits", CalendarDays], ["Payments", "/payments", CreditCard], ["Packages", "/packages", Package],
  ["Message Templates", "/templates", MessageSquareText], ["Settings", "/settings", Settings],
] as const;

function Nav({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return <nav className="space-y-1">{links.map(([label, href, Icon]) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return <Link key={href} href={href} onClick={close} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/7 hover:text-white")}><Icon size={18} />{label}</Link>;
  })}</nav>;
}

function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/7 hover:text-white">
        <LogOut size={18} />Sign out
      </button>
    </form>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The login screen renders without the app chrome.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] md:grid md:grid-cols-[250px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col bg-[#0b1f3a] p-5 text-white md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#d4a72c] font-black text-[#0b1f3a]">M</div>
          <div><p className="font-bold tracking-tight">Madar Hub</p><p className="text-xs text-slate-400">Coworking CRM</p></div>
        </div>
        <Nav />
        <div className="mt-auto space-y-3">
          <LogoutButton />
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300"><BarChart3 className="mb-2 text-[#d4a72c]" size={18} />Built for fast WhatsApp lead follow-up.</div>
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#d4a72c] font-black text-[#0b1f3a]">M</div><span className="font-bold text-[#0b1f3a]">Madar Hub CRM</span></div>
        <button className="btn btn-outline min-h-9 p-2" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
      </header>
      {open && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} aria-label="Close navigation" /><aside className="absolute inset-y-0 left-0 w-[280px] bg-[#0b1f3a] p-5 text-white shadow-2xl"><div className="mb-7 flex items-center justify-between"><span className="font-bold">Madar Hub CRM</span><button onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button></div><Nav close={() => setOpen(false)} /><div className="mt-6 border-t border-white/10 pt-3"><LogoutButton /></div></aside></div>}
      <main className="min-w-0 p-4 sm:p-6 md:col-start-2 lg:p-8">{children}</main>
    </div>
  );
}
