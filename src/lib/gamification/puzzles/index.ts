// Registry + JSON-friendly dispatchers over the four puzzle modules.
import { queens } from "./queens";
import { tango } from "./tango";
import { crossclimb } from "./crossclimb";
import { pinpoint } from "./pinpoint";
import type { GameId, GameModule, Level, Puzzle } from "./types";

export type { GameId, Level, Puzzle, GameModule } from "./types";
export type { QueensPublic, QueensSolution, QueensAnswer, QueensHint } from "./queens";
export type { TangoPublic, TangoSolution, TangoAnswer, TangoHint } from "./tango";
export type { CrossclimbPublic, CrossclimbSolution, CrossclimbAnswer, CrossclimbHint } from "./crossclimb";
export type { PinpointPublic, PinpointSolution, PinpointAnswer, PinpointHint } from "./pinpoint";

type AnyModule = GameModule<unknown, unknown, unknown, unknown>;

export const GAMES = { queens, tango, crossclimb, pinpoint } satisfies Record<GameId, AnyModule>;

export const GAME_META: Record<GameId, { name: string; blurb: string; emoji: string }> = {
  queens: { name: "Queens", blurb: "Place one queen in every row, column and colour region without any two touching.", emoji: "👑" },
  tango: { name: "Tango", blurb: "Fill the grid with suns and moons so each row and column is balanced and no three match in a row.", emoji: "🌗" },
  crossclimb: { name: "Crossclimb", blurb: "Solve five clues, then order the words so each rung changes just one letter.", emoji: "🪜" },
  pinpoint: { name: "Pinpoint", blurb: "Words are revealed one by one; guess the category they share in as few as possible.", emoji: "🎯" },
};

const mod = (game: GameId): AnyModule => GAMES[game] as AnyModule;

export function generate(game: GameId, seed: string, level: Level): Puzzle<unknown, unknown> {
  return mod(game).generate(seed, level);
}

export function verify(game: GameId, puzzle: unknown, answer: unknown): boolean {
  return mod(game).verify(puzzle as Puzzle<unknown, unknown>, answer);
}

export function hint(game: GameId, puzzle: unknown, answer: unknown): unknown {
  return mod(game).hint(puzzle as Puzzle<unknown, unknown>, answer);
}
