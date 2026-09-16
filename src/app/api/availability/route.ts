import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { fail, handle, ok, readJson } from "@/lib/api";

/** Whose calendar is being edited: a mentor's own, or any mentor's when an admin passes mentorId. */
async function targetMentor(user: SessionUser, mentorId?: string) {
  if (user.role === "MENTOR") return user.id;
  if (!mentorId) throw fail(400, "mentorId is required.");
  const m = await db.user.findFirst({ where: { id: mentorId, role: "MENTOR" }, select: { id: true } });
  if (!m) throw fail(404, "Mentor not found.");
  return m.id;
}

/** GET ?mentorId= (admin) or own blocks (mentor). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const mentorId = await targetMentor(user, new URL(req.url).searchParams.get("mentorId") ?? undefined);
  const blocks = await db.availability.findMany({ where: { mentorId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] });
  return ok(blocks);
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const b = await readJson<{ weekday?: number; startMinute?: number; endMinute?: number; mentorId?: string }>(req);
  const mentorId = await targetMentor(user, b.mentorId);
  const { weekday, startMinute, endMinute } = b;
  if (![weekday, startMinute, endMinute].every((n) => Number.isInteger(n))) return fail(400, "Invalid block.");
  if (weekday! < 0 || weekday! > 6) return fail(400, "Weekday must be 0–6.");
  if (startMinute! < 0 || endMinute! > 1440 || startMinute! % 30 || endMinute! % 30) return fail(400, "Times must be on the half-hour.");
  if (endMinute! - startMinute! < 60) return fail(400, "A block must be at least 60 minutes.");

  const clash = await db.availability.findFirst({
    where: { mentorId, weekday, startMinute: { lt: endMinute }, endMinute: { gt: startMinute } },
  });
  if (clash) return fail(409, "That overlaps an existing block.");

  const block = await db.availability.create({ data: { mentorId, weekday: weekday!, startMinute: startMinute!, endMinute: endMinute! } });
  return ok(block, 201);
});

/** DELETE ?id=<block> removes one block; ?mentorId=&all=1 clears the whole week. */
export const DELETE = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const q = new URL(req.url).searchParams;
  const mentorId = await targetMentor(user, q.get("mentorId") ?? undefined);
  if (q.get("all") === "1") {
    const { count } = await db.availability.deleteMany({ where: { mentorId } });
    return ok({ cleared: count });
  }
  const { count } = await db.availability.deleteMany({ where: { id: q.get("id") ?? "", mentorId } });
  if (!count) return fail(404, "Block not found.");
  return ok({ id: q.get("id") });
});
