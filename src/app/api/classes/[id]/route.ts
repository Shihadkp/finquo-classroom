import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok, readJson } from "@/lib/api";
import { assertBookable, classInclude, loadClassFor } from "@/lib/classes";
import { CLASS_MINUTES } from "@/lib/rules";

export const GET = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser();
  return ok(await loadClassFor(user, (await params).id));
});

/**
 * Reschedule ({ startAt }) or cancel ({ status: "CANCELLED" }). Never deletes.
 * Admin may pass { startAt, force: true } to move a class to any time (e.g. "now" for testing);
 * only the overlap rule is still enforced in that case.
 */
export const PATCH = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const { id } = await params;
  const cls = await loadClassFor(user, id);
  const body = await readJson<{ startAt?: string; status?: string; title?: string; force?: boolean }>(req);

  if (cls.status !== "SCHEDULED") return fail(400, `This class is already ${cls.status.toLowerCase()}.`);

  if (body.status === "CANCELLED") {
    const updated = await db.class.update({ where: { id }, data: { status: "CANCELLED" }, include: classInclude });
    return ok(updated);
  }

  const data: { startAt?: Date; endAt?: Date; title?: string } = {};
  if (body.title?.trim()) data.title = body.title.trim();
  if (body.startAt) {
    const startAt = new Date(body.startAt);
    const endAt = new Date(startAt.getTime() + CLASS_MINUTES * 60_000);
    if (user.role === "ADMIN" && body.force) {
      if (isNaN(startAt.getTime())) return fail(400, "Please choose a valid time.");
      const clash = await db.class.findFirst({
        where: {
          id: { not: id },
          status: { not: "CANCELLED" },
          OR: [{ mentorId: cls.mentorId }, { studentId: cls.studentId }],
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (clash) return fail(409, "Someone in this class already has another class then.");
    } else {
      await assertBookable(user, cls.mentorId, cls.studentId, startAt, endAt, id);
    }
    Object.assign(data, { startAt, endAt });
  }
  if (!Object.keys(data).length) return fail(400, "Nothing to update.");

  const updated = await db.class.update({ where: { id }, data, include: classInclude });
  return ok(updated);
});
