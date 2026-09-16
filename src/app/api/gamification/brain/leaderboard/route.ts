import { requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/api";
import { isGame, leaderboard, todayFor, type Scope } from "@/lib/gamification/service";

/** GET /api/gamification/brain/leaderboard?game=queens&scope=cohort|global|friends[&date=YYYY-MM-DD] */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const game = q.get("game") ?? "";
  const scope = (q.get("scope") ?? "cohort") as Scope;
  const date = q.get("date") ?? todayFor(user);
  if (!isGame(game)) return fail(400, "Unknown game.");
  if (!["cohort", "global", "friends"].includes(scope)) return fail(400, "Unknown scope.");
  return ok(await leaderboard(user, game, date, scope));
});
