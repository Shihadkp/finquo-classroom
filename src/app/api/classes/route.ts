import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok, readJson } from "@/lib/api";
import { assertBookable, classInclude, scopeFor } from "@/lib/classes";
import { CLASS_MINUTES } from "@/lib/rules";

export const GET = handle(async () => {
  const user = await requireUser();
  const classes = await db.class.findMany({ where: scopeFor(user), include: classInclude, orderBy: { startAt: "asc" } });
  return ok(classes);
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const body = await readJson<{ title?: string; studentId?: string; mentorId?: string; startAt?: string; sessionId?: string }>(req);
  const mentorId = user.role === "MENTOR" ? user.id : body.mentorId ?? "";
  if (!body.studentId || !body.startAt) return fail(400, "Student and start time are required.");
  if (!mentorId) return fail(400, "Mentor is required.");

  const startAt = new Date(body.startAt);
  const endAt = new Date(startAt.getTime() + CLASS_MINUTES * 60_000);
  await assertBookable(user, mentorId, body.studentId, startAt, endAt);

  // Optional program session: must belong to the student's program and not be booked already.
  let title = body.title?.trim();
  if (body.sessionId) {
    const session = await db.programSession.findUnique({ where: { id: body.sessionId }, include: { program: { select: { students: { where: { id: body.studentId }, select: { id: true } } } } } });
    if (!session || !session.program.students.length) return fail(400, "That session isn't part of the student's program.");
    const taken = await db.class.findFirst({ where: { studentId: body.studentId, sessionId: session.id, status: { not: "CANCELLED" } } });
    if (taken) return fail(409, "That session is already booked. Reschedule it instead.");
    title ||= session.title;
  }

  // Pick the id up front so channelName = class-<id> lands in the same insert.
  const id = randomUUID();
  const cls = await db.class.create({
    data: { id, title: title || "Class", mentorId, studentId: body.studentId, startAt, endAt, channelName: `class-${id}`, sessionId: body.sessionId ?? null },
    include: classInclude,
  });
  return ok(cls, 201);
});
