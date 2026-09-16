import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classInclude } from "@/lib/classes";
import { toDTO } from "@/lib/types";
import { Page } from "@/components/Nav";
import { Stat, fmtBytes } from "@/components/ui";
import { AdminTable } from "./AdminTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/schedule");

  const [rows, mentors, students, mentorCount, ready] = await Promise.all([
    db.class.findMany({ include: classInclude, orderBy: { startAt: "desc" } }),
    db.user.findMany({ where: { role: "MENTOR" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.count({ where: { role: "STUDENT" } }),
    db.user.count({ where: { role: "MENTOR" } }),
    db.recording.aggregate({ where: { status: "READY" }, _count: true, _sum: { sizeBytes: true } }),
  ]);
  const classes = rows.map(toDTO);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completedThisMonth = classes.filter((c) => c.status === "COMPLETED" && new Date(c.startAt) >= monthStart).length;
  const upcoming = classes.filter((c) => c.status === "SCHEDULED" && new Date(c.startAt) > now).length;

  return (
    <Page user={user} eyebrow="Admin console" title="Overview" subtitle="Live sessions, upcoming classes and recording health.">
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Students" value={students} icon="cap" />
        <Stat label="Mentors" value={mentorCount} icon="users" tone="green" />
        <Stat label="Sessions this month" value={completedThisMonth} hint={`${upcoming} upcoming`} icon="calendar" tone="amber" />
        <Stat label="Recordings ready" value={ready._count} hint={fmtBytes(ready._sum.sizeBytes ?? 0) + " stored"} icon="video" />
      </div>
      <AdminTable classes={classes} mentors={mentors} user={user} />
    </Page>
  );
}
