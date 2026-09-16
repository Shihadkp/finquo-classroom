"use client";

// Interactive boards for the four games. Each is controlled: it renders `state`, calls `onChange` with the next state,
// and switches to a read-only "review" rendering when `solution` is present. `state.flash` pulses one cell after a hint.

import { useState } from "react";

const REGION_COLORS = ["#ede9fe", "#dcfce7", "#fef3c7", "#fee2e2", "#dbeafe", "#fce7f3", "#ccfbf1", "#ffedd5", "#e0e7ff", "#f3f4f6"];

// ─── Queens ──────────────────────────────────────────────────────────────────
export type QueensPublic = { n: number; regions: number[][] };
export type QueensState = { queens: (number | null)[]; xs: string[]; flash?: string };
export const emptyQueens = (n: number): QueensState => ({ queens: Array(n).fill(null), xs: [] });

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

export function QueensBoard({ puzzle, state, solution, onChange }: { puzzle: QueensPublic; state: QueensState; solution?: { queens: number[] } | null; onChange?: (s: QueensState) => void }) {
  const [tool, setTool] = useState<"cycle" | "queen" | "x">("cycle");
  const n = puzzle.n;
  const queens = solution ? solution.queens : state.queens;
  const bad = solution ? new Set<number>() : queensConflicts(puzzle, queens);
  const placed = queens.filter((q) => q !== null).length;

  function tap(r: number, c: number) {
    if (solution || !onChange) return;
    const key = `${r},${c}`;
    const isQ = state.queens[r] === c;
    const isX = state.xs.includes(key);
    const next: QueensState = { queens: [...state.queens], xs: state.xs.filter((k) => k !== key) };
    const setQ = () => { next.queens[r] = c; };
    const setX = () => { next.xs.push(key); if (isQ) next.queens[r] = null; };
    const clear = () => { if (isQ) next.queens[r] = null; };
    if (tool === "queen") isQ ? clear() : setQ();
    else if (tool === "x") isX ? clear() : setX();
    else isQ ? clear() : isX ? setQ() : setX(); // tap once → X, twice → queen, thrice → reset
    onChange(next);
  }

  return (
    <div>
      {!solution && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {([["cycle", "Tap to cycle"], ["queen", "👑 Crown tool"], ["x", "✕ Mark empty"]] as const).map(([t, l]) => (
            <button key={t} type="button" onClick={() => setTool(t)} className={`rounded-lg px-3 py-1.5 font-semibold transition ${tool === t ? "bg-accent text-white" : "bg-canvas text-neutral-600 hover:bg-accent-soft"}`}>{l}</button>
          ))}
          <span className="ml-auto rounded-lg bg-canvas px-2.5 py-1.5 font-semibold text-neutral-600">{placed} / {n} 👑 placed</span>
        </div>
      )}
      <div className="mx-auto grid aspect-square w-full max-w-md gap-0.5 rounded-xl border-2 border-neutral-300 bg-neutral-300 p-0.5 shadow-inner" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {puzzle.regions.flatMap((row, r) => row.map((reg, c) => {
          const key = `${r},${c}`;
          const isQ = queens[r] === c;
          const isX = !solution && state.xs.includes(key);
          return (
            <button key={key} type="button" onClick={() => tap(r, c)} aria-label={`row ${r + 1} col ${c + 1}`} disabled={!!solution}
              className={`flex items-center justify-center rounded-sm text-xl transition hover:brightness-95 ${isQ && bad.has(r) ? "ring-2 ring-inset ring-red-500" : ""} ${state.flash === key ? "flash" : ""}`} style={{ background: REGION_COLORS[reg % REGION_COLORS.length] }}>
              {isQ ? <span className="pop">👑</span> : isX ? <span className="text-sm text-neutral-500">✕</span> : ""}
            </button>
          );
        }))}
      </div>
      {!solution && <p className="mt-3 text-center text-xs text-neutral-400">One 👑 in every row, column and colour region. Crowns can&apos;t touch, not even diagonally. Red ring = conflict.</p>}
    </div>
  );
}

// ─── Tango ───────────────────────────────────────────────────────────────────
export type TangoPublic = { n: number; givens: (0 | 1 | null)[][]; constraints: { a: [number, number]; b: [number, number]; kind: "eq" | "x" }[] };
export type TangoState = { grid: (0 | 1 | null)[][]; flash?: string };
export const emptyTango = (p: TangoPublic): TangoState => ({ grid: p.givens.map((r) => [...r]) });

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

