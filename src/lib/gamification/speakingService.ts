// Aria overview shared by the speaking pages and the history endpoint.

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { missionFor, type Feedback, type Summary } from "./aria";
import { profile, todayFor } from "./service";

const avgOf = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** Six fluency components, 0–100 except pace (wpm) and fillers (count per turn). */
export function metricsOf(fb: Feedback[]) {
  const avg = (k: "vocabularyScore" | "confidence" | "pace" | "fillerWords" | "fluency") => avgOf(fb.map((f) => Number(f[k] ?? 0)));
  return {
    fluency: avg("fluency"),
    grammar: fb.length ? Math.max(0, 100 - Math.round(avgOf(fb.map((f) => f.grammar.length)) * 20)) : 0,
    vocabulary: avg("vocabularyScore"),
    pronunciation: fb.length ? Math.max(0, 100 - Math.round(avgOf(fb.map((f) => f.pronunciation.length)) * 15)) : 0,
    confidence: avg("confidence"),
    pace: avg("pace"),
    fillers: avg("fillerWords"),
  };
}
export type Metrics = ReturnType<typeof metricsOf>;

export async function speakingOverview(user: SessionUser) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [sessions, prof] = await Promise.all([
    db.speakingSession.findMany({
      where: { userId: user.id, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 100,
      select: { id: true, mode: true, scenario: true, missionDate: true, startedAt: true, endedAt: true, fluency: true, xp: true, feedback: true, summary: true },
    }),
    profile(user),
  ]);
  const date = todayFor(user);
  const list = sessions.map((s) => ({
    id: s.id, mode: s.mode, scenario: s.scenario, mission: !!s.missionDate, startedAt: s.startedAt.toISOString(),
    minutes: s.endedAt ? Math.max(1, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60_000)) : 0,
    fluency: s.fluency, xp: s.xp, turns: (JSON.parse(s.feedback) as Feedback[]).length,
    summary: (s.summary ? JSON.parse(s.summary) : null) as Summary | null,
  }));
  const recent = sessions.filter((s) => s.startedAt >= since);
  const series = recent.map((s) => ({ date: s.startedAt.toISOString().slice(0, 10), fluency: s.fluency ?? 0 })).reverse();
  const overall = metricsOf(recent.flatMap((s) => JSON.parse(s.feedback) as Feedback[]));
  const missionDone = sessions.some((s) => s.missionDate === date);
  const todayMinutes = list.filter((s) => s.startedAt.slice(0, 10) === date).reduce((n, s) => n + s.minutes, 0);
  return { sessions: list, series, overall, todayMinutes, mission: { ...missionFor(date, prof.level), done: missionDone }, profile: prof, date };
}
export type SpeakingOverview = Awaited<ReturnType<typeof speakingOverview>>;
