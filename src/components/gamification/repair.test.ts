import { describe, expect, it } from "vitest";
import { repair } from "./boardState";

// These are the exact rows an older build corrupted by writing the submitted answer into
// PuzzleAttempt.state. They must render, not crash the page. See the Crossclimb blank-page bug.
const QUEENS = { n: 5, regions: [[3, 1, 2, 0, 2], [3, 1, 2, 2, 2], [3, 3, 2, 2, 2], [3, 3, 3, 2, 2], [3, 3, 4, 2, 2]] };
const TANGO = { n: 6, givens: Array.from({ length: 6 }, () => Array(6).fill(null)), constraints: [] };
const CROSS = { clues: ["Musical group", "Not straight", "It has five fingers", "Top quality", "Curve or flex"] };
const PIN = { words: ["monday", "tuesday", "thursday", "friday", "sunday"] };

type Q = { queens: (number | null)[]; xs: string[] };
type T = { grid: (0 | 1 | null)[][] };
type C = { answers: string[]; order: number[] };
type P = { guesses: string[]; guess: string; letters: number };

describe("repair: corrupted board state always renders", () => {
  it("crossclimb: an answer-shaped row gets usable arrays", () => {
    const r = repair("crossclimb", CROSS, { words: ["band", "tube", "werr", "eew", "qqqq"] }) as C;
    expect(r.answers).toHaveLength(5);
    expect(r.order).toEqual([0, 1, 2, 3, 4]);
    expect(() => r.answers.every((a) => a.length >= 3)).not.toThrow();
  });

  it("queens: keeps the placed queens, restores the missing xs", () => {
    const r = repair("queens", QUEENS, { queens: [3, 1, 4, 0, 2] }) as Q;
    expect(r.queens).toEqual([3, 1, 4, 0, 2]);
    expect(r.xs).toEqual([]);
  });

  it("pinpoint: keeps the guess, restores the missing guesses list", () => {
    const r = repair("pinpoint", PIN, { guess: "days", letters: 5 }) as P;
    expect(r.guess).toBe("days");
    expect(r.letters).toBe(5);
    expect(r.guesses).toEqual([]);
  });

  it("tango: a correctly shaped grid survives untouched", () => {
    const grid = Array.from({ length: 6 }, () => Array(6).fill(0));
    expect((repair("tango", TANGO, { grid }) as T).grid).toEqual(grid);
  });

  it("a wrong-length array is replaced, not trusted", () => {
    expect((repair("queens", QUEENS, { queens: [1, 2] }) as Q).queens).toEqual([null, null, null, null, null]);
    expect((repair("crossclimb", CROSS, { answers: ["a"] }) as C).answers).toEqual(["", "", "", "", ""]);
  });

  it("null, empty and junk states all produce a fresh board", () => {
    for (const junk of [null, undefined, {}, "nonsense", 42, []]) {
      expect((repair("crossclimb", CROSS, junk) as C).answers).toHaveLength(5);
      expect((repair("queens", QUEENS, junk) as Q).xs).toEqual([]);
      expect((repair("pinpoint", PIN, junk) as P).guesses).toEqual([]);
      expect((repair("tango", TANGO, junk) as T).grid).toHaveLength(6);
    }
  });
});
