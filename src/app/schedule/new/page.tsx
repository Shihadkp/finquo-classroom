import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classInclude } from "@/lib/classes";
import { toDTO } from "@/lib/types";
import { Page } from "@/components/Nav";
import { BookForm } from "./BookForm";

export const dynamic = "force-dynamic";

export default async function NewClassPage({ searchParams }: { searchParams: Promise<{ reschedule?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "STUDENT") redirect("/schedule");

  const { reschedule } = await searchParams;
  const [students, mentors] = await Promise.all([
    db.user.findMany({ where: { role: "STUDENT" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: "MENTOR" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  let existing = null;
  if (reschedule) {
    const row = await db.class.findUnique({ where: { id: reschedule }, include: classInclude });
    if (!row || (user.role === "MENTOR" && row.mentorId !== user.id)) notFound();
    existing = toDTO(row);
  }

  return (
    <Page user={user} title={existing ? "Reschedule class" : "Book a class"}>
      <BookForm user={user} students={students} mentors={mentors} existing={existing} />
    </Page>
  );
}
