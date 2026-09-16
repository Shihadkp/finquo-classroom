// Pure gamification rules: XP table, hidden difficulty levels, streaks, ranking. No I/O — see rules.test.ts.

import type { GameId, Level } from "./puzzles/types";

export const GAME_IDS: GameId[] = ["queens", "crossclimb", "pinpoint", "tango"];

export const XP = { complete: 20, perfect: 10, noHint: 5, streak: 15, allGames: 50, speaking: 30, mission: 40 } as const;

export const LEVEL_NAMES = ["Beginner", "Beginner+", "Easy", "Easy+", "Medium", "Medium+", "Hard", "Expert", "Elite", "Master"] as const;
export const levelName = (l: number) => LEVEL_NAMES[Math.min(10, Math.max(1, l)) - 1];

/** Puzzle seed: same puzzle for everyone on the same day at the same hidden level. */
export const puzzleSeed = (game: GameId, date: string, level: number) => `${game}:${date}:${level}`;

/** Accuracy from mistakes: each mistake costs 10 points, floor 0. */
export const accuracyFrom = (mistakes: number) => Math.max(0, 100 - mistakes * 10);

export type DayResult = { won: boolean; accuracy: number };

/**
 * Promotion: 5 consecutive wins AND average accuracy > 90 over those wins → level up (resets the win streak).
 * Demotion: 3 failed days in the last 5 → level down (clears the window so one bad week costs one level).
 */
export function nextSkill(cur: { level: number; winStreak: number; recent: DayResult[] }, result: DayResult) {
  const recent = [...cur.recent, result].slice(-5);
  let level = cur.level;
  let winStreak = result.won ? cur.winStreak + 1 : 0;
  if (winStreak >= 5) {
    const wins = recent.filter((r) => r.won);
    const avg = wins.reduce((n, r) => n + r.accuracy, 0) / Math.max(1, wins.length);
    if (avg > 90 && level < 10) { level++; winStreak = 0; }
  }
  if (recent.filter((r) => !r.won).length >= 3 && level > 1) {
    level--;
    return { level, winStreak: 0, recent: [] };
  }
  return { level, winStreak, recent };
}

export type Streak = { current: number; best: number; shields: number; missedDays: number; lastActive: string | null };

/** Days between two YYYY-MM-DD strings (b - a). */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/**
 * Called on the first completed activity of a day. Same day: no change.
 * Next day: +1. Missed exactly one day with a shield: consume it, keep going. Otherwise reset to 1.
 */
export function touchStreak(s: Streak, today: string): Streak & { shieldUsed: boolean } {
  if (s.lastActive === today) return { ...s, shieldUsed: false };
  const gap = s.lastActive ? dayDiff(s.lastActive, today) : Infinity;
  let { current, shields, missedDays } = s;
  let shieldUsed = false;
  if (gap === 1) current += 1;
  else if (gap === 2 && shields > 0) { shields -= 1; missedDays += 1; current += 1; shieldUsed = true; }
  else { if (s.lastActive) missedDays += Math.min(gap - 1, 365); current = 1; }
  return { current, best: Math.max(s.best, current), shields, missedDays, lastActive: today, shieldUsed };
}

/** Leaderboard order: fastest time, then fewest mistakes, then fewest hints. */
export function rankCompare(a: { timeMs: number; mistakes: number; hints: number }, b: typeof a) {
  return a.timeMs - b.timeMs || a.mistakes - b.mistakes || a.hints - b.hints;
}

/** XP for one finished puzzle. `streakCounted` = first game of the day (streak bonus), `allDone` = 4th game of the day. */
export function puzzleXp(o: { perfect: boolean; hints: number; streakCounted: boolean; allDone: boolean }) {
  const parts: { source: string; amount: number }[] = [{ source: "complete", amount: XP.complete }];
  if (o.perfect) parts.push({ source: "perfect", amount: XP.perfect });
  if (o.hints === 0) parts.push({ source: "no_hint", amount: XP.noHint });
  if (o.streakCounted) parts.push({ source: "streak", amount: XP.streak });
  if (o.allDone) parts.push({ source: "all_games", amount: XP.allGames });
  return parts;
}

/** Profile level from total XP: 200 XP per level, growing 10% each level. */
export function profileLevel(totalXp: number) {
  let level = 1, need = 200, left = totalXp;
  while (left >= need && level < 99) { left -= need; level++; need = Math.round(need * 1.1); }
  return { level, into: left, need };
}

export const asLevel = (n: number): Level => Math.min(10, Math.max(1, Math.round(n))) as Level;
