import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Page } from "@/components/Nav";
import { Icon } from "@/components/ui";
import { DailyStats, STATUS_LABEL, STATUS_PILL, StreakCard, XPCard } from "@/components/gamification/brain";
import { GAME_IDS } from "@/lib/gamification/rules";
import { GAME_META } from "@/lib/gamification/puzzles";
import { profile, todayFor } from "@/lib/gamification/service";
import { speakingOverview } from "@/lib/gamification/speakingService";
import { COACH } from "@/lib/gamification/aria";
import { Mascot } from "@/components/gamification/aria";
import { fmtClock } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function GamificationPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const date = todayFor(user);
  const [prof, attempts, speaking] = await Promise.all([
    profile(user),
    db.puzzleAttempt.findMany({ where: { userId: user.id, date }, select: { game: true, status: true, timeMs: true } }),
    speakingOverview(user),
  ]);
  const solved = attempts.filter((a) => a.status === "COMPLETED").length;

  return (
    <Page user={user} eyebrow="Gamification" title="Daily practice" subtitle={`Brain Arena for logic, ${COACH.product} for speaking. One shared profile, one streak.`}>
      <div className="mb-8"><DailyStats profile={prof} solved={solved} /></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2>🧠 Brain Arena <span className="text-sm font-medium text-neutral-500">· today&apos;s four</span></h2>
              <Link href="/gamification/brain" className="text-sm font-semibold text-accent hover:underline">Open arena →</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {GAME_IDS.map((g) => {
                const a = attempts.find((x) => x.game === g);
                const st = a?.status ?? "NOT_STARTED";
                return (
                  <Link key={g} href={`/gamification/brain/${g}`} className="flex items-center gap-3 rounded-xl border border-neutral-100 p-4 transition hover:border-accent">
                    <span className="text-2xl">{GAME_META[g].emoji}</span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{GAME_META[g].name}</span><span className="block truncate text-xs text-neutral-500">{GAME_META[g].blurb}</span></span>
                    <span className={`pill ${STATUS_PILL[st]}`}>{a?.timeMs && st === "COMPLETED" ? fmtClock(a.timeMs) : STATUS_LABEL[st]}</span>
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2"><Mascot className="size-7" /> {COACH.product} <span className="text-sm font-medium text-neutral-500">· {COACH.tagline}</span></h2>
              <Link href="/gamification/speaking" className="text-sm font-semibold text-accent hover:underline">Open coach →</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="rounded-xl bg-canvas p-4">
                <p className="eyebrow text-accent">Today&apos;s mission · {speaking.mission.minutes} min · +40 XP</p>
                <p className="mt-1 font-semibold">{speaking.mission.title}</p>
                <p className="text-sm text-neutral-500">{speaking.mission.prompt}</p>
              </div>
              <Link href={speaking.mission.done ? "/gamification/speaking/history" : "/gamification/speaking/session?mission=1"} className={`self-center ${speaking.mission.done ? "btn-ghost" : "btn-primary"}`}>
                <Icon name="mic" className="size-4" /> {speaking.mission.done ? "Mission done" : "Start mission"}
              </Link>
            </div>
            <p className="mt-3 text-xs text-neutral-500">Daily speaking: {speaking.todayMinutes} min · Fluency index {speaking.overall.fluency || "—"} / 100</p>
          </section>
        </div>
        <div className="space-y-6">
          <XPCard profile={prof} />
          <StreakCard streak={prof.streak} />
        </div>
      </div>
    </Page>
  );
}
