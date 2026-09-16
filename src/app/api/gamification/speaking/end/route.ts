import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handle, ok, readJson } from "@/lib/api";
import type { Feedback, Summary, Turn } from "@/lib/gamification/aria";
import { ariaClient, summarize } from "@/lib/gamification/ariaServer";
import { XP } from "@/lib/gamification/rules";
import { awardXp } from "@/lib/gamification/service";

/** POST /api/gamification/speaking/end { sessionId } → summary, fluency and XP. Idempotent. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { sessionId } = await readJson<{ sessionId?: string }>(req);
  const session = await db.speakingSession.findFirst({ where: { id: sessionId ?? "", userId: user.id } });
  if (!session) return fail(404, "Session not found.");
  if (session.endedAt) return ok({ id: session.id, summary: session.summary ? JSON.parse(session.summary) : null, fluency: session.fluency, xp: session.xp });

  const turns = JSON.parse(session.transcript) as Turn[];
  const feedback = JSON.parse(session.feedback) as Feedback[];
  const spoke = turns.some((t) => t.role === "user");
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  let summary: Summary | null = null;
  if (spoke) {
    try { summary = await summarize(ariaClient(), turns, feedback); } catch (e) { console.error(e); }
  }
  const fluency = summary?.fluency ?? avg(feedback.map((f) => f.fluency));

  // XP: one speaking award per session that had at least two student turns; mission bonus once per day.
  const date = session.missionDate ?? new Date().toISOString().slice(0, 10);
  const parts: { source: string; amount: number }[] = [];
  if (turns.filter((t) => t.role === "user").length >= 2) parts.push({ source: "speaking", amount: XP.speaking });
  if (session.missionDate && spoke) {
    const already = await db.speakingSession.findFirst({ where: { userId: user.id, missionDate: session.missionDate, endedAt: { not: null }, id: { not: session.id } } });
    if (!already) parts.push({ source: "mission", amount: XP.mission });
  }
  for (const p of parts) await awardXp(user.id, date, p.source, p.amount, session.mode);
  const xp = parts.reduce((n, p) => n + p.amount, 0);

  await db.speakingSession.update({ where: { id: session.id }, data: { endedAt: new Date(), summary: summary ? JSON.stringify(summary) : null, fluency, xp } });
  return ok({ id: session.id, summary, fluency, xp, xpParts: parts });
});
