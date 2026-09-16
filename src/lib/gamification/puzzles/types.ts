export type GameId = "queens" | "crossclimb" | "pinpoint" | "tango";
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/** public = what the browser gets before solving; solution = server-only. */
export type Puzzle<P, S> = { public: P; solution: S };
export type GameModule<P, S, A, H> = {
  id: GameId;
  generate(seed: string, level: Level): Puzzle<P, S>;
  /** true when `answer` fully solves the puzzle. */
  verify(puzzle: Puzzle<P, S>, answer: A): boolean;
  /** One hint toward the solution given current partial `answer`; null if nothing left to hint. */
  hint(puzzle: Puzzle<P, S>, answer: A): H | null;
};
