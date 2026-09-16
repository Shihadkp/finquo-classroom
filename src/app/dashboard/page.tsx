import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classInclude } from "@/lib/classes";
import { toDTO } from "@/lib/types";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { Page } from "@/components/Nav";
import { Avatar, Empty, Icon, Panel, Stat } from "@/components/ui";
import { ClassCard } from "@/app/schedule/ClassCard";
import { GAME_IDS } from "@/lib/gamification/rules";
import { GAME_META } from "@/lib/gamification/puzzles";
import { profile, todayFor } from "@/lib/gamification/service";
import { speakingOverview } from "@/lib/gamification/speakingService";

export const dynamic = "force-dynamic";

/** Student home: what's next, how the program is going, attendance, and today's practice. */
export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "MENTOR") redirect("/schedule");

  const date = todayFor(user);
  const [me, rows, prof, attempts, speaking] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { program: { select: { name: true, sessions: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } } } } } }),
    db.class.findMany({ where: { studentId: user.id }, include: classInclude, orderBy: { startAt: "asc" } }),
    profile(user),
    db.puzzleAttempt.findMany({ where: { userId: user.id, date }, select: { game: true, status: true } }),
    speakingOverview(user),
  ]);
  const classes = rows.map(toDTO);
  const now = Date.now();
  const live = classes.find((c) => c.status === "SCHEDULED" && new Date(c.startAt).getTime() <= now && new Date(c.endAt).getTime() > now) ?? null;
  const upcoming = classes.filter((c) => c.status === "SCHEDULED" && new Date(c.startAt).getTime() > now);
  const completed = classes.filter((c) => c.status === "COMPLETED");
  const attended = completed.filter((c) => c.studentJoinedAt).length;
  const rate = completed.length ? Math.round((attended / completed.length) * 100) : null;
  const sessions = me?.program?.sessions ?? [];
  const doneIds = new Set(completed.map((c) => c.sessionId));
  const progress = sessions.length ? Math.round((sessions.filter((s) => doneIds.has(s.id)).length / sessions.length) * 100) : null;
  const solved = attempts.filter((a) => a.status === "COMPLETED").length;
  const first = user.name.split(" ")[0];

  return (
    <Page user={user} eyebrow="Student portal" title={`Hi ${first} 👋`} subtitle={live ? "Your class is live right now." : upcoming[0] ? `Next class ${fmtDateTime(upcoming[0].startAt, user.timezone)}.` : "No class booked yet. Your mentor will schedule the next one."}>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Program progress" value={progress === null ? "—" : `${progress}%`} hint={me?.program ? `${me.program.name} · ${sessions.filter((s) => doneIds.has(s.id)).length}/${sessions.length} sessions` : "Not enrolled yet"} icon="book" />
        <Stat label="Attendance" value={rate === null ? "—" : `${rate}%`} hint={`${attended} of ${completed.length} classes attended`} icon="clock" tone={rate !== null && rate < 80 ? "amber" : "green"} />
        <Stat label="Upcoming classes" value={upcoming.length} hint={upcoming[0] ? `Next: ${fmtTime(upcoming[0].startAt, user.timezone)} with ${upcoming[0].mentor.name}` : "Nothing booked"} icon="calendar" />
        <Stat label="Streak" value={`${prof.streak.current} days`} hint={`Level ${prof.level} · ${prof.totalXp} XP`} icon="spark" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {live && (
            <section>
              <h2 className="mb-3 flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" /></span> Live now</h2>
              <ClassCard cls={live} user={user} live />
            </section>
          )}
          <Panel title="Next classes" badge={<span className="pill bg-accent-soft text-accent">{upcoming.length}</span>} action={<Link href="/schedule" className="text-sm font-semibold text-accent hover:underline">My schedule →</Link>}>
            {upcoming.length === 0 ? <Empty>No upcoming classes yet.</Empty> : (
              <ul className="divide-y divide-neutral-100">
                {upcoming.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar name={c.mentor.name} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.title}</span><span className="block text-xs text-neutral-500">{fmtDateTime(c.startAt, user.timezone)} · with {c.mentor.name}</span></span>
                    {c.session && <span className="pill bg-neutral-100 text-neutral-600">Session {c.session.order}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {sessions.length > 0 && (
            <Panel title="Program" badge={<span className="text-xs font-normal text-neutral-500">{me?.program?.name}</span>}>
              <ol className="space-y-1.5">
                {sessions.map((s) => {
                  const cls = classes.find((c) => c.sessionId === s.id && c.status !== "CANCELLED");
                  const st = !cls ? "upcoming" : cls.status === "COMPLETED" ? "done" : "booked";
                  return (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl px-3 py-2 odd:bg-canvas">
                      <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${st === "done" ? "bg-emerald-500 text-white" : st === "booked" ? "bg-accent text-white" : "bg-neutral-200 text-neutral-500"}`}>{st === "done" ? "✓" : s.order}</span>
                      <span className="flex-1 text-sm font-medium">{s.title}</span>
                      <span className="text-xs text-neutral-500">{cls ? fmtDateTime(cls.startAt, user.timezone) : "Not booked"}</span>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Today's practice" action={<Link href="/gamification" className="text-sm font-semibold text-accent hover:underline">Open →</Link>}>
            <p className="mb-3 text-sm text-neutral-500">Brain games solved <span className="font-semibold text-neutral-900">{solved} / {GAME_IDS.length}</span></p>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {GAME_IDS.map((g) => { const a = attempts.find((x) => x.game === g); return <Link key={g} href={`/gamification/brain/${g}`} title={GAME_META[g].name} className={`flex aspect-square items-center justify-center rounded-xl text-2xl transition hover:scale-105 ${a?.status === "COMPLETED" ? "bg-emerald-50" : a ? "bg-accent-soft" : "bg-canvas"}`}>{GAME_META[g].emoji}</Link>; })}
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="eyebrow text-accent">Speaking mission</p>
              <p className="mt-1 text-sm font-semibold">{speaking.mission.title}</p>
              <Link href={speaking.mission.done ? "/gamification/speaking/history" : "/gamification/speaking/session?mission=1"} className={`mt-2 w-full py-2 text-xs ${speaking.mission.done ? "btn-ghost" : "btn-primary"}`}><Icon name="mic" className="size-3.5" /> {speaking.mission.done ? "Done today" : "Start 5-min mission"}</Link>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
