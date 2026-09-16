import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok, readJson } from "@/lib/api";

/** GET ?mentorId= (admin) or own blocks (mentor). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const mentorId = user.role === "MENTOR" ? user.id : new URL(req.url).searchParams.get("mentorId") ?? "";
  if (!mentorId) return fail(400, "mentorId is required.");
  const blocks = await db.availability.findMany({ where: { mentorId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] });
  return ok(blocks);
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser("MENTOR");
  const b = await readJson<{ weekday?: number; startMinute?: number; endMinute?: number }>(req);
  const { weekday, startMinute, endMinute } = b;
  if (![weekday, startMinute, endMinute].every((n) => Number.isInteger(n))) return fail(400, "Invalid block.");
  if (weekday! < 0 || weekday! > 6) return fail(400, "Weekday must be 0–6.");
  if (startMinute! < 0 || endMinute! > 1440 || startMinute! % 30 || endMinute! % 30) return fail(400, "Times must be on the half-hour.");
  if (endMinute! - startMinute! < 60) return fail(400, "A block must be at least 60 minutes.");

  const clash = await db.availability.findFirst({
    where: { mentorId: user.id, weekday, startMinute: { lt: endMinute }, endMinute: { gt: startMinute } },
  });
  if (clash) return fail(409, "That overlaps an existing block.");

  const block = await db.availability.create({ data: { mentorId: user.id, weekday: weekday!, startMinute: startMinute!, endMinute: endMinute! } });
  return ok(block, 201);
});

export const DELETE = handle(async (req: Request) => {
  const user = await requireUser("MENTOR");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const { count } = await db.availability.deleteMany({ where: { id, mentorId: user.id } });
  if (!count) return fail(404, "Block not found.");
  return ok({ id });
});
