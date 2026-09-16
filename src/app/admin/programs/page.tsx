import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { programInclude, type ProgramDTO } from "@/lib/programs";
import { Page } from "@/components/Nav";
import { Stat } from "@/components/ui";
import { Programs } from "./Programs";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/schedule");

  const programs: ProgramDTO[] = await db.program.findMany({ include: programInclude, orderBy: { name: "asc" } });
  const sessions = programs.reduce((n, p) => n + p.sessions.length, 0);
  const enrolled = programs.reduce((n, p) => n + p._count.students, 0);

  return (
    <Page user={user} eyebrow="Admin console" title="Programs" subtitle="Each program is an ordered list of sessions. Students enrolled in it book those sessions one by one.">
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Programs" value={programs.length} icon="book" />
        <Stat label="Sessions defined" value={sessions} icon="calendar" tone="green" />
        <Stat label="Students enrolled" value={enrolled} icon="cap" tone="amber" />
      </div>
      <Programs initial={programs} />
    </Page>
  );
}
