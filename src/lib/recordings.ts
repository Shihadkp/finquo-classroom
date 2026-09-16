import { db } from "./db";
import { fail, type SessionUser } from "./auth";

/** Anyone in the class (mentor, student) or an admin may write the recording: whoever is in the room first records. */
export async function requireRecorder(user: SessionUser, classId: string) {
  const cls = await db.class.findUnique({ where: { id: classId }, include: { recording: true } });
  if (!cls) throw fail(404, "Class not found.");
  if (user.role !== "ADMIN" && cls.mentorId !== user.id && cls.studentId !== user.id) throw fail(403, "You're not part of this class.");
  return cls;
}

/** The class's mentor/student or an admin — allowed to view a recording. */
export async function requireViewer(user: SessionUser, classId: string) {
  const cls = await db.class.findUnique({ where: { id: classId }, include: { recording: true } });
  if (!cls) throw fail(404, "Class not found.");
  // Recordings exist for admin QA only; mentors and students never see them.
  if (user.role !== "ADMIN") throw fail(403, "Recordings are only available to admins.");
  return cls;
}

export function publicRecording(rec: { status: string; durationSec: number | null; error: string | null; sizeBytes: number } | null, user: SessionUser) {
  if (!rec) return null;
  return {
    status: rec.status,
    durationSec: rec.durationSec,
    sizeBytes: rec.sizeBytes,
    error: user.role === "ADMIN" ? rec.error : null, // error text is admin-only
  };
}
