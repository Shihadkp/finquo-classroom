import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Page } from "@/components/Nav";
import { Icon, Panel, Stat } from "@/components/ui";
import { FluencyChart } from "@/components/gamification/aria";
import { COACH, MODES, type ModeId } from "@/lib/gamification/aria";
import { Mascot } from "@/components/gamification/aria";
import { isAriaConfigured } from "@/lib/gamification/ariaServer";
import { speakingOverview } from "@/lib/gamification/speakingService";

export const dynamic = "force-dynamic";

export default async function SpeakingPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const o = await speakingOverview(user);
  const configured = isAriaConfigured();

  return (
    <Page user={user} back={{ href: "/gamification", label: "Gamification" }} links={[{ href: "/gamification/brain", label: "Brain Arena" }]} eyebrow={COACH.product} title={`Talk with ${COACH.name}`} subtitle={<span className="flex items-center gap-2"><Mascot className="size-9" /> A real conversation partner, {COACH.tagline}. Talk, get interrupted, get nudged. Coaching stays subtle.</span>}>
      {!configured && <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{COACH.name} isn&apos;t configured yet. Set <code>ARIA_BASE_URL</code> + <code>ARIA_API_KEY</code> (free: Groq) or <code>ANTHROPIC_API_KEY</code> in .env and restart.</p>}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Daily speaking" value={`${o.todayMinutes} / 20 min`} hint="Talk time today" icon="mic" />
        <Stat label="Streak" value={`${o.profile.streak.current} days`} hint={`Best ${o.profile.streak.best}`} icon="clock" tone="amber" />
        <Stat label="Fluency index" value={`${o.overall.fluency || "—"} / 100`} hint="30-day average" icon="spark" tone="green" />
        <Stat label="Communication" value={o.profile.communicationScore} hint={`Vocabulary ${o.profile.vocabularyScore}`} icon="users" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card flex flex-wrap items-center gap-4 border-accent/30 bg-accent-soft/40 p-5">
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-accent">Today&apos;s mission · {o.mission.minutes} min · {o.mission.difficulty} · +40 XP</p>
              <h2 className="mt-1 text-lg">{o.mission.title}</h2>
              <p className="text-sm text-neutral-600">{o.mission.prompt} <span className="text-neutral-500">{o.mission.twist}</span></p>
            </div>
            {o.mission.done ? <span className="pill bg-emerald-50 text-emerald-700">✓ Done today</span>
              : <Link href="/gamification/speaking/session?mission=1" className={`btn-primary ${configured ? "" : "pointer-events-none opacity-40"}`}><Icon name="mic" className="size-4" /> Start mission</Link>}
          </section>

          {(Object.keys(MODES) as ModeId[]).map((m) => (
            <Panel key={m} title={MODES[m].name} badge={<span className="text-xs font-normal text-neutral-500">{MODES[m].blurb}</span>}>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODES[m].scenarios.map((s) => (
                  <Link key={s.id} href={`/gamification/speaking/session?mode=${m}&scenario=${s.id}`} className={`flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-4 py-3 text-sm transition hover:border-accent ${configured ? "" : "pointer-events-none opacity-40"}`}>
                    <span className="font-semibold">{s.title}</span><span className="text-accent">▶</span>
                  </Link>
                ))}
              </div>
            </Panel>
          ))}
        </div>

        <div className="space-y-6">
          <Panel title="30-day fluency" action={<Link href="/gamification/speaking/history" className="text-sm font-semibold text-accent hover:underline">History →</Link>}>
            <FluencyChart series={o.series} />
          </Panel>
          <Panel title="Speech profile">
            <ul className="space-y-3 text-sm">
              {([["Grammar", o.overall.grammar], ["Vocabulary", o.overall.vocabulary], ["Pronunciation", o.overall.pronunciation], ["Confidence", o.overall.confidence]] as const).map(([l, v]) => (
                <li key={l}><div className="flex justify-between"><span>{l}</span><span className="font-semibold">{v}%</span></div><div className="mt-1 h-1.5 rounded-full bg-neutral-100"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${v}%` }} /></div></li>
              ))}
              <li className="flex justify-between text-neutral-500"><span>Pace</span><span>{o.overall.pace || "—"} wpm · {o.overall.fillers} fillers/turn</span></li>
            </ul>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
