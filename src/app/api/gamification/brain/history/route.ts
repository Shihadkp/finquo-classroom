import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";

/** GET /api/gamification/brain/history → this player's finished attempts, newest first (last 60). */
export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await db.puzzleAttempt.findMany({
    where: { userId: user.id, status: { not: "IN_PROGRESS" } },
    orderBy: { completedAt: "desc" },
    take: 60,
    select: { id: true, game: true, date: true, status: true, timeMs: true, mistakes: true, hints: true, accuracy: true, xp: true, puzzle: { select: { level: true } } },
  });
  return ok(rows.map((r) => ({ ...r, level: r.puzzle.level, puzzle: undefined })));
});
