// Pure board-state logic for the four games: shapes, empty boards, conflict detection and repair().
// No React here on purpose, so it can be unit-tested directly (see repair.test.ts).

import type { GameId } from "@/lib/gamification/puzzles/types";

// ─── Queens ──────────────────────────────────────────────────────────────────
export type QueensPublic = { n: number; regions: number[][] };
export type QueensState = { queens: (number | null)[]; xs: string[]; flash?: string };
export const emptyQueens = (n: number): QueensState => ({ queens: Array(n).fill(null), xs: [] });

/** Rows whose queens break a rule: same column, same region, or touching diagonally. */
export function queensConflicts(p: QueensPublic, q: (number | null)[]) {
  const bad = new Set<number>();
  q.forEach((c, r) => {
    if (c === null) return;
    q.forEach((c2, r2) => {
      if (r2 === r || c2 === null) return;
      if (c2 === c || p.regions[r][c] === p.regions[r2][c2] || (Math.abs(r - r2) === 1 && Math.abs(c - c2) === 1)) { bad.add(r); bad.add(r2); }
    });
  });
  return bad;
}

// ─── Tango ───────────────────────────────────────────────────────────────────
export type TangoPublic = { n: number; givens: (0 | 1 | null)[][]; constraints: { a: [number, number]; b: [number, number]; kind: "eq" | "x" }[] };
export type TangoState = { grid: (0 | 1 | null)[][]; flash?: string };
export const emptyTango = (p: TangoPublic): TangoState => ({ grid: p.givens.map((r) => [...r]) });

/** Cells breaking a rule: three alike in a row, or more than half a row/column of one symbol. */
export function tangoConflicts(g: (0 | 1 | null)[][]) {
  const bad = new Set<string>();
  const n = g.length;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = g[r][c]; if (v === null) continue;
    if (c >= 2 && g[r][c - 1] === v && g[r][c - 2] === v) [c, c - 1, c - 2].forEach((x) => bad.add(`${r},${x}`));
    if (r >= 2 && g[r - 1][c] === v && g[r - 2][c] === v) [r, r - 1, r - 2].forEach((y) => bad.add(`${y},${c}`));
  }
  for (let i = 0; i < n; i++) {
    const row = g[i].filter((v) => v !== null), col = g.map((r) => r[i]).filter((v) => v !== null);
    if (row.filter((v) => v === 0).length > n / 2 || row.filter((v) => v === 1).length > n / 2) for (let c = 0; c < n; c++) bad.add(`${i},${c}`);
    if (col.filter((v) => v === 0).length > n / 2 || col.filter((v) => v === 1).length > n / 2) for (let r = 0; r < n; r++) bad.add(`${r},${i}`);
  }
  return bad;
}

// ─── Crossclimb ──────────────────────────────────────────────────────────────
export type CrossclimbPublic = { clues: string[] };
export type CrossclimbState = { answers: string[]; order: number[]; flash?: string };
export const emptyCrossclimb = (p: CrossclimbPublic): CrossclimbState => ({ answers: p.clues.map(() => ""), order: p.clues.map((_, i) => i) });
export const oneLetterApart = (a: string, b: string) => a.length === b.length && a.length > 0 && [...a].filter((ch, i) => ch !== b[i]).length === 1;

// ─── Pinpoint ────────────────────────────────────────────────────────────────
export type PinpointPublic = { words: string[] };
export type PinpointState = { guesses: string[]; guess: string; letter?: string; letters?: number; flash?: string };
export const emptyPinpoint = (): PinpointState => ({ guesses: [], guess: "" });

// ─── Repair ──────────────────────────────────────────────────────────────────
/**
 * A board state guaranteed to be the right shape for `game`, keeping whatever survived in `stored`.
 * Covers a fresh attempt (empty state) and rows an older build clobbered by writing the submitted
 * answer into the state column. Normalising at this one place is what lets every board and helper
 * assume its arrays exist — a missing array here previously blanked the whole page.
 */
export function repair(game: GameId, puzzle: unknown, stored: unknown): unknown {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const arr = (v: unknown, len: number) => (Array.isArray(v) && v.length === len ? v : null);
  if (game === "queens") {
    const base = emptyQueens((puzzle as QueensPublic).n);
    return { queens: arr(s.queens, base.queens.length) ?? base.queens, xs: Array.isArray(s.xs) ? s.xs : [] };
  }
  if (game === "tango") {
    const base = emptyTango(puzzle as TangoPublic);
    return { grid: arr(s.grid, base.grid.length) ?? base.grid };
  }
  if (game === "crossclimb") {
    const base = emptyCrossclimb(puzzle as CrossclimbPublic);
    return { answers: arr(s.answers, base.answers.length) ?? base.answers, order: arr(s.order, base.order.length) ?? base.order };
  }
  return {
    guesses: Array.isArray(s.guesses) ? s.guesses : [],
    guess: typeof s.guess === "string" ? s.guess : "",
    letter: typeof s.letter === "string" ? s.letter : undefined,
    letters: typeof s.letters === "number" ? s.letters : 0,
  };
}
