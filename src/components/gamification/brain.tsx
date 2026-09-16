"use client";

// Brain Arena building blocks: GameHeader, DailyStats, XPCard, StreakCard, HintButton, LeaderboardCard, ReviewModal.

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtClock } from "@/lib/time";
import { levelName } from "@/lib/gamification/rules";
import type { Profile, Scope } from "@/lib/gamification/service";
import type { GameId } from "@/lib/gamification/puzzles/types";
import { useApi } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { Avatar, Empty, Icon, Panel, Stat } from "@/components/ui";

export const STATUS_PILL: Record<string, string> = {
  NOT_STARTED: "bg-neutral-100 text-neutral-600",
  IN_PROGRESS: "bg-accent-soft text-accent",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-600",
};
export const STATUS_LABEL: Record<string, string> = { NOT_STARTED: "Ready to play", IN_PROGRESS: "In progress", COMPLETED: "Completed", FAILED: "Missed" };

export function useTicker(active: boolean) {
  const [, setT] = useState(0);
  useEffect(() => { if (!active) return; const t = setInterval(() => setT((x) => x + 1), 500); return () => clearInterval(t); }, [active]);
}

export function GameHeader({ meta, level, status, startedAt, timeMs, mistakes, hints, maxMistakes = 3 }: { meta: { name: string; blurb: string; emoji: string }; level: number; status: string; startedAt: string | null; timeMs: number | null; mistakes: number; hints: number; maxMistakes?: number }) {
  useTicker(status === "IN_PROGRESS");
  const elapsed = timeMs ?? (startedAt ? Date.now() - new Date(startedAt).getTime() : 0);
  return (
    <div className="card flex flex-wrap items-center gap-4 p-5">
      <span className="inline-flex size-12 items-center justify-center rounded-xl bg-accent-soft text-2xl">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl">{meta.name}</h1>
          <span className={`pill ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>
          <span className="pill bg-neutral-100 text-neutral-600" title="Hidden difficulty adapts to your results">{levelName(level)}</span>
        </div>
        <p className="text-sm text-neutral-500">{meta.blurb}</p>
      </div>
      <div className="flex gap-2 text-sm">
        <span className="rounded-xl bg-canvas px-3 py-2 font-mono font-semibold" title="Time">⏱ {fmtClock(elapsed)}</span>
        <span className="rounded-xl bg-canvas px-3 py-2 font-semibold" title="Mistakes">Mistakes <span className={mistakes ? "text-red-600" : ""}>{mistakes}</span> / {maxMistakes}</span>
        <span className="rounded-xl bg-canvas px-3 py-2 font-semibold" title="Hints used">💡 {hints}</span>
      </div>
    </div>
  );
}

export function DailyStats({ profile, solved, total = 4 }: { profile: Profile; solved: number; total?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Daily streak" value={`${profile.streak.current} days`} hint={`Best ${profile.streak.best} · ${profile.streak.shields} shield${profile.streak.shields === 1 ? "" : "s"}`} icon="clock" tone="amber" />
      <Stat label="Solved today" value={`${solved} of ${total}`} hint={solved === total ? "All games done, +50 XP" : `${total - solved} to go`} icon="dashboard" tone="green" />
      <Stat label="Cohort rank" value={profile.cohortRank ? `#${profile.cohortRank}` : "—"} hint={profile.cohortSize ? `of ${profile.cohortSize} in your program` : "Join a program to rank"} icon="users" />
      <Stat label="Total XP" value={profile.totalXp} hint={`Level ${profile.level} · ${profile.need - profile.into} XP to next`} icon="play" />
    </div>
  );
}

export function XPCard({ profile }: { profile: Profile }) {
  const pct = Math.round((profile.into / profile.need) * 100);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between"><p className="eyebrow">Level {profile.level}</p><span className="text-sm font-semibold text-accent">{profile.totalXp} XP</span></div>
      <div className="mt-3 h-2 rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
      <p className="mt-2 text-xs text-neutral-500">{profile.into} / {profile.need} XP into this level</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Logic", profile.logicScore], ["Communication", profile.communicationScore], ["Vocabulary", profile.vocabularyScore]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-canvas py-2"><dt className="eyebrow">{l}</dt><dd className="text-lg font-bold">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

export function StreakCard({ streak }: { streak: Profile["streak"] }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className="inline-flex size-12 items-center justify-center rounded-xl bg-amber-50 text-2xl">🔥</span>
      <div className="flex-1">
        <p className="eyebrow">Streak</p>
        <p className="text-2xl font-bold">{streak.current} <span className="text-sm font-medium text-neutral-500">days · best {streak.best}</span></p>
      </div>
      <div className="text-right text-sm">
        <p className="font-semibold">{streak.shields > 0 ? `🛡 ${streak.shields} shield` : "No shield"}</p>
        <p className="text-xs text-neutral-500">{streak.shields > 0 ? "Keeps your streak if you miss one day." : `${streak.missedDays} day${streak.missedDays === 1 ? "" : "s"} missed`}</p>
      </div>
    </div>
  );
}

export function HintButton({ onHint, hints, disabled, label = "Hint" }: { onHint: () => void; hints: number; disabled?: boolean; label?: string }) {
  return (
    <button type="button" onClick={onHint} disabled={disabled} className="btn-ghost" title="Costs the +5 no-hint bonus">
      💡 {label}{hints ? ` (${hints} used)` : ""}
    </button>
  );
}

type Row = { rank: number; userId: string; name: string; timeMs: number; mistakes: number; hints: number; xp: number };

/** Live ranking for one game today; polls so a cohort-mate finishing shows up within seconds. */
export function LeaderboardCard({ game, meId, date }: { game: GameId; meId: string; date?: string }) {
  const api = useApi();
  const [scope, setScope] = useState<Scope>("cohort");
  const [data, setData] = useState<{ rows: Row[]; me: Row | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ rows: Row[]; me: Row | null }>(`/api/gamification/brain/leaderboard?${new URLSearchParams({ game, scope, ...(date ? { date } : {}) })}`).then((d) => { if (alive && d) setData(d); });
    load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [api, game, scope, date]);

  return (
    <Panel title="Leaderboard" badge={data?.me ? <span className="pill bg-accent-soft text-accent">You #{data.me.rank}</span> : null}
      action={<span className="flex gap-1">{(["cohort", "global", "friends"] as Scope[]).map((s) => <button key={s} type="button" onClick={() => setScope(s)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${scope === s ? "bg-accent text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{s}</button>)}</span>}>
      {!data ? <p className="text-sm text-neutral-400">Loading…</p>
        : data.rows.length === 0 ? <Empty>{scope === "friends" ? "Friends are coming soon." : scope === "cohort" ? "Nobody in your cohort has finished yet. Be first." : "No one has finished today yet."}</Empty>
        : (
          <ol className="divide-y divide-neutral-100">
            {data.rows.slice(0, 10).map((r) => (
              <li key={r.userId} className={`flex items-center gap-3 py-2.5 ${r.userId === meId ? "rounded-lg bg-accent-soft/60 px-2" : ""}`}>
                <span className="w-6 text-sm font-bold text-neutral-400">{r.rank}</span>
                <Avatar name={r.name} className="size-8 text-[10px]" />
                <span className="flex-1 truncate text-sm font-semibold">{r.name}{r.userId === meId ? " (you)" : ""}</span>
                <span className="font-mono text-sm font-semibold">{fmtClock(r.timeMs)}</span>
                <span className="w-16 text-right text-xs text-neutral-500">{r.mistakes} ✕ · {r.hints} 💡</span>
              </li>
            ))}
          </ol>
        )}
    </Panel>
  );
}

export function ReviewModal({ open, onClose, result, meta, rank }: {
  open: boolean; onClose: () => void; meta: { name: string; emoji: string };
  result: { status: string; timeMs: number | null; mistakes: number; hints: number; xp: { source: string; amount: number }[]; levelChange?: number } | null; rank: number | null;
}) {
  const won = result?.status === "COMPLETED";
  const total = result?.xp.reduce((n, p) => n + p.amount, 0) ?? 0;
  const NAMES: Record<string, string> = { complete: "Completed", perfect: "Perfect run", no_hint: "No hints", streak: "Daily streak", all_games: "All four games" };
  return (
    <Modal open={open} onClose={onClose} title={`${meta.emoji} ${won ? "Solved!" : "Out of tries"} — ${meta.name}`} subtitle={won ? "Come back after midnight for tomorrow's puzzle." : "Review the solution below and try again tomorrow."} className="max-w-md">
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[[fmtClock(result.timeMs ?? 0), "Time"], [String(result.mistakes), "Mistakes"], [rank ? `#${rank}` : "—", "Rank"]].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-canvas py-3"><p className="text-xl font-bold">{v}</p><p className="eyebrow">{l}</p></div>
            ))}
          </div>
          {won && (
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 px-4 text-sm">
              {result.xp.map((p) => <li key={p.source} className="flex justify-between py-2"><span>{NAMES[p.source] ?? p.source}</span><span className="font-semibold text-accent">+{p.amount} XP</span></li>)}
              <li className="flex justify-between py-2 font-bold"><span>Total</span><span className="text-accent">+{total} XP</span></li>
            </ul>
          )}
          {!!result.levelChange && <p className={`rounded-xl px-4 py-2 text-sm font-semibold ${result.levelChange > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{result.levelChange > 0 ? "Difficulty went up. Nice." : "Difficulty eased a little. Keep going."}</p>}
          <div className="flex justify-end gap-2">
            <Link href="/gamification/brain" className="btn-ghost">All games</Link>
            <button type="button" className="btn-primary" onClick={onClose}><Icon name="play" className="size-4" /> Review solution</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
