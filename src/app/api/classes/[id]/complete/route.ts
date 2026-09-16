import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok } from "@/lib/api";
import { classInclude, loadClassFor } from "@/lib/classes";

/** Mentor of the class (or admin) ends it. Idempotent. */
export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser("ADMIN", "MENTOR");
  const cls = await loadClassFor(user, (await params).id);
  if (cls.status === "CANCELLED") return fail(400, "This class was cancelled.");
  if (cls.status === "COMPLETED") return ok(cls);
  const updated = await db.class.update({
    where: { id: cls.id },
    data: { status: "COMPLETED", completedAt: new Date() },
    include: classInclude,
  });
  return ok(updated);
});
