import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok } from "@/lib/api";
import { deleteRecording } from "@/lib/deleteClass";
import { publicRecording, requireViewer } from "@/lib/recordings";

/** Recording status for a class (used by the recordings page to poll while processing). */
export const GET = handle(async (_req: Request, { params }: Ctx<{ classId: string }>) => {
  const user = await requireUser();
  const cls = await requireViewer(user, (await params).classId);
  return ok(publicRecording(cls.recording, user));
});

/** Permanently delete a class's recording and its stored video. Admin only; the class itself stays. */
export const DELETE = handle(async (_req: Request, { params }: Ctx<{ classId: string }>) => {
  await requireUser("ADMIN");
  const { classId } = await params;
  if (!(await deleteRecording(classId))) return fail(404, "There's no recording for this class.");
  return ok({ classId });
});
