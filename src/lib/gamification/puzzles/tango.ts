// Tango (LinkedIn). 6 x 6 grid of suns (0) and moons (1).
// Every row and column holds exactly three of each; never three identical cells in a
// row horizontally or vertically. Some orthogonally adjacent pairs carry a constraint:
// "eq" = both cells equal, "x" = both cells differ. Some cells are given.
import { rng, shuffle, int } from "./rng";
import type { GameModule, Level, Puzzle } from "./types";

export type Cell = 0 | 1;
export type Constraint = { a: [number, number]; b: [number, number]; kind: "eq" | "x" };
export type TangoPublic = { n: 6; givens: (Cell | null)[][]; constraints: Constraint[] };
export type TangoSolution = { grid: Cell[][] };
export type TangoAnswer = { grid: (Cell | null)[][] };
export type TangoHint = { row: number; col: number; value: Cell };

const N = 6;

/**
 * Backtracking fill in row-major order. `givens` fixes cells, `order` gives the value
 * order to try per cell (randomised for generation), `limit` stops counting early.
 * Returns { count, grid } where grid is the first solution found.
 */
function solve(
  givens: (Cell | null)[][],
  constraints: Constraint[],
  order: () => Cell[],
  limit: number,
): { count: number; grid: Cell[][] } {
  const g: (Cell | null)[][] = givens.map((row) => row.slice());
  let first: Cell[][] = [];
  // per-cell list of constraints to check once this cell is filled (partner comes earlier in row-major order)
  const checks: { r: number; c: number; kind: "eq" | "x" }[][][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => []),
  );
  for (const k of constraints) {
    const [p, q] = k.a[0] * N + k.a[1] < k.b[0] * N + k.b[1] ? [k.a, k.b] : [k.b, k.a];
    checks[q[0]][q[1]].push({ r: p[0], c: p[1], kind: k.kind });
  }
  const rowCnt = Array.from({ length: N }, () => [0, 0]);
  const colCnt = Array.from({ length: N }, () => [0, 0]);
  let count = 0;

  const ok = (r: number, c: number, v: Cell): boolean => {
    if (rowCnt[r][v] >= 3 || colCnt[c][v] >= 3) return false;
    if (c >= 2 && g[r][c - 1] === v && g[r][c - 2] === v) return false;
    if (r >= 2 && g[r - 1][c] === v && g[r - 2][c] === v) return false;
    for (const k of checks[r][c]) {
      const other = g[k.r][k.c];
      if (other === null) continue;
      if (k.kind === "eq" ? other !== v : other === v) return false;
    }
    return true;
  };

  const go = (idx: number): void => {
    if (count >= limit) return;
    if (idx === N * N) {
      if (count === 0) first = g.map((row) => row.slice() as Cell[]);
      count++;
      return;
    }
    const r = Math.floor(idx / N);
    const c = idx % N;
    const fixed = givens[r][c];
    for (const v of fixed === null ? order() : [fixed]) {
      if (!ok(r, c, v)) continue;
      g[r][c] = v;
      rowCnt[r][v]++;
      colCnt[c][v]++;
      go(idx + 1);
      rowCnt[r][v]--;
      colCnt[c][v]--;
      g[r][c] = null;
    }
  };
  go(0);
  return { count, grid: first };
}

export function countSolutions(pub: TangoPublic, limit = 2): number {
  return solve(pub.givens, pub.constraints, () => [0, 1], limit).count;
}

const empty = (): (Cell | null)[][] => Array.from({ length: N }, () => Array<Cell | null>(N).fill(null));

export function generate(seed: string, level: Level): Puzzle<TangoPublic, TangoSolution> {
  const r = rng(`${seed}:tango:${level}`);
  const grid = solve(empty(), [], () => (r() < 0.5 ? [0, 1] : [1, 0]), 1).grid;

  // 2-6 constraints on random adjacent pairs, read off the solution.
  const pairs: [[number, number], [number, number]][] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (j + 1 < N) pairs.push([[i, j], [i, j + 1]]);
      if (i + 1 < N) pairs.push([[i, j], [i + 1, j]]);
    }
  const constraints: Constraint[] = shuffle(r, pairs)
    .slice(0, int(r, 2, 6))
    .map(([a, b]) => ({ a, b, kind: grid[a[0]][a[1]] === grid[b[0]][b[1]] ? "eq" : "x" }));

  // Remove givens in seeded order while the puzzle stays unique, down to the level's target.
  const target = Math.round(18 - ((level - 1) * 12) / 9); // 18 .. 6
  const givens: (Cell | null)[][] = grid.map((row) => row.slice());
  let remaining = N * N;
  for (const idx of shuffle(r, [...Array(N * N).keys()])) {
    if (remaining <= target) break;
    const [i, j] = [Math.floor(idx / N), idx % N];
    const v = givens[i][j];
    givens[i][j] = null;
    if (solve(givens, constraints, () => [0, 1], 2).count === 1) remaining--;
    else givens[i][j] = v;
  }
  return { public: { n: 6, givens, constraints }, solution: { grid } };
}

export function verify(puzzle: Puzzle<TangoPublic, TangoSolution>, answer: TangoAnswer): boolean {
  const g = answer?.grid;
  return !!g && puzzle.solution.grid.every((row, i) => row.every((v, j) => g[i]?.[j] === v));
}

export function hint(puzzle: Puzzle<TangoPublic, TangoSolution>, answer: TangoAnswer): TangoHint | null {
  const g = answer?.grid ?? [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const v = puzzle.solution.grid[i][j];
      if (g[i]?.[j] !== v) return { row: i, col: j, value: v };
    }
  return null;
}

export const tango: GameModule<TangoPublic, TangoSolution, TangoAnswer, TangoHint> = {
  id: "tango",
  generate,
  verify,
  hint,
};
