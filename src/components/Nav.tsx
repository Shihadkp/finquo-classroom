"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { Avatar, Icon, type IconName } from "./ui";
import { SignOut } from "./SignOut";

type Item = { href: string; label: string; icon: IconName };

function linksFor(user: SessionUser): Item[] {
  if (user.role === "ADMIN") {
    return [
      { href: "/admin", label: "Dashboard", icon: "dashboard" },
      { href: "/schedule", label: "Schedule", icon: "calendar" },
      { href: "/admin/students", label: "Students", icon: "cap" },
      { href: "/admin/mentors", label: "Mentors", icon: "users" },
      { href: "/availability", label: "Availability", icon: "clock" },
      { href: "/admin/programs", label: "Programs", icon: "book" },
      { href: "/recordings", label: "Recordings", icon: "video" },
      { href: "/gamification", label: "Gamification", icon: "spark" },
    ];
  }
  if (user.role === "MENTOR") {
    return [
      { href: "/schedule", label: "Schedule", icon: "calendar" },
      { href: "/availability", label: "Availability", icon: "clock" },
      { href: "/gamification", label: "Gamification", icon: "spark" },
    ];
  }
  // Student portal. Recordings are admin-only (QA), so they never appear here.
  return [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/schedule", label: "My schedule", icon: "calendar" },
    { href: "/attendance", label: "My attendance", icon: "clock" },
    { href: "/gamification", label: "Gamification", icon: "spark" },
  ];
}

function Brand() {
  return (
    <Link href="/schedule" className="flex items-center gap-2.5">
      <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name="cap" /></span>
      <span className="leading-tight">
        <span className="block text-base font-bold tracking-tight">ClassRoom</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Console</span>
      </span>
    </Link>
  );
}

function useActive(links: Item[]) {
  const path = usePathname();
  // Longest matching prefix wins, so /admin/students lights "Students", not "Dashboard".
  return links.reduce<Item | null>((best, l) => {
    const hit = path === l.href || path.startsWith(l.href + "/");
    return hit && (!best || l.href.length > best.href.length) ? l : best;
  }, null)?.href;
}

export function Nav({ user }: { user: SessionUser }) {
  const links = linksFor(user);
  const active = useActive(links);
  const canBook = user.role !== "STUDENT";

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-neutral-200/70 bg-white px-4 py-5 md:flex">
        <Brand />
        <p className="eyebrow mt-8 px-3">Navigation</p>
        <nav className="mt-2 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active === l.href ? "bg-accent text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}`}
            >
              <Icon name={l.icon} />
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-xl border border-neutral-200/70 p-3">
          <Avatar name={user.name} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-accent">{user.role}</span>
          </span>
          <SignOut />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-neutral-200/70 bg-white/80 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-8">
          <span className="md:hidden"><Brand /></span>
          <span className="ml-auto" />
          {canBook && (
            <Link href="/schedule/new" className="btn-primary"><Icon name="plus" className="size-4" /> Book a class</Link>
          )}
          <span className="hidden items-center gap-2 md:flex">
            <Avatar name={user.name} className="size-8 text-[10px]" />
            <span className="leading-tight">
              <span className="block text-sm font-semibold">{user.name}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{user.role}</span>
            </span>
          </span>
          <span className="md:hidden"><SignOut /></span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${active === l.href ? "bg-accent-soft text-accent" : "text-neutral-600"}`}>{l.label}</Link>
          ))}
        </nav>
      </header>
    </>
  );
}

export function Page({
  user, children, title, eyebrow, subtitle, action, back, links,
}: { user: SessionUser; title?: string; eyebrow?: string; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; back?: { href: string; label: string }; links?: { href: string; label: string }[] }) {
  return (
    <div className="min-h-screen md:pl-64">
      <Nav user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        {(back || links) && (
          <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
            {back && <Link href={back.href} className="btn-ghost px-3 py-1.5 text-xs">← {back.label}</Link>}
            <span className="flex-1" />
            {links?.map((l) => <Link key={l.href} href={l.href} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft">{l.label} →</Link>)}
          </div>
        )}
        {title && (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              {eyebrow && <p className="eyebrow mb-2 text-accent">{eyebrow}</p>}
              <h1>{title}</h1>
              {subtitle && <p className="mt-1.5 text-neutral-500">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
