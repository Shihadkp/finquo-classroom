import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classInclude } from "@/lib/classes";
import { Page } from "@/components/Nav";
import { Stat } from "@/components/ui";
import { StudentCards } from "./StudentCards";
import { summarize, type StudentDTO } from "./summary";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/schedule");

  const [rows, programs, mentors] = await Promise.all([
    db.user.findMany({
      where: { role: "STUDENT" },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, email: true, timezone: true, programId: true,
        program: { select: { id: true, name: true, sessions: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } } } },
        studentClasses: { orderBy: { startAt: "desc" }, include: classInclude },
      },
    }),
    db.program.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, sessions: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } } } }),
    db.user.findMany({ where: { role: "MENTOR" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // Dates → ISO strings for the client component.
  const students: StudentDTO[] = JSON.parse(JSON.stringify(rows.map(({ studentClasses, ...s }) => ({ ...s, classes: studentClasses }))));

  const now = Date.now();
  const sums = students.map((s) => summarize(s, now));
  const count = (st: string) => sums.filter((d) => d.status === st).length;

  return (
    <Page user={user} eyebrow="Admin console" title="Students" subtitle={`${students.length} enrolled · ${count("scheduled")} with a class booked`}>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Students" value={students.length} icon="cap" />
        <Stat label="Active (30 days)" value={count("active") + count("scheduled")} hint={`${count("idle")} idle`} icon="clock" tone="green" />
        <Stat label="Sessions completed" value={sums.reduce((n, d) => n + d.completed.length, 0)} icon="calendar" tone="amber" />
      </div>
      <StudentCards students={students} programs={programs} mentors={mentors} user={user} />
    </Page>
  );
}
