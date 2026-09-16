import { requireUser } from "@/lib/auth";
import { type Ctx, handle, ok } from "@/lib/api";
import { publicRecording, requireViewer } from "@/lib/recordings";

/** Recording status for a class (used by the recordings page to poll while processing). */
export const GET = handle(async (_req: Request, { params }: Ctx<{ classId: string }>) => {
  const user = await requireUser();
  const cls = await requireViewer(user, (await params).classId);
  return ok(publicRecording(cls.recording, user));
});
