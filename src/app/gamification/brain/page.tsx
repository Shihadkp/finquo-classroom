import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/Nav";
import { Empty, Panel } from "@/components/ui";
import { DailyStats, LeaderboardCard, STATUS_LABEL, STATUS_PILL } from "@/components/gamification/brain";
import { GAME_IDS, levelName } from "@/lib/gamification/rules";
import { GAME_META } from "@/lib/gamification/puzzles";
import { COACH } from "@/lib/gamification/aria";
import { profile, todayFor } from "@/lib/gamification/service";
import { fmtClock } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function BrainArenaPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const date = todayFor(user);
  const [prof, attempts, skills, history] = await Promise.all([
    profile(user),
    db.puzzleAttempt.findMany({ where: { userId: user.id, date }, select: { game: true, status: true, timeMs: true, mistakes: true, hints: true, xp: true } }),
    db.playerSkill.findMany({ where: { userId: user.id } }),
    db.puzzleAttempt.findMany({ where: { userId: user.id, status: { not: "IN_PROGRESS" }, date: { not: date } }, orderBy: { completedAt: "desc" }, take: 20, select: { id: true, game: true, date: true, status: true, timeMs: true, mistakes: true, hints: true, xp: true } }),
  ]);
  const solved = attempts.filter((a) => a.status === "COMPLETED").length;
  const inProgress = attempts.find((a) => a.status === "IN_PROGRESS")?.game as (typeof GAME_IDS)[number] | undefined;

  return (
    <Page user={user} back={{ href: "/gamification", label: "Gamification" }} links={[{ href: "/gamification/speaking", label: COACH.product }]} eyebrow="Brain Arena" title="Daily Brain Games" subtitle={`${date} · new puzzles at midnight, ${user.timezone}`}>
      <div className="mb-8"><DailyStats profile={prof} solved={solved} /></div>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {GAME_IDS.map((g) => {
          const a = attempts.find((x) => x.game === g);
          const st = a?.status ?? "NOT_STARTED";
          const level = skills.find((s) => s.game === g)?.level ?? 1;
          const focus = inProgress === g || (!inProgress && st === "NOT_STARTED" && !attempts.some((x) => x.game === g));
          return (
            <article key={g} className={`card flex flex-col gap-3 p-5 ${focus ? "ring-2 ring-accent" : ""}`}>
              <div className="flex items-center justify-between"><span className={`pill ${STATUS_PILL[st]}`}>{STATUS_LABEL[st]}</span><span className="text-xs text-neutral-400">{levelName(level)}</span></div>
              <div className="flex items-center gap-2"><span className="text-2xl">{GAME_META[g].emoji}</span><h2 className="text-lg">{GAME_META[g].name}</h2></div>
              <p className="flex-1 text-sm text-neutral-500">{GAME_META[g].blurb}</p>
              {a && st !== "IN_PROGRESS" ? (
                <div className="rounded-xl bg-canvas px-3 py-2 text-xs"><span className="font-semibold">⏱ {fmtClock(a.timeMs ?? 0)}</span> · {a.mistakes} mistakes · {a.hints} hints{st === "COMPLETED" ? ` · +${a.xp} XP` : ""}</div>
              ) : <div className="rounded-xl bg-canvas px-3 py-2 text-xs text-neutral-500">{st === "IN_PROGRESS" ? "Clock is running" : "~3–5 min"}</div>}
              <Link href={`/gamification/brain/${g}`} className={st === "NOT_STARTED" || st === "IN_PROGRESS" ? "btn-primary" : "btn-ghost"}>
                {st === "IN_PROGRESS" ? "Continue →" : st === "NOT_STARTED" ? "▶ Play" : "Review solution"}
              </Link>
            </article>
          );
        })}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel title="Recent results">
          {history.length === 0 ? <Empty>Your past puzzles show up here.</Empty> : (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-canvas"><tr><th className="th">Date</th><th className="th">Game</th><th className="th">Result</th><th className="th">Time</th><th className="th">Mistakes</th><th className="th">XP</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {history.map((h) => (
                    <tr key={h.id}><td className="td text-neutral-600">{h.date}</td><td className="td font-semibold">{GAME_META[h.game as keyof typeof GAME_META].emoji} {GAME_META[h.game as keyof typeof GAME_META].name}</td><td className="td"><span className={`pill ${STATUS_PILL[h.status]}`}>{STATUS_LABEL[h.status]}</span></td><td className="td font-mono">{fmtClock(h.timeMs ?? 0)}</td><td className="td">{h.mistakes} · {h.hints} 💡</td><td className="td font-semibold text-accent">+{h.xp}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <LeaderboardCard game={inProgress ?? "queens"} meId={user.id} />
      </div>
    </Page>
  );
}
