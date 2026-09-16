import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Page } from "@/components/Nav";
import { Empty, Panel, Stat } from "@/components/ui";
import { FluencyChart } from "@/components/gamification/aria";
import { COACH, MODES, type ModeId } from "@/lib/gamification/aria";
import { speakingOverview } from "@/lib/gamification/speakingService";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SpeakingHistoryPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const o = await speakingOverview(user);
  const minutes = o.sessions.reduce((n, s) => n + s.minutes, 0);

  return (
    <Page user={user} eyebrow={COACH.product} title="Speaking history" subtitle={`Every finished session, with ${COACH.name}'s summary.`}>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Sessions" value={o.sessions.length} hint={`${minutes} minutes total`} icon="mic" />
        <Stat label="Fluency index" value={`${o.overall.fluency || "—"} / 100`} hint="30-day average" icon="spark" tone="green" />
        <Stat label="XP from speaking" value={o.sessions.reduce((n, s) => n + s.xp, 0)} icon="play" tone="amber" />
      </div>
      <div className="mb-6"><Panel title="30-day fluency"><FluencyChart series={o.series} /></Panel></div>
      <Panel title="Sessions" badge={<span className="pill bg-neutral-100 text-neutral-600">{o.sessions.length}</span>}>
        {o.sessions.length === 0 ? <Empty>No sessions yet.</Empty> : (
          <ul className="divide-y divide-neutral-100">
            {o.sessions.map((s) => (
              <li key={s.id} className="py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.mission ? "Daily mission · " : ""}{MODES[s.mode as ModeId]?.name ?? s.mode} · {MODES[s.mode as ModeId]?.scenarios.find((x) => x.id === s.scenario)?.title ?? s.scenario}</span>
                      <span className="block text-xs text-neutral-500">{fmtDateTime(s.startedAt, user.timezone)} · {s.minutes} min · {s.turns} exchanges</span>
                    </span>
                    <span className="pill bg-accent-soft text-accent">Fluency {s.fluency ?? "—"}</span>
                    <span className="text-sm font-semibold text-accent">+{s.xp} XP</span>
                    <span className="text-neutral-400 transition group-open:rotate-180">▾</span>
                  </summary>
                  {s.summary ? (
                    <div className="mt-3 grid gap-3 rounded-xl bg-canvas p-4 text-sm sm:grid-cols-2">
                      <p className="sm:col-span-2 font-medium">{s.summary.headline}</p>
                      <div><p className="eyebrow mb-1">Strengths</p><ul className="list-disc pl-4">{s.summary.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                      <div><p className="eyebrow mb-1">Focus</p><ul className="list-disc pl-4">{s.summary.focus.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                      {s.summary.vocabulary.length > 0 && <p className="flex flex-wrap gap-1.5 sm:col-span-2">{s.summary.vocabulary.map((v, i) => <span key={i} className="pill bg-accent-soft text-accent">{v}</span>)}</p>}
                    </div>
                  ) : <p className="mt-3 text-xs text-neutral-400">No summary for this session.</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
