import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok, readJson } from "@/lib/api";
import { COACH, MODES, missionFor, type ModeId, type Turn } from "@/lib/gamification/aria";
import { isAriaConfigured } from "@/lib/gamification/ariaServer";
import { profile, todayFor } from "@/lib/gamification/service";

/**
 * POST /api/gamification/speaking/start { mode, scenario, mission?: true }
 * Creates the session with Aria's opening line as the first turn. The mission variant is limited to one completion per day.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ mode?: string; scenario?: string; mission?: boolean }>(req);
  if (!isAriaConfigured()) return fail(503, `${COACH.name} isn't configured yet. Set ARIA_BASE_URL + ARIA_API_KEY (free: Groq) or ANTHROPIC_API_KEY.`);
  const date = todayFor(user);

  let mode = (body.mode ?? "") as ModeId;
  let scenario = body.scenario ?? "";
  let opener: string;
  let missionDate: string | null = null;

  if (body.mission) {
    const done = await db.speakingSession.findFirst({ where: { userId: user.id, missionDate: date, endedAt: { not: null } } });
    if (done) return fail(409, "Today's mission is already complete. A new one unlocks at midnight.");
    const m = missionFor(date, (await profile(user)).level);
    mode = m.mode;
    scenario = MODES[mode].scenarios[0].id;
    missionDate = date;
    opener = `Hi ${user.name.split(" ")[0]}! Today's mission: ${m.title.toLowerCase()}. ${m.prompt} ${m.twist} Take a breath and start whenever you're ready.`;
  } else {
    if (!MODES[mode]) return fail(400, "Unknown mode.");
    const sc = MODES[mode].scenarios.find((s) => s.id === scenario);
    if (!sc) return fail(400, "Unknown scenario.");
    opener = sc.opener;
  }

  const turns: Turn[] = [{ role: "assistant", text: opener, at: new Date().toISOString() }];
  const session = await db.speakingSession.create({ data: { userId: user.id, mode, scenario, missionDate, transcript: JSON.stringify(turns) } });
  return ok({ id: session.id, mode, scenario, missionDate, turns }, 201);
});
