import { describe, expect, it } from "vitest";
import { GAMES, generate, verify, hint, GAME_META } from "./index";
import type { GameId, Level } from "./types";
import * as queens from "./queens";
import * as tango from "./tango";
import { LADDERS, differsByOne } from "./crossclimb";
import { ENTRIES } from "./pinpoint";

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as Level[];
const SEEDS = ["alpha", "2026-09-16", "zzz"];

/** A definitely-wrong answer per game, derived from the solution. */
const wrongAnswer: Record<GameId, (sol: any) => unknown> = {
  queens: (s) => ({ queens: s.queens.map((c: number, i: number) => (i === 0 ? (c + 1) % s.queens.length : c)) }),
  tango: (s) => ({ grid: s.grid.map((row: number[], i: number) => (i === 0 ? row.map((v) => 1 - v) : row)) }),
  crossclimb: (s) => ({ words: ["zzzz", ...s.words.slice(1)] }),
  pinpoint: () => ({ guess: "definitely not this" }),
};
const solutionAsAnswer: Record<GameId, (sol: any) => unknown> = {
  queens: (s) => s,
  tango: (s) => s,
  crossclimb: (s) => ({ words: s.words }),
  pinpoint: (s) => ({ guess: s.category }),
};
const emptyAnswer: Record<GameId, unknown> = {
  queens: { queens: [] },
  tango: { grid: [] },
  crossclimb: { words: [] },
  pinpoint: { guess: "" },
};

describe.each(Object.keys(GAMES) as GameId[])("%s", (game) => {
  it("has meta", () => expect(GAME_META[game].name).toBeTruthy());
  describe.each(LEVELS)("level %i", (level) => {
    it.each(SEEDS)("seed %s: generate/verify/hint", (seed) => {
      const t0 = performance.now();
      const p = generate(game, seed, level);
      expect(performance.now() - t0).toBeLessThan(1000);
      expect(JSON.stringify(generate(game, seed, level))).toBe(JSON.stringify(p));
      const sol = p.solution as any;
      // round-trip through JSON like a real request would
      const pj = JSON.parse(JSON.stringify(p));
      expect(verify(game, pj, solutionAsAnswer[game](sol))).toBe(true);
      expect(verify(game, pj, wrongAnswer[game](sol))).toBe(false);
      expect(hint(game, pj, emptyAnswer[game])).not.toBeNull();
      expect(hint(game, pj, solutionAsAnswer[game](sol))).toBeNull();
    });
  });
});

describe("queens", () => {
  it.each(LEVELS)("level %i solution is unique and valid", (level) => {
    for (const seed of SEEDS) {
      const p = queens.generate(seed, level);
      expect(queens.countSolutions(p.public, 3)).toBe(1);
      const { n, regions } = p.public;
      const q = p.solution.queens;
      expect(new Set(q).size).toBe(n);
      expect(new Set(q.map((c, r) => regions[r][c])).size).toBe(n);
      for (let r = 1; r < n; r++) expect(Math.abs(q[r] - q[r - 1])).toBeGreaterThan(1);
    }
  });
  it("accepts either ladder direction in crossclimb", () => {
    const p = GAMES.crossclimb.generate("dir", 5);
    expect(GAMES.crossclimb.verify(p, { words: [...p.solution.words].reverse() })).toBe(true);
  });
});

describe("tango", () => {
  it.each(LEVELS)("level %i solution is unique, givens shrink with level", (level) => {
    for (const seed of SEEDS) {
      const p = tango.generate(seed, level);
      expect(tango.countSolutions(p.public, 3)).toBe(1);
      const givens = p.public.givens.flat().filter((v) => v !== null).length;
      expect(givens).toBeLessThanOrEqual(level === 1 ? 20 : 18);
      expect(p.public.constraints.length).toBeGreaterThanOrEqual(2);
      expect(p.public.constraints.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("crossclimb bank", () => {
  it("has >= 24 ladders that obey the one-letter rule", () => {
    expect(LADDERS.length).toBeGreaterThanOrEqual(24);
    for (const l of LADDERS) {
      expect(l.words).toHaveLength(5);
      expect(l.clues).toHaveLength(5);
      for (const w of l.words) expect(w).toMatch(/^[a-z]{4}$/);
      expect(new Set(l.words).size).toBe(5);
      for (let i = 1; i < 5; i++) expect(differsByOne(l.words[i - 1], l.words[i]), l.words.join(" ")).toBe(true);
    }
  });
});

describe("pinpoint bank", () => {
  it("has >= 40 entries with 5 words each", () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(40);
    for (const e of ENTRIES) expect(e.words, e.category).toHaveLength(5);
  });
  it("normalises guesses", () => {
    const p = GAMES.pinpoint.generate("x", 1);
    expect(GAMES.pinpoint.verify(p, { guess: `  The ${p.solution.category.toUpperCase()}!! ` })).toBe(true);
    expect(GAMES.pinpoint.hint(p, { guess: "" })).toEqual({ letter: p.solution.category.slice(0, 1), letters: 1 });
    expect(GAMES.pinpoint.hint(p, { guess: "", letters: 2 } as never)).toEqual({ letter: p.solution.category.slice(0, 3), letters: 3 });
  });
});
