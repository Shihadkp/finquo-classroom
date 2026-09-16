import { requireUser } from "@/lib/auth";
import { fail, handle, ok, readJson } from "@/lib/api";
import { attemptView, completeAttempt, isGame, progressAttempt, startAttempt } from "@/lib/gamification/service";

type Body = { game?: string; action?: "start" | "progress" | "mistake" | "hint" | "submit" | "giveup"; state?: unknown; answer?: unknown };

/**
 * POST /api/gamification/brain/attempt
 * start    → opens (or resumes) today's attempt and starts the clock
 * progress → saves partial state; mistake → +1 mistake; hint → +1 hint and returns one hint
 * submit   → verifies the answer; giveup → ends the attempt as FAILED and reveals the solution
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<Body>(req);
  if (!body.game || !isGame(body.game)) return fail(400, "Unknown game.");
  const game = body.game;
  switch (body.action) {
    case "start": return ok(attemptView(await startAttempt(user, game)));
    case "progress": return ok(await progressAttempt(user, game, { state: body.state }));
    case "mistake": return ok(await progressAttempt(user, game, { state: body.state, mistake: true }));
    case "hint": return ok(await progressAttempt(user, game, { state: body.state, answer: body.answer, hint: true }));
    case "submit": return ok(await completeAttempt(user, game, body.answer));
    case "giveup": return ok(await completeAttempt(user, game, body.state ?? {}, true));
    default: return fail(400, "Unknown action.");
  }
});
