import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { Page } from "@/components/Nav";
import { MentorSlots } from "@/components/MentorSlots";
import { Avatar, Empty, Panel, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function MentorsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/schedule");

  const mentors = await db.user.findMany({
    where: { role: "MENTOR" },
    orderBy: { name: "asc" },
    include: {
      availability: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      mentorClasses: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { startAt: "asc" },
        select: { startAt: true, status: true, studentId: true, student: { select: { name: true } } },
      },
    },
  });

  const now = new Date();
  const rows = mentors.map((m) => {
    const weeklyHours = m.availability.reduce((h, a) => h + (a.endMinute - a.startMinute) / 60, 0);
    const days = [...new Set(m.availability.map((a) => a.weekday))].sort().map((d) => DAYS[d]);
    const completed = m.mentorClasses.filter((c) => c.status === "COMPLETED").length;
    const upcoming = m.mentorClasses.filter((c) => c.status === "SCHEDULED" && c.startAt > now);
    const students = new Set(m.mentorClasses.map((c) => c.studentId)).size;
    return { ...m, weeklyHours, days, completed, upcoming: upcoming.length, next: upcoming[0] ?? null, students };
  });
  const sum = (k: "weeklyHours" | "completed" | "upcoming") => rows.reduce((n, r) => n + r[k], 0);

  return (
    <Page user={user} eyebrow="Admin console" title="Mentors" subtitle={`${rows.length} mentors · ${sum("upcoming")} upcoming sessions`}>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Mentors" value={rows.length} icon="users" />
        <Stat label="Weekly availability" value={`${sum("weeklyHours")}h`} hint="Sum of open hours per week" icon="clock" tone="green" />
        <Stat label="Sessions completed" value={sum("completed")} hint={`${sum("upcoming")} scheduled`} icon="calendar" tone="amber" />
      </div>

      <Panel title="Roster" badge={<span className="pill bg-neutral-100 text-neutral-600">{rows.length}</span>} className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty>No mentors yet.</Empty>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-canvas">
                <tr>
                  <th className="th">Mentor</th><th className="th">Timezone</th><th className="th">Availability</th>
                  <th className="th">Sessions</th><th className="th">Students</th><th className="th">Next class</th><th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-canvas/60">
                    <td className="td">
                      <span className="flex items-center gap-3">
                        <Avatar name={m.name} className="size-10 text-sm" />
                        <span className="leading-tight">
                          <span className="block font-semibold">{m.name}</span>
                          <span className="block text-xs text-neutral-500">{m.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="td text-neutral-600">{m.timezone}</td>
                    <td className="td">
                      <span className="block font-semibold">{m.weeklyHours}h / week</span>
                      <span className="block text-xs text-neutral-500">{m.days.length ? m.days.join(" · ") : "No hours set"}</span>
                    </td>
                    <td className="td">
                      <span className="block font-semibold">{m.completed} completed</span>
                      <span className="block text-xs text-neutral-500">{m.upcoming} upcoming</span>
                    </td>
                    <td className="td text-neutral-600">{m.students}</td>
                    <td className="td">
                      {m.next ? (
                        <>
                          <span className="block font-semibold">{fmtDateTime(m.next.startAt, user.timezone)}</span>
                          <span className="block text-xs text-neutral-500">with {m.next.student.name}</span>
                        </>
                      ) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="td text-right">
                      <span className="flex justify-end gap-2">
                        <MentorSlots mentor={{ id: m.id, name: m.name, timezone: m.timezone }} blocks={m.availability} user={user} />
                        <Link href={`/availability?mentorId=${m.id}`} className="btn-ghost px-3 py-1.5 text-xs">Edit hours</Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
