import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classInclude, scopeFor } from "@/lib/classes";
import { toDTO } from "@/lib/types";
import { Page } from "@/components/Nav";
import { Empty, Stat } from "@/components/ui";
import { ClassCard } from "./ClassCard";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const rows = await db.class.findMany({ where: scopeFor(user), include: classInclude, orderBy: { startAt: "asc" } });
  const classes = rows.map(toDTO);
  const now = Date.now();

  const live = classes.filter((c) => c.status === "SCHEDULED" && new Date(c.startAt).getTime() <= now && new Date(c.endAt).getTime() > now);
  const upcoming = classes.filter((c) => c.status === "SCHEDULED" && new Date(c.startAt).getTime() > now);
  const past = classes
    .filter((c) => !live.includes(c) && !upcoming.includes(c))
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const completed = past.filter((c) => c.status === "COMPLETED").length;

  return (
    <Page user={user} eyebrow="Classes" title="Schedule" subtitle={`Times shown in ${user.timezone}.`}>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Live now" value={live.length} icon="video" tone="red" />
        <Stat label="Upcoming" value={upcoming.length} icon="calendar" />
        <Stat label="Completed" value={completed} icon="clock" tone="green" />
      </div>

      {live.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            Live now
          </h2>
          <div className="space-y-3">{live.map((c) => <ClassCard key={c.id} cls={c} user={user} live />)}</div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-4">Upcoming <span className="text-neutral-400">({upcoming.length})</span></h2>
        {upcoming.length === 0 ? (
          <Empty>No upcoming classes{user.role !== "STUDENT" ? ". Use “Book a class” to add one." : "."}</Empty>
        ) : (
          <div className="space-y-3">{upcoming.map((c) => <ClassCard key={c.id} cls={c} user={user} />)}</div>
        )}
      </section>

      {past.length > 0 && (
        <details className="group">
          <summary className="mb-4 cursor-pointer list-none">
            <h2 className="inline-flex items-center gap-2">
              Past <span className="text-neutral-400">({past.length})</span>
              <span className="text-neutral-400 transition group-open:rotate-180">▾</span>
            </h2>
          </summary>
          <div className="space-y-3">{past.map((c) => <ClassCard key={c.id} cls={c} user={user} />)}</div>
        </details>
      )}
    </Page>
  );
}