export function TangoBoard({ puzzle, state, solution, onChange }: { puzzle: TangoPublic; state: TangoState; solution?: { grid: (0 | 1)[][] } | null; onChange?: (s: TangoState) => void }) {
  const n = puzzle.n;
  const grid = solution ? solution.grid : state.grid;
  const bad = solution ? new Set<string>() : tangoConflicts(grid);
  const filled = grid.flat().filter((v) => v !== null).length;
  function tap(r: number, c: number) {
    if (solution || !onChange || puzzle.givens[r][c] !== null) return;
    const next = state.grid.map((row) => [...row]);
    next[r][c] = next[r][c] === null ? 0 : next[r][c] === 0 ? 1 : null;
    onChange({ grid: next });
  }
  return (
    <div>
      {!solution && <div className="mb-3 flex items-center justify-between text-xs"><span className="text-neutral-400">Tap: empty → ☀️ → 🌙 → empty. Greyed cells are given.</span><span className="rounded-lg bg-canvas px-2.5 py-1.5 font-semibold text-neutral-600">{filled} / {n * n} filled</span></div>}
      <div className="relative mx-auto aspect-square w-full max-w-sm">
        <div className="grid h-full w-full gap-0.5 rounded-xl border-2 border-neutral-300 bg-neutral-300 p-0.5 shadow-inner" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {grid.flatMap((row, r) => row.map((v, c) => {
            const key = `${r},${c}`;
            const given = puzzle.givens[r][c] !== null;
            return (
              <button key={key} type="button" onClick={() => tap(r, c)} disabled={given || !!solution} aria-label={`row ${r + 1} col ${c + 1}`}
                className={`flex items-center justify-center rounded-sm text-xl transition ${given ? "bg-neutral-100" : "bg-white hover:bg-accent-soft"} ${bad.has(key) ? "ring-2 ring-inset ring-red-400" : ""} ${state.flash === key ? "flash" : ""}`}>
                {v === 0 ? <span className="pop">☀️</span> : v === 1 ? <span className="pop">🌙</span> : ""}
              </button>
            );
          }))}
        </div>
        {puzzle.constraints.map((k, i) => {
          const left = ((k.a[1] + k.b[1]) / 2 + 0.5) / n * 100, top = ((k.a[0] + k.b[0]) / 2 + 0.5) / n * 100;
          return <span key={i} className="pointer-events-none absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-300 bg-white text-[11px] font-bold text-neutral-700 shadow-sm" style={{ left: `${left}%`, top: `${top}%` }}>{k.kind === "eq" ? "=" : "✕"}</span>;
        })}
      </div>
      {!solution && <p className="mt-3 text-center text-xs text-neutral-400">Three ☀️ and three 🌙 per row and column, never three alike in a row. = means same, ✕ means different.</p>}
    </div>
  );
}

// ─── Crossclimb ──────────────────────────────────────────────────────────────
export type CrossclimbPublic = { clues: string[] };
export type CrossclimbState = { answers: string[]; order: number[]; flash?: string };
export const emptyCrossclimb = (p: CrossclimbPublic): CrossclimbState => ({ answers: p.clues.map(() => ""), order: p.clues.map((_, i) => i) });

const oneLetterApart = (a: string, b: string) => a.length === b.length && a.length > 0 && [...a].filter((ch, i) => ch !== b[i]).length === 1;

