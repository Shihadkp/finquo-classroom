import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/api";
import { GAME_IDS } from "@/lib/gamification/rules";
import { attemptView, profile, todayFor } from "@/lib/gamification/service";
import { GAME_META } from "@/lib/gamification/puzzles";

/** GET /api/gamification/brain/today → today's four games for this player (does not start any clock). */
export const GET = handle(async () => {
  const user = await requireUser();
  const date = todayFor(user);
  const [attempts, skills, prof] = await Promise.all([
    db.puzzleAttempt.findMany({ where: { userId: user.id, date }, include: { puzzle: true } }),
    db.playerSkill.findMany({ where: { userId: user.id } }),
    profile(user),
  ]);
  const games = GAME_IDS.map((game) => {
    const a = attempts.find((x) => x.game === game);
    const level = skills.find((s) => s.game === game)?.level ?? 1;
    return a ? { ...attemptView(a), puzzle: undefined, solution: undefined } : { game, date, status: "NOT_STARTED" as const, level, meta: GAME_META[game] };
  });
  return ok({ date, games, profile: prof });
});
