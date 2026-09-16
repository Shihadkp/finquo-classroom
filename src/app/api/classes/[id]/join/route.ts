import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { type Ctx, fail, handle, ok } from "@/lib/api";
import { loadClassFor } from "@/lib/classes";
import { buildRtcToken, uidFor } from "@/lib/agora";
import { joinState } from "@/lib/rules";

export const POST = handle(async (_req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser();
  const cls = await loadClassFor(user, (await params).id);

  if (cls.status === "CANCELLED") return fail(400, "This class was cancelled.");
  if (cls.status === "COMPLETED") return fail(400, "This class has ended.");
  const state = joinState(cls);
  if (state === "early") return fail(400, "The room opens 10 minutes before the class starts.");
  if (state === "ended") return fail(400, "This class has ended.");

  // First entry into the room is the attendance record for that side.
  if (cls.studentId === user.id && !cls.studentJoinedAt) await db.class.update({ where: { id: cls.id }, data: { studentJoinedAt: new Date() } });
  if (cls.mentorId === user.id && !cls.mentorJoinedAt) await db.class.update({ where: { id: cls.id }, data: { mentorJoinedAt: new Date() } });

  const uid = uidFor(user.id);
  const { appId, token, expiresAt } = buildRtcToken(cls.channelName, uid);
  return ok({ appId, channelName: cls.channelName, token, uid, expiresAt });
});
