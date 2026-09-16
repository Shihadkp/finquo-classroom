"use client";

// One controller for all four games: start → play (autosave, hints, submit) → review. Server owns the clock, the rules and the solution.

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { AttemptView } from "@/lib/gamification/service";
import type { GameId } from "@/lib/gamification/puzzles/types";
import { useApi, useToast } from "@/components/Toast";
import { GameHeader, HintButton, ReviewModal } from "./brain";
import {
  CrossclimbBoard, PinpointBoard, QueensBoard, TangoBoard,
  emptyCrossclimb, emptyPinpoint, emptyQueens, emptyTango,
  type CrossclimbPublic, type CrossclimbState, type PinpointPublic, type PinpointState, type QueensPublic, type QueensState, type TangoPublic, type TangoState,
} from "./boards";
import { repair } from "./boardState";

type Result = { attempt: AttemptView; correct: boolean; xp: { source: string; amount: number }[]; levelChange?: number };
type Meta = { name: string; blurb: string; emoji: string };

/** Board state → the answer shape the server verifies / hints against. */
function toAnswer(game: GameId, state: unknown, guess?: string) {
  if (game === "queens") return { queens: (state as QueensState).queens };
  if (game === "tango") return { grid: (state as TangoState).grid };
  if (game === "crossclimb") { const s = state as CrossclimbState; return { words: s.order.map((i) => s.answers[i]) }; }
  const s = state as PinpointState; return { guess: guess ?? s.guess, letters: s.letters ?? 0 };
}

