import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok } from "@/lib/api";
import { enqueueTranscode } from "@/lib/transcode";

/** Admin: re-run the transcode for a FAILED (or stuck UPLOADED/PROCESSING) recording. */
export const POST = handle(async (_req: Request, { params }: Ctx<{ classId: string }>) => {
  await requireUser("ADMIN");
  const { classId } = await params;
  const rec = await db.recording.findUnique({ where: { classId } });
  if (!rec) return fail(404, "No recording for this class.");
  if (!rec.rawKey) return fail(400, "The raw recording is gone; nothing to retry.");
  if (rec.status === "READY") return fail(400, "This recording is already ready.");
  await db.recording.update({ where: { classId }, data: { status: "UPLOADED", error: null } });
  enqueueTranscode(classId);
  return ok({ status: "UPLOADED" });
});
