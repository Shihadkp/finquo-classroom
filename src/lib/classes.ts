import { db } from "./db";
import { fail, type SessionUser } from "./auth";
import { isValidClassInterval, overlaps, zonedParts } from "./rules";

export const classInclude = {
  mentor: { select: { id: true, name: true } },
  student: { select: { id: true, name: true } },
  recording: { select: { status: true, durationSec: true, error: true } },
  session: { select: { id: true, order: true, title: true } },
} as const;

/**
 * Enforce every booking rule server-side. Throws a 4xx Response with a plain-English message.
 * `excludeId` is the class being rescheduled (its own slot doesn't count as a conflict).
 */
export async function assertBookable(
  actor: SessionUser,
  mentorId: string,
  studentId: string,
  startAt: Date,
  endAt: Date,
  excludeId?: string,
) {
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) throw fail(400, "Please choose a valid time.");
  if (!isValidClassInterval({ startAt, endAt })) throw fail(400, "Classes are 60 minutes and start on the hour or half-hour.");
  if (startAt <= new Date()) throw fail(400, "That time is in the past.");
  if (actor.role === "STUDENT") throw fail(403, "Students can't book classes.");
  if (actor.role === "MENTOR" && mentorId !== actor.id) throw fail(403, "Mentors can only book their own classes.");

  const [mentor, student] = await Promise.all([
    db.user.findFirst({ where: { id: mentorId, role: "MENTOR" }, include: { availability: true } }),
    db.user.findFirst({ where: { id: studentId, role: "STUDENT" } }),
  ]);
  if (!mentor) throw fail(404, "Mentor not found.");
  if (!student) throw fail(404, "Student not found.");

  // Slot must fall inside one of the mentor's weekly blocks (evaluated in the mentor's timezone).
  const p = zonedParts(startAt, mentor.timezone);
  const inBlock = mentor.availability.some(
    (a) => a.weekday === p.weekday && a.startMinute <= p.minute && p.minute + 60 <= a.endMinute,
  );
  if (!inBlock) throw fail(400, "The mentor isn't available at that time.");

  const conflicts = await db.class.findMany({
    where: {
      status: { not: "CANCELLED" },
      id: excludeId ? { not: excludeId } : undefined,
      OR: [{ mentorId }, { studentId }],
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { mentorId: true, startAt: true, endAt: true },
  });
  const hit = conflicts.find((c) => overlaps(c, { startAt, endAt }));
  if (hit) throw fail(409, hit.mentorId === mentorId ? "The mentor already has a class then." : "The student already has a class then.");
}

/** Visibility: admin sees all, others only classes they're part of. */
export function scopeFor(user: SessionUser) {
  if (user.role === "ADMIN") return {};
  return user.role === "MENTOR" ? { mentorId: user.id } : { studentId: user.id };
}

export async function loadClassFor(user: SessionUser, id: string) {
  const cls = await db.class.findUnique({ where: { id }, include: classInclude });
  if (!cls) throw fail(404, "Class not found.");
  const allowed = user.role === "ADMIN" || cls.mentorId === user.id || cls.studentId === user.id;
  if (!allowed) throw fail(403, "You're not part of this class.");
  return cls;
}
