import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeFor } from "@/lib/classes";
import { fmtDateTime, fmtDuration, fmtTime } from "@/lib/time";
import { Page } from "@/components/Nav";
import { Avatar, Empty, Icon, Panel, Stat, fmtBytes } from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";

export const dynamic = "force-dynamic";

const REC_STYLE: Record<string, string> = {
  RECORDING: "bg-red-50 text-red-600",
  UPLOADED: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-amber-50 text-amber-700",
  READY: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
};

export default async function RecordingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/schedule"); // recordings are admin-only (QA)

  const rows = await db.class.findMany({
    where: scopeFor(user),
    orderBy: { startAt: "desc" },
    include: {
      mentor: { select: { name: true } },
      student: { select: { name: true } },
      recording: { select: { status: true, durationSec: true, sizeBytes: true, error: true } },
    },
  });

  const now = Date.now();
  const live = rows.filter((c) => c.status === "SCHEDULED" && c.startAt.getTime() <= now && c.endAt.getTime() > now);
  const nextUp = rows.filter((c) => c.status === "SCHEDULED" && c.startAt.getTime() > now).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, 3);
  const recorded = rows.filter((c) => c.recording);
  const ready = recorded.filter((c) => c.recording!.status === "READY");
  const bytes = ready.reduce((n, c) => n + c.recording!.sizeBytes, 0);

  return (
    <Page user={user} eyebrow="Sessions" title="Recordings" subtitle="Live classes, what's next, and the recording archive.">
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live now" value={live.length} icon="video" tone="red" />
        <Stat label="Upcoming" value={rows.filter((c) => c.status === "SCHEDULED" && c.startAt.getTime() > now).length} icon="calendar" />
        <Stat label="Recordings ready" value={ready.length} hint={`${recorded.length - ready.length} processing or failed`} icon="play" tone="green" />
        <Stat label="Storage used" value={fmtBytes(bytes)} icon="storage" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Panel title="Live now" badge={<span className="pill bg-red-50 text-red-600">{live.length}</span>}>
            {live.length === 0 ? (
              <Empty>No class is running.</Empty>
            ) : (
              <ul className="space-y-3">
                {live.map((c) => (
                  <li key={c.id} className="rounded-xl bg-canvas p-4">
                    <span className="pill bg-red-50 text-red-600"><span className="size-1.5 rounded-full bg-red-500" /> On air</span>
                    <p className="mt-2 font-semibold">{c.title}</p>
                    <p className="text-xs text-neutral-500">{c.mentor.name} · {c.student.name} · started {fmtTime(c.startAt, user.timezone)}</p>
                    <Link href={`/room/${c.id}`} className="btn-primary mt-3 w-full py-2 text-xs">Join</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Next up" badge={<span className="pill bg-accent-soft text-accent">{nextUp.length}</span>}>
            {nextUp.length === 0 ? (
              <Empty>Nothing scheduled.</Empty>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {nextUp.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="w-12 shrink-0 text-sm font-semibold text-accent">{fmtTime(c.startAt, user.timezone)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.title}</span>
                      <span className="block truncate text-xs text-neutral-500">{fmtDateTime(c.startAt, user.timezone)} · {c.mentor.name} · {c.student.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Archive" badge={<span className="pill bg-neutral-100 text-neutral-600">{recorded.length}</span>}>
          {recorded.length === 0 ? (
            <Empty>No recordings yet. Completed classes with a recording show up here.</Empty>
          ) : (
            <ul className="space-y-3">
              {recorded.map((c) => {
                const r = c.recording!;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-neutral-100 p-4">
                    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name="play" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{c.title}</span>
                        <span className={`pill ${REC_STYLE[r.status]}`} title={r.error ?? undefined}>{r.status.toLowerCase()}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                        <Avatar name={c.mentor.name} className="size-5 text-[9px]" /> {c.mentor.name} · {c.student.name} · {fmtDateTime(c.startAt, user.timezone)}
                        {r.durationSec ? ` · ${fmtDuration(r.durationSec)}` : ""}{r.sizeBytes ? ` · ${fmtBytes(r.sizeBytes)}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {r.status === "READY" ? (
                        <Link href={`/recordings/${c.id}`} className="btn-primary py-2 text-xs">Watch</Link>
                      ) : r.status === "FAILED" ? (
                        <span className="text-xs text-red-600">Failed · retry from Overview</span>
                      ) : (
                        <Link href={`/recordings/${c.id}`} className="btn-ghost py-2 text-xs">Preparing…</Link>
                      )}
                      <DeleteButton
                        url={`/api/recordings/${c.id}`}
                        confirm={`Delete the recording for "${c.title}" permanently?

The video file is removed from storage. The class itself stays.`}
                        done="Recording deleted."
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
}
