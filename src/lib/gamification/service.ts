// Database side of gamification: daily puzzles, attempts, XP ledger, streaks, skill, profile.

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { fail } from "@/lib/api";
import { todayYmd } from "@/lib/time";
import { GAME_IDS, accuracyFrom, asLevel, nextSkill, profileLevel, puzzleSeed, puzzleXp, rankCompare, touchStreak, type DayResult } from "./rules";
import { generate, verify, hint as puzzleHint, GAME_META } from "./puzzles";
import type { GameId } from "./puzzles/types";

export const isGame = (g: string): g is GameId => (GAME_IDS as string[]).includes(g);

/** "Today" is the player's local calendar day; a new puzzle unlocks at their midnight. */
export const todayFor = (user: SessionUser) => todayYmd(user.timezone);

export async function getSkill(userId: string, game: GameId) {
  return db.playerSkill.upsert({ where: { userId_game: { userId, game } }, update: {}, create: { userId, game } });
}

/** One puzzle per (game, day, level); generated on first request, shared by everyone at that level. */
export async function getDailyPuzzle(game: GameId, date: string, level: number) {
  const seed = puzzleSeed(game, date, level);
  const found = await db.dailyPuzzle.findUnique({ where: { game_date_level: { game, date, level } } });
  if (found) return found;
  const data = JSON.stringify(generate(game, seed, asLevel(level)));
  return db.dailyPuzzle.upsert({ where: { game_date_level: { game, date, level } }, update: {}, create: { game, date, level, seed, data } });
}

export type PuzzleData = { public: unknown; solution: unknown };
export const puzzleData = (p: { data: string }) => JSON.parse(p.data) as PuzzleData;

/** The player's attempt for today (creates one on first open, starting the clock). */
export async function startAttempt(user: SessionUser, game: GameId) {
  const date = todayFor(user);
  const existing = await db.puzzleAttempt.findUnique({ where: { userId_game_date: { userId: user.id, game, date } }, include: { puzzle: true } });
  if (existing) return existing;
  const skill = await getSkill(user.id, game);
  const puzzle = await getDailyPuzzle(game, date, skill.level);
  return db.puzzleAttempt.create({ data: { userId: user.id, puzzleId: puzzle.id, game, date }, include: { puzzle: true } });
}

/** What the browser may see: solution only after the attempt is over. */
export function attemptView(a: { id: string; game: string; date: string; status: string; startedAt: Date; completedAt: Date | null; timeMs: number | null; mistakes: number; hints: number; accuracy: number | null; xp: number; state: string; puzzle: { level: number; data: string } }) {
  const over = a.status !== "IN_PROGRESS";
  const data = puzzleData(a.puzzle);
  return {
    id: a.id, game: a.game as GameId, date: a.date, status: a.status as "IN_PROGRESS" | "COMPLETED" | "FAILED",
    startedAt: a.startedAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null,
    timeMs: a.timeMs, mistakes: a.mistakes, hints: a.hints, accuracy: a.accuracy, xp: a.xp,
    state: JSON.parse(a.state) as unknown, level: a.puzzle.level,
    puzzle: data.public, solution: over ? data.solution : null, meta: GAME_META[a.game as GameId],
  };
}
export type AttemptView = ReturnType<typeof attemptView>;

/** Save partial progress, count a mistake, or take a hint. Never touches a finished attempt. */
export async function progressAttempt(user: SessionUser, game: GameId, patch: { state?: unknown; answer?: unknown; mistake?: boolean; hint?: boolean }) {
  const a = await startAttempt(user, game);
  if (a.status !== "IN_PROGRESS") throw fail(409, "Today's puzzle is already finished. Come back after midnight.");
  const data = puzzleData(a.puzzle);
  const state = patch.state ?? JSON.parse(a.state);
  // Hints are computed against the answer shape (what verify() reads), not the raw board state.
  const h = patch.hint ? puzzleHint(game, data, patch.answer ?? state) : null;
  const updated = await db.puzzleAttempt.update({
    where: { id: a.id },
    data: { state: JSON.stringify(state), mistakes: patch.mistake ? { increment: 1 } : undefined, hints: patch.hint ? { increment: 1 } : undefined },
    include: { puzzle: true },
  });
  return { attempt: attemptView(updated), hint: h };
}

