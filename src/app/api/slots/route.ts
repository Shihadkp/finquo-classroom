import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { generateSlots } from "@/lib/rules";

/** GET /api/slots?mentorId&date=YYYY-MM-DD[&studentId] → free 60-min slots for that day. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const q = new URL(req.url).searchParams;
  const mentorId = user.role === "MENTOR" ? user.id : q.get("mentorId") ?? "";
  const date = q.get("date") ?? "";
  const studentId = q.get("studentId");
  const exclude = q.get("exclude"); // class being rescheduled — its own slot stays bookable
  if (!mentorId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, "mentorId and date (YYYY-MM-DD) are required.");

  const mentor = await db.user.findFirst({ where: { id: mentorId, role: "MENTOR" }, include: { availability: true } });
  if (!mentor) return fail(404, "Mentor not found.");

  // A generous window around the day so tz shifts don't drop a class at the edge.
  const dayStart = new Date(`${date}T00:00:00Z`);
  const busy = await db.class.findMany({
    where: {
      status: { not: "CANCELLED" },
      id: exclude ? { not: exclude } : undefined,
      OR: [{ mentorId }, ...(studentId ? [{ studentId }] : [])],
      startAt: { gte: new Date(dayStart.getTime() - 86_400_000), lte: new Date(dayStart.getTime() + 2 * 86_400_000) },
    },
    select: { startAt: true, endAt: true },
  });

  // Availability is defined in the mentor's timezone; the caller's date is interpreted there too.
  const slots = generateSlots(date, mentor.timezone, mentor.availability, busy);
  return ok({ timezone: mentor.timezone, slots });
});
