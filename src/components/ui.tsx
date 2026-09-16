// Small presentational pieces shared by every page. No hooks, safe in server components.

export const ICONS = {
  dashboard: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  cap: "M12 4 2 9l10 5 10-5-10-5zM6 11.5V17c0 1.5 3 3 6 3s6-1.5 6-3v-5.5",
  users: "M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 19v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  video: "M3 7h12v10H3zM15 10l6-3v10l-6-3",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  plus: "M12 5v14M5 12h14",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  storage: "M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01",
  play: "M8 5v14l11-7z",
  book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM19 11a7 7 0 0 1-14 0M12 18v3M8 21h8",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Avatar({ name, className = "size-9 text-xs" }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ${className}`}>
      {initials}
    </span>
  );
}

const TONES = {
  accent: "bg-accent-soft text-accent",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
} as const;

export function Stat({ label, value, hint, icon, tone = "accent" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: IconName; tone?: keyof typeof TONES }) {
  return (
    <div className="card flex items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
        {hint && <p className="mt-2 text-sm text-neutral-500">{hint}</p>}
      </div>
      <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon name={icon} />
      </span>
    </div>
  );
}

export function Panel({ title, badge, action, children, className = "" }: { title: React.ReactNode; badge?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-0 ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <h2 className="flex items-center gap-2">{title}{badge}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">{children}</p>;
}

export function fmtBytes(b: number) {
  return b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`;
}
