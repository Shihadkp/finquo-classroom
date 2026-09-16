import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok, readJson } from "@/lib/api";

/** PATCH { programId: string | null } — enroll a student in a program (admin only). */
export const PATCH = handle(async (req: Request, { params }: Ctx<{ id: string }>) => {
  await requireUser("ADMIN");
  const { id } = await params;
  const student = await db.user.findFirst({ where: { id, role: "STUDENT" } });
  if (!student) return fail(404, "Student not found.");
  const body = await readJson<{ programId?: string | null }>(req);
  if (body.programId === undefined) return fail(400, "Nothing to update.");
  if (body.programId && !(await db.program.findUnique({ where: { id: body.programId } }))) return fail(404, "Program not found.");
  const updated = await db.user.update({ where: { id }, data: { programId: body.programId }, select: { id: true, programId: true } });
  return ok(updated);
});