export function GamePlay({ game, meta, level, initial, user }: { game: GameId; meta: Meta; level: number; initial: AttemptView | null; user: SessionUser }) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptView | null>(initial);
  const [state, setState] = useState<unknown>(() => (initial ? repair(game, initial.puzzle, initial.state) : null));
  const [result, setResult] = useState<Result | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const post = useCallback(<T,>(action: string, extra: Record<string, unknown> = {}) => api<T>("/api/gamification/brain/attempt", { method: "POST", json: { game, action, ...extra } }), [api, game]);

  async function start() {
    setBusy(true);
    const a = await post<AttemptView>("start");
    setBusy(false);
    if (a) { setAttempt(a); setState(repair(game, a.puzzle, a.state)); }
  }

  /** Autosave partial progress (debounced) so a reload resumes with the same clock. */
  function change(next: unknown) {
    setState(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => post("progress", { state: next }), 800);
  }

  /** Apply a change and pulse the affected cell for a moment. */
  function changeWithFlash(next: Record<string, unknown>, flash: string) {
    change({ ...next, flash });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setState((s: unknown) => (s && typeof s === "object" ? { ...(s as object), flash: undefined } : s)), 2200);
  }

  async function hint() {
    const r = await post<{ attempt: AttemptView; hint: unknown }>("hint", { state, answer: toAnswer(game, state) });
    if (!r) return;
    setAttempt(r.attempt);
    const h = r.hint as Record<string, number & string> | null;
    if (!h) return toast("Nothing left to hint. Press Verify.", "ok");
    if (game === "queens") {
      // Place the queen and mark every cell it rules out, so the hint teaches the logic, not just the answer.
      const s = state as QueensState; const p = attempt!.puzzle as QueensPublic; const { row, col } = h;
      const xs = new Set(s.xs.filter((k) => k !== `${row},${col}`));
      for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) {
        if (r === row && c === col) continue;
        if (r === row || c === col || p.regions[r][c] === p.regions[row][col] || (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1)) if (s.queens[r] !== c) xs.add(`${r},${c}`);
      }
      changeWithFlash({ ...s, queens: s.queens.map((q, i) => (i === row ? col : q)), xs: [...xs] }, `${row},${col}`);
    } else if (game === "tango") {
      const s = state as TangoState;
      changeWithFlash({ grid: s.grid.map((r, ri) => r.map((v, ci) => (ri === h.row && ci === h.col ? (h.value as unknown as 0 | 1) : v))) }, `${h.row},${h.col}`);
    } else if (game === "crossclimb") {
      const s = state as CrossclimbState;
      changeWithFlash({ ...s, answers: s.answers.map((a, i) => (i === h.clueIndex ? String(h.word) : a)) }, String(h.clueIndex));
    } else {
      changeWithFlash({ ...(state as PinpointState), letter: String(h.letter), letters: Number(h.letters) }, "letter");
    }
  }

  async function submit(guess?: string) {
    if (busy) return;
    const answer = toAnswer(game, state, guess);
    setBusy(true);
    const r = await post<Result>("submit", { answer });
    setBusy(false);
    if (!r) return;
    setAttempt(r.attempt);
    if (r.attempt.status === "IN_PROGRESS") {
      if (game === "pinpoint") { const s = state as PinpointState; change({ ...s, guesses: [...s.guesses, guess ?? s.guess], guess: "" }); }
      const left = 3 - r.attempt.mistakes;
      return toast(game === "pinpoint" ? `Not that. Another word revealed, ${left} guess${left === 1 ? "" : "es"} left.` : `Not quite yet. ${left} tr${left === 1 ? "y" : "ies"} left.`);
    }
    setResult(r); setReview(true); router.refresh();
  }

  async function giveUp() {
    if (!confirm("Give up on today's puzzle? You can review the solution but not retry until tomorrow.")) return;
    const r = await post<Result>("giveup", { state });
    if (r) { setAttempt(r.attempt); setResult(r); setReview(true); router.refresh(); }
  }

  if (!attempt) {
    return (
      <div className="card rise flex flex-col items-center gap-4 py-12 text-center">
        <span className="text-6xl">{meta.emoji}</span>
        <h1 className="text-2xl">{meta.name}</h1>
        <p className="max-w-md text-neutral-500">{meta.blurb}</p>
        <p className="text-xs text-neutral-400">One puzzle per day, same for your whole cohort. The clock starts when you press play.</p>
        <button type="button" className="btn-primary px-8 py-3" disabled={busy} onClick={start}>▶ Start today&apos;s puzzle</button>
      </div>
    );
  }

  const over = attempt.status !== "IN_PROGRESS";
  const sol = over ? attempt.solution : null;
  const p = attempt.puzzle;
  const canVerify = !over && !!state && (game === "queens" ? !!(state as QueensState).queens?.every((q) => q !== null)
    : game === "tango" ? !!(state as TangoState).grid?.every((r) => r?.every((v) => v !== null))
    : game === "crossclimb" ? !!(state as CrossclimbState).answers?.every((a) => a.length >= 3) : false);

  return (
    <div className="space-y-5">
      <GameHeader meta={meta} level={attempt.level ?? level} status={attempt.status} startedAt={attempt.startedAt} timeMs={attempt.timeMs} mistakes={attempt.mistakes} hints={attempt.hints} />
      <div className="card rise p-5">
        {over && <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-semibold ${attempt.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{attempt.status === "COMPLETED" ? "✓ Solved. This is the solution, with your time locked in on the leaderboard." : "Missed today. Study the solution and come back tomorrow."}</p>}
        {!!state && game === "queens" && <QueensBoard puzzle={p as QueensPublic} state={state as QueensState} solution={sol as { queens: number[] } | null} onChange={change} />}
        {!!state && game === "tango" && <TangoBoard puzzle={p as TangoPublic} state={state as TangoState} solution={sol as { grid: (0 | 1)[][] } | null} onChange={change} />}
        {!!state && game === "crossclimb" && <CrossclimbBoard puzzle={p as CrossclimbPublic} state={state as CrossclimbState} solution={sol as { words: string[]; order: number[] } | null} onChange={change} />}
        {!!state && game === "pinpoint" && <PinpointBoard puzzle={p as PinpointPublic} state={state as PinpointState} revealed={attempt.mistakes + 1} solution={sol as { category: string } | null} onChange={change} onGuess={(g) => submit(g)} />}

        {!over && !!state && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4">
            <div className="flex gap-2">
              <HintButton onHint={hint} hints={attempt.hints} />
              <button type="button" className="btn-ghost text-neutral-500" onClick={giveUp}>Give up</button>
            </div>
            {game !== "pinpoint" && (
              <button type="button" className="btn-primary px-6" disabled={busy || !canVerify} title={canVerify ? "" : "Fill the board first"} onClick={() => submit()}>✓ Verify</button>
            )}
          </div>
        )}
      </div>
      <ReviewModal open={review} onClose={() => setReview(false)} meta={meta} rank={null} result={result ? { status: result.attempt.status, timeMs: result.attempt.timeMs, mistakes: result.attempt.mistakes, hints: result.attempt.hints, xp: result.xp, levelChange: result.levelChange } : null} />
      <p className="text-center text-xs text-neutral-400">Playing as {user.name}. New puzzle at midnight, {user.timezone}.</p>
    </div>
  );
}
