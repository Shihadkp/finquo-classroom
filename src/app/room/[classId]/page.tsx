import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classInclude } from "@/lib/classes";
import { uidFor } from "@/lib/agora";
import { toDTO } from "@/lib/types";
import { Room } from "./Room";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ classId: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { classId } = await params;
  const row = await db.class.findUnique({ where: { id: classId }, include: classInclude });
  if (!row) notFound();
  if (user.role !== "ADMIN" && row.mentorId !== user.id && row.studentId !== user.id) redirect("/schedule");

  // uid → display name so tiles (and the recording) can be labelled.
  const names: Record<number, string> = {
    [uidFor(row.mentorId)]: row.mentor.name,
    [uidFor(row.studentId)]: row.student.name,
  };
  const isMentor = row.mentorId === user.id;

  return <Room cls={toDTO(row)} user={user} names={names} isMentor={isMentor} />;
}
