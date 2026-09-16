import { describe, expect, it } from "vitest";
import { accuracyFrom, nextSkill, profileLevel, puzzleXp, rankCompare, touchStreak } from "./rules";

describe("skill progression", () => {
  const win = { won: true, accuracy: 100 };
  it("promotes after 5 straight accurate wins and resets the streak", () => {
    let s = { level: 3, winStreak: 0, recent: [] as { won: boolean; accuracy: number }[] };
    for (let i = 0; i < 4; i++) s = nextSkill(s, win);
    expect(s.level).toBe(3);
    s = nextSkill(s, win);
    expect(s.level).toBe(4);
    expect(s.winStreak).toBe(0);
  });
  it("does not promote when accuracy is too low", () => {
    let s = { level: 3, winStreak: 0, recent: [] as { won: boolean; accuracy: number }[] };
    for (let i = 0; i < 5; i++) s = nextSkill(s, { won: true, accuracy: 80 });
    expect(s.level).toBe(3);
  });
  it("demotes after 3 failures in the last 5 days, never below 1", () => {
    let s = { level: 2, winStreak: 0, recent: [] as { won: boolean; accuracy: number }[] };
    s = nextSkill(s, win); s = nextSkill(s, { won: false, accuracy: 0 }); s = nextSkill(s, { won: false, accuracy: 0 });
    expect(s.level).toBe(2);
    s = nextSkill(s, { won: false, accuracy: 0 });
    expect(s.level).toBe(1);
    expect(s.recent).toEqual([]);
    s = nextSkill(nextSkill(nextSkill(s, { won: false, accuracy: 0 }), { won: false, accuracy: 0 }), { won: false, accuracy: 0 });
    expect(s.level).toBe(1);
  });
});

describe("streak", () => {
  const base = { current: 3, best: 5, shields: 1, missedDays: 0, lastActive: "2026-09-10" };
  it("same day is a no-op", () => expect(touchStreak(base, "2026-09-10").current).toBe(3));
  it("next day increments", () => expect(touchStreak(base, "2026-09-11").current).toBe(4));
  it("one missed day with a shield keeps the streak and consumes the shield", () => {
    const s = touchStreak(base, "2026-09-12");
    expect(s).toMatchObject({ current: 4, shields: 0, missedDays: 1, shieldUsed: true });
  });
  it("one missed day without a shield resets", () => {
    expect(touchStreak({ ...base, shields: 0 }, "2026-09-12").current).toBe(1);
  });
  it("two missed days reset even with a shield", () => {
    expect(touchStreak(base, "2026-09-13")).toMatchObject({ current: 1, shields: 1, missedDays: 2 });
  });
  it("tracks best", () => expect(touchStreak({ ...base, current: 5 }, "2026-09-11").best).toBe(6));
});

describe("xp and ranking", () => {
  it("sums the XP table", () => {
    const total = puzzleXp({ perfect: true, hints: 0, streakCounted: true, allDone: true }).reduce((n, p) => n + p.amount, 0);
    expect(total).toBe(20 + 10 + 5 + 15 + 50);
    expect(puzzleXp({ perfect: false, hints: 2, streakCounted: false, allDone: false })).toEqual([{ source: "complete", amount: 20 }]);
  });
  it("ranks by time, then mistakes, then hints", () => {
    const rows = [
      { id: "c", timeMs: 100, mistakes: 1, hints: 1 },
      { id: "a", timeMs: 90, mistakes: 2, hints: 0 },
      { id: "b", timeMs: 100, mistakes: 1, hints: 0 },
    ].sort(rankCompare);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("accuracy and profile level", () => {
    expect(accuracyFrom(3)).toBe(70);
    expect(accuracyFrom(20)).toBe(0);
    expect(profileLevel(0).level).toBe(1);
    expect(profileLevel(200).level).toBe(2);
    expect(profileLevel(200 + 220).level).toBe(3);
  });
});
