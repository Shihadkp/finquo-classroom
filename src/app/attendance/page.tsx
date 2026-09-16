import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { Page } from "@/components/Nav";
import { Avatar, Empty, Panel, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Student attendance: a class counts as attended when the student entered the room. */
export default async function AttendancePage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin/students");
  if (user.role === "MENTOR") redirect("/schedule");

  const rows = await db.class.findMany({
    where: { studentId: user.id, status: { not: "SCHEDULED" } },
    orderBy: { startAt: "desc" },
    select: { id: true, title: true, startAt: true, endAt: true, status: true, studentJoinedAt: true, mentor: { select: { name: true } }, session: { select: { order: true } } },
  });
  const completed = rows.filter((c) => c.status === "COMPLETED");
  const attended = completed.filter((c) => c.studentJoinedAt);
  const missed = completed.length - attended.length;
  const rate = completed.length ? Math.round((attended.length / completed.length) * 100) : null;
  const onTime = attended.filter((c) => c.studentJoinedAt! <= new Date(c.startAt.getTime() + 5 * 60_000)).length;

  return (
    <Page user={user} eyebrow="Student portal" title="My attendance" subtitle="A class counts as attended once you enter the room. Aim for every class on time.">
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Attendance rate" value={rate === null ? "—" : `${rate}%`} hint={completed.length ? `${attended.length} of ${completed.length} classes` : "No classes yet"} icon="clock" tone={rate !== null && rate < 80 ? "amber" : "green"} />
        <Stat label="Attended" value={attended.length} hint={`${onTime} on time (within 5 min)`} icon="calendar" tone="green" />
        <Stat label="Missed" value={missed} hint={missed ? "Talk to your mentor to catch up" : "Nothing missed"} icon="users" tone={missed ? "red" : "accent"} />
        <Stat label="Cancelled" value={rows.length - completed.length} hint="Not counted against you" icon="dashboard" />
      </div>
      <Panel title="History" badge={<span className="pill bg-neutral-100 text-neutral-600">{rows.length}</span>} className="overflow-hidden">
        {rows.length === 0 ? <Empty>Your past classes appear here after they happen.</Empty> : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-canvas"><tr><th className="th">Class</th><th className="th">Mentor</th><th className="th">When</th><th className="th">Joined</th><th className="th">Status</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((c) => {
                  const st = c.status === "CANCELLED" ? "cancelled" : c.studentJoinedAt ? "attended" : "missed";
                  const late = c.studentJoinedAt && c.studentJoinedAt > new Date(c.startAt.getTime() + 5 * 60_000);
                  return (
                    <tr key={c.id} className="hover:bg-canvas/60">
                      <td className="td"><span className="block font-semibold">{c.title}</span>{c.session && <span className="block text-xs text-neutral-500">Session {c.session.order}</span>}</td>
                      <td className="td"><span className="flex items-center gap-2"><Avatar name={c.mentor.name} className="size-7 text-[10px]" />{c.mentor.name}</span></td>
                      <td className="td text-neutral-600">{fmtDateTime(c.startAt, user.timezone)} – {fmtTime(c.endAt, user.timezone)}</td>
                      <td className="td text-neutral-600">{c.studentJoinedAt ? <>{fmtTime(c.studentJoinedAt, user.timezone)}{late && <span className="ml-1 text-xs text-amber-600">late</span>}</> : <span className="text-neutral-300">—</span>}</td>
                      <td className="td"><span className={`pill ${st === "attended" ? "bg-emerald-50 text-emerald-700" : st === "missed" ? "bg-red-50 text-red-600" : "bg-neutral-100 text-neutral-500"}`}>{st}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