/** Submit a final answer. Wrong answers count as a mistake and keep the attempt open until mistakes reach the limit. */
export async function completeAttempt(user: SessionUser, game: GameId, answer: unknown, giveUp = false) {
  const a = await startAttempt(user, game);
  if (a.status !== "IN_PROGRESS") throw fail(409, "Today's puzzle is already finished.");
  const data = puzzleData(a.puzzle);
  const correct = !giveUp && verify(game, data, answer);
  const MAX_MISTAKES = 3;

  if (!correct && !giveUp && a.mistakes + 1 < MAX_MISTAKES) {
    const updated = await db.puzzleAttempt.update({ where: { id: a.id }, data: { mistakes: { increment: 1 } }, include: { puzzle: true } });
    return { attempt: attemptView(updated), correct: false, xp: [] as { source: string; amount: number }[] };
  }

  const mistakes = correct ? a.mistakes : a.mistakes + (giveUp ? 0 : 1);
  const timeMs = Date.now() - a.startedAt.getTime();
  const accuracy = accuracyFrom(mistakes);
  const date = a.date;

  // XP: streak bonus on the first game finished today, all-games bonus on the fourth.
  const doneToday = await db.puzzleAttempt.count({ where: { userId: user.id, date, status: "COMPLETED" } });
  const xpParts = correct ? puzzleXp({ perfect: mistakes === 0, hints: a.hints, streakCounted: doneToday === 0, allDone: doneToday + 1 === GAME_IDS.length }) : [];
  const xp = xpParts.reduce((n, p) => n + p.amount, 0);

  const skill = await getSkill(user.id, game);
  const result: DayResult = { won: correct, accuracy };
  const ns = nextSkill({ level: skill.level, winStreak: skill.winStreak, recent: JSON.parse(skill.recent) }, result);

  const [updated] = await db.$transaction([
    db.puzzleAttempt.update({
      where: { id: a.id },
      data: { status: correct ? "COMPLETED" : "FAILED", completedAt: new Date(), timeMs, mistakes, accuracy, xp },
      include: { puzzle: true },
    }),
    db.playerSkill.update({ where: { id: skill.id }, data: { level: ns.level, winStreak: ns.winStreak, recent: JSON.stringify(ns.recent) } }),
    ...xpParts.map((p) => db.gameXP.create({ data: { userId: user.id, date, source: p.source, amount: p.amount, note: game } })),
  ]);
  if (correct) await markActive(user.id, date);
  return { attempt: attemptView(updated), correct, xp: xpParts, levelChange: ns.level - skill.level };
}

/** First finished activity of the day advances the streak (shield logic in rules.ts). */
export async function markActive(userId: string, date: string) {
  const s = await db.dailyStreak.upsert({ where: { userId }, update: {}, create: { userId } });
  const n = touchStreak(s, date);
  if (n.lastActive === s.lastActive) return s;
  return db.dailyStreak.update({ where: { userId }, data: { current: n.current, best: n.best, shields: n.shields, missedDays: n.missedDays, lastActive: date } });
}

export async function awardXp(userId: string, date: string, source: string, amount: number, note?: string) {
  await db.gameXP.create({ data: { userId, date, source, amount, note } });
  await markActive(userId, date);
}

/** Cohort = students of the same program. Admins and mentors have no cohort → global only. */
export async function cohortIds(userId: string) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { programId: true } });
  if (!me?.programId) return null;
  return (await db.user.findMany({ where: { programId: me.programId }, select: { id: true } })).map((u) => u.id);
}

export type Scope = "cohort" | "global" | "friends";

/** Ranking for one game on one day: time, then mistakes, then hints. Friends is future-ready and returns nothing. */
export async function leaderboard(user: SessionUser, game: GameId, date: string, scope: Scope) {
  if (scope === "friends") return { rows: [], me: null, scope };
  const ids = scope === "cohort" ? await cohortIds(user.id) : null;
  if (scope === "cohort" && !ids) return { rows: [], me: null, scope };
  const rows = await db.puzzleAttempt.findMany({
    where: { game, date, status: "COMPLETED", ...(ids ? { userId: { in: ids } } : {}) },
    select: { userId: true, timeMs: true, mistakes: true, hints: true, xp: true, user: { select: { name: true } } },
  });
  const sorted = rows.map((r) => ({ ...r, timeMs: r.timeMs ?? 0 })).sort(rankCompare).map((r, i) => ({ rank: i + 1, userId: r.userId, name: r.user.name, timeMs: r.timeMs, mistakes: r.mistakes, hints: r.hints, xp: r.xp }));
  return { rows: sorted.slice(0, 50), me: sorted.find((r) => r.userId === user.id) ?? null, scope };
}

/** Shared profile for Brain Arena and Aria. */
export async function profile(user: SessionUser) {
  const date = todayFor(user);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [xpSum, streak, attempts, sessions, cohort] = await Promise.all([
    db.gameXP.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
    db.dailyStreak.findUnique({ where: { userId: user.id } }),
    db.puzzleAttempt.findMany({ where: { userId: user.id, status: { not: "IN_PROGRESS" }, completedAt: { gte: since } }, select: { accuracy: true, status: true } }),
    db.speakingSession.findMany({ where: { userId: user.id, endedAt: { not: null }, startedAt: { gte: since } }, select: { fluency: true, feedback: true } }),
    cohortIds(user.id),
  ]);
  const totalXp = xpSum._sum.amount ?? 0;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const logicScore = avg(attempts.map((a) => (a.status === "COMPLETED" ? a.accuracy ?? 0 : 0)));
  const communicationScore = avg(sessions.map((s) => s.fluency ?? 0));
  const vocabularyScore = avg(sessions.flatMap((s) => (JSON.parse(s.feedback) as { vocabularyScore?: number }[]).map((f) => f.vocabularyScore ?? 0)));

  let cohortRank: number | null = null;
  let cohortSize = 0;
  if (cohort) {
    const totals = await db.gameXP.groupBy({ by: ["userId"], where: { userId: { in: cohort } }, _sum: { amount: true } });
    const ranked = cohort.map((id) => ({ id, xp: totals.find((t) => t.userId === id)?._sum.amount ?? 0 })).sort((a, b) => b.xp - a.xp);
    cohortRank = ranked.findIndex((r) => r.id === user.id) + 1;
    cohortSize = ranked.length;
  }
  return {
    date, totalXp, ...profileLevel(totalXp), logicScore, communicationScore, vocabularyScore,
    streak: { current: streak?.current ?? 0, best: streak?.best ?? 0, shields: streak?.shields ?? 1, missedDays: streak?.missedDays ?? 0, lastActive: streak?.lastActive ?? null },
    cohortRank, cohortSize,
  };
}
export type Profile = Awaited<ReturnType<typeof profile>>;