export function CrossclimbBoard({ puzzle, state, solution, onChange }: { puzzle: CrossclimbPublic; state: CrossclimbState; solution?: { words: string[]; order: number[] } | null; onChange?: (s: CrossclimbState) => void }) {
  // Tolerate a state saved by an older build: never assume the arrays are there.
  const answers = state?.answers ?? puzzle.clues.map(() => "");
  const order = state?.order?.length === puzzle.clues.length ? state.order : puzzle.clues.map((_, i) => i);
  state = { ...state, answers, order };
  const filled = answers.every((a) => a.length >= 3);
  const move = (pos: number, dir: -1 | 1) => {
    if (!onChange) return;
    const order = [...state.order]; const j = pos + dir;
    if (j < 0 || j >= order.length) return;
    [order[pos], order[j]] = [order[j], order[pos]];
    onChange({ ...state, order });
  };
  if (solution) {
    return (
      <ol className="mx-auto max-w-md space-y-2">
        {solution.words.map((w, i) => <li key={i} className="rise flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-2.5"><span className="font-mono text-xs text-neutral-400">{i + 1}</span><span className="font-mono text-lg font-bold uppercase tracking-widest">{w}</span><span className="text-sm text-neutral-500">{puzzle.clues[solution.order[i]]}</span></li>)}
      </ol>
    );
  }
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <p className="mb-2 text-xs text-neutral-400">Step 1 · Answer each clue with a four-letter word.</p>
        <ul className="space-y-2">
          {puzzle.clues.map((clue, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{clue}</span>
              <input value={state.answers[i]} maxLength={4} onChange={(e) => onChange?.({ ...state, answers: state.answers.map((a, j) => (j === i ? e.target.value.toLowerCase().replace(/[^a-z]/g, "") : a)) })}
                className={`input w-28 text-center font-mono text-base font-bold uppercase tracking-widest ${state.flash === String(i) ? "flash" : ""}`} placeholder="····" aria-label={`answer ${i + 1}`} />
            </li>
          ))}
        </ul>
      </div>
      <div className={`transition ${filled ? "" : "opacity-40"}`}>
        <p className="mb-2 text-xs text-neutral-400">Step 2 · Order them into a ladder: each word changes exactly one letter from the last. Green links are valid.</p>
        <ol className="space-y-1.5">
          {state.order.map((idx, pos) => {
            const w = state.answers[idx], prev = pos > 0 ? state.answers[state.order[pos - 1]] : null;
            const ok = prev !== null && oneLetterApart(prev, w);
            return (
              <li key={idx} className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2">
                <span className={`w-5 text-center text-xs ${pos === 0 ? "text-neutral-300" : ok ? "text-emerald-600" : "text-red-400"}`}>{pos === 0 ? "·" : ok ? "✓" : "✕"}</span>
                <span className="flex-1 font-mono text-base font-bold uppercase tracking-widest">{w || "····"}</span>
                <button type="button" disabled={!filled} onClick={() => move(pos, -1)} className="btn-ghost px-2 py-1 text-xs" aria-label="Move up">↑</button>
                <button type="button" disabled={!filled} onClick={() => move(pos, 1)} className="btn-ghost px-2 py-1 text-xs" aria-label="Move down">↓</button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ─── Pinpoint ────────────────────────────────────────────────────────────────
export type PinpointPublic = { words: string[] };
export type PinpointState = { guesses: string[]; guess: string; letter?: string; letters?: number; flash?: string };
export const emptyPinpoint = (): PinpointState => ({ guesses: [], guess: "" });

export function PinpointBoard({ puzzle, state, revealed, solution, onChange, onGuess }: { puzzle: PinpointPublic; revealed: number; state: PinpointState; solution?: { category: string } | null; onChange?: (s: PinpointState) => void; onGuess?: (guess: string) => void }) {
  const shown = solution ? puzzle.words.length : Math.min(puzzle.words.length, revealed);
  return (
    <div className="mx-auto max-w-md space-y-5">
      <ol className="grid gap-2">
        {puzzle.words.map((w, i) => (
          <li key={i} className={`rounded-xl px-4 py-3 text-center text-lg font-bold transition ${i < shown ? "rise bg-accent-soft text-accent" : "bg-canvas text-neutral-300"}`}>{i < shown ? w : "?"}</li>
        ))}
      </ol>
      {solution ? (
        <p className="rise rounded-xl bg-emerald-50 px-4 py-3 text-center font-semibold text-emerald-700">Category: {solution.category}</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (state.guess.trim()) onGuess?.(state.guess.trim()); }} className="space-y-2">
          <p className="text-xs text-neutral-400">What do these have in common? A wrong guess reveals the next word. Fewer words seen = higher rank.</p>
          {state.letter && (
            <p className={`rounded-xl bg-amber-50 px-3 py-2 font-mono text-sm font-bold tracking-[0.3em] text-amber-800 ${state.flash === "letter" ? "flash" : ""}`}>
              {state.letter.toUpperCase()}{"_".repeat(Math.max(0, 12 - state.letter.length))}<span className="ml-2 font-sans text-xs font-normal tracking-normal text-amber-700">hint: each hint reveals one more letter</span>
            </p>
          )}
          <div className="flex gap-2">
            <input value={state.guess} onChange={(e) => onChange?.({ ...state, guess: e.target.value })} className="input" placeholder="e.g. Types of cheese" aria-label="Your guess" autoFocus />
            <button type="submit" className="btn-primary" disabled={!state.guess.trim()}>Guess</button>
          </div>
          {state.guesses.length > 0 && <p className="text-xs text-neutral-500">Tried: {state.guesses.join(" · ")}</p>}
        </form>
      )}
    </div>
  );
}
