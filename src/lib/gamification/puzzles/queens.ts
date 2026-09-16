// Queens (LinkedIn). N x N grid split into N contiguous coloured regions.
// Place N queens so that every row, every column and every region holds exactly
// one queen, and no two queens touch (orthogonally or diagonally).
// Because there is one queen per row, "touching" reduces to: queens in adjacent
// rows must be at least two columns apart.
import { rng, shuffle, int } from "./rng";
import type { GameModule, Level, Puzzle } from "./types";

export type QueensPublic = { n: number; regions: number[][] };
export type QueensSolution = { queens: number[] };
export type QueensAnswer = { queens: (number | null)[] };
export type QueensHint = { row: number; col: number };

export function sizeForLevel(level: Level): number {
  return 5 + Math.floor((level - 1) / 2); // 5,5,6,6,7,7,8,8,9,9
}

/** Backtracking: one queen per row, distinct columns, adjacent rows >= 2 apart. */
function placeQueens(r: () => number, n: number): number[] {
  const cols: number[] = [];
  const used = new Set<number>();
  const go = (row: number): boolean => {
    if (row === n) return true;
    for (const c of shuffle(r, [...Array(n).keys()])) {
      if (used.has(c) || (row > 0 && Math.abs(c - cols[row - 1]) < 2)) continue;
      cols[row] = c;
      used.add(c);
      if (go(row + 1)) return true;
      used.delete(c);
    }
    return false;
  };
  go(0);
  return cols;
}

/**
 * Multi-source random flood fill: region i starts at queen i and grows into unassigned
 * neighbours. Each region gets a random growth weight skewed toward 0 (r^6), so region
 * sizes are very uneven; a few tiny regions is what makes solutions unique. With uniform
 * growth, 8x8/9x9 grids almost never came out unique.
 */
function growRegions(r: () => number, n: number, queens: number[]): number[][] {
  const regions = Array.from({ length: n }, () => Array<number>(n).fill(-1));
  const frontier: [number, number][][] = queens.map((c, row) => {
    regions[row][c] = row;
    return [[row, c]];
  });
  const weight = queens.map(() => Math.pow(r(), 6) + 0.01);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (;;) {
    const active = frontier.map((f, i) => (f.length ? i : -1)).filter((i) => i >= 0);
    if (!active.length) break;
    let x = r() * active.reduce((s, i) => s + weight[i], 0);
    let reg = active[0];
    for (const i of active) {
      x -= weight[i];
      if (x <= 0) {
        reg = i;
        break;
      }
    }
    const f = frontier[reg];
    const k = int(r, 0, f.length - 1);
    const [fr, fc] = f[k];
    const free = dirs
      .map(([dr, dc]) => [fr + dr, fc + dc])
      .filter(([nr, nc]) => nr >= 0 && nc >= 0 && nr < n && nc < n && regions[nr][nc] === -1);
    if (!free.length) {
      f[k] = f[f.length - 1];
      f.pop();
      continue;
    }
    const [nr, nc] = free[int(r, 0, free.length - 1)];
    regions[nr][nc] = reg;
    f.push([nr, nc]);
  }
  return regions;
}

/** Counts solutions, stopping at `limit` (default 2, enough to test uniqueness). */
export function countSolutions(pub: QueensPublic, limit = 2): number {
  const { n, regions } = pub;
  const usedCol = new Set<number>();
  const usedReg = new Set<number>();
  let count = 0;
  const go = (row: number, prev: number): void => {
    if (count >= limit) return;
    if (row === n) {
      count++;
      return;
    }
    for (let c = 0; c < n; c++) {
      const reg = regions[row][c];
      if (usedCol.has(c) || usedReg.has(reg) || Math.abs(c - prev) < 2) continue;
      usedCol.add(c);
      usedReg.add(reg);
      go(row + 1, c);
      usedCol.delete(c);
      usedReg.delete(reg);
    }
  };
  go(0, -10);
  return count;
}

export function generate(seed: string, level: Level): Puzzle<QueensPublic, QueensSolution> {
  const n = sizeForLevel(level);
  let last: Puzzle<QueensPublic, QueensSolution> | null = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const r = rng(`${seed}:queens:${level}:${attempt}`);
    const queens = placeQueens(r, n);
    const regions = growRegions(r, n, queens);
    last = { public: { n, regions }, solution: { queens } };
    if (countSolutions(last.public) === 1) return last;
  }
  // ponytail: after 200 tries we return the last (possibly non-unique) puzzle rather than throw.
  return last!;
}

export function verify(puzzle: Puzzle<QueensPublic, QueensSolution>, answer: QueensAnswer): boolean {
  const sol = puzzle.solution.queens;
  const q = answer?.queens ?? [];
  return q.length === sol.length && sol.every((c, i) => q[i] === c);
}

export function hint(puzzle: Puzzle<QueensPublic, QueensSolution>, answer: QueensAnswer): QueensHint | null {
  const sol = puzzle.solution.queens;
  const q = answer?.queens ?? [];
  const row = sol.findIndex((c, i) => q[i] !== c);
  return row === -1 ? null : { row, col: sol[row] };
}

export const queens: GameModule<QueensPublic, QueensSolution, QueensAnswer, QueensHint> = {
  id: "queens",
  generate,
  verify,
  hint,
};
