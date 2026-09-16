"use client";

// Aria Live building blocks: VoiceOrb, Waveform, TranscriptPanel (AIMessage / UserMessage), FeedbackSidebar,
// PronunciationCard, VocabularyCard, FluencyChart, SessionSummary.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COACH, type Feedback, type Summary, type Turn } from "@/lib/gamification/aria";
import { Modal } from "@/components/Modal";
import { Avatar, Empty } from "@/components/ui";

export type OrbStatus = "idle" | "listening" | "thinking" | "speaking";

/** The owl. Falls back to an emoji until public/quo.png exists. */
export function Mascot({ className = "size-10" }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className={`inline-flex items-center justify-center rounded-full bg-accent-soft text-[60%] ${className}`} aria-label={COACH.name}>🦉</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={COACH.image} alt={COACH.name} onError={() => setMissing(true)} className={`object-contain ${className}`} draggable={false} />;
}

export function VoiceOrb({ status, level }: { status: OrbStatus; level: number }) {
  const scale = 1 + (status === "listening" ? level * 0.35 : status === "speaking" ? 0.12 : 0);
  const LABEL: Record<OrbStatus, string> = { idle: "Tap or hold space to talk", listening: "Listening", thinking: "Thinking", speaking: `${COACH.name} is speaking` };
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative flex size-44 items-center justify-center">
        <span className={`absolute inset-0 rounded-full bg-accent/10 transition-transform duration-150 ${status === "speaking" ? "animate-ping" : ""}`} style={{ transform: `scale(${scale * 1.15})` }} />
        <span className="absolute inset-3 rounded-full bg-accent/15 transition-transform duration-150" style={{ transform: `scale(${scale})` }} />
        <span className={`relative flex size-28 items-center justify-center rounded-full border-4 bg-white shadow-lg ${status === "listening" ? "border-emerald-400" : status === "speaking" ? "border-accent" : status === "thinking" ? "border-amber-400" : "border-neutral-200"}`}>
          {status === "thinking" ? <span className="size-6 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" /> : <Mascot className={`size-20 transition ${status === "speaking" ? "animate-[pop_0.6s_ease-in-out_infinite_alternate]" : ""}`} />}
        </span>
      </div>
      <p className="eyebrow">{LABEL[status]}</p>
    </div>
  );
}

/** Live mic bars from an AnalyserNode; idle bars when nothing is coming in. */
export function Waveform({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let raf = 0;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const bars = 32, gap = 3, w = (width - gap * (bars - 1)) / bars;
      if (analyser && data && active) analyser.getByteFrequencyData(data);
      for (let i = 0; i < bars; i++) {
        const v = analyser && data && active ? data[Math.floor((i / bars) * data.length * 0.5)] / 255 : 0.08;
        const h = Math.max(3, v * height);
        ctx.fillStyle = active ? "#3f37c9" : "#c7c9d9";
        ctx.beginPath(); ctx.roundRect(i * (w + gap), (height - h) / 2, w, h, 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return <canvas ref={ref} width={320} height={48} className="h-12 w-full max-w-xs" aria-hidden />;
}

export function AIMessage({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Mascot className="size-8 shrink-0" />
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-canvas px-4 py-2.5 text-sm leading-relaxed">{text}{streaming && <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-accent align-middle" />}</div>
    </div>
  );
}

export function UserMessage({ text, name, interim }: { text: string; name: string; interim?: boolean }) {
  return (
    <div className="flex flex-row-reverse items-start gap-3">
      <Avatar name={name} className="size-8 text-[10px]" />
      <div className={`max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed ${interim ? "bg-accent/60 italic text-white" : "bg-accent text-white"}`}>{text}</div>
    </div>
  );
}

export function TranscriptPanel({ turns, partial, streaming, name }: { turns: Turn[]; partial: string; streaming: string; name: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [turns.length, partial, streaming]);
  return (
    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
      {turns.map((t, i) => (t.role === "assistant" ? <AIMessage key={i} text={t.text} /> : <UserMessage key={i} text={t.text} name={name} />))}
      {partial && <UserMessage text={partial} name={name} interim />}
      {streaming && <AIMessage text={streaming} streaming />}
      <div ref={end} />
    </div>
  );
}

export function PronunciationCard({ drill, onRepeat }: { drill: Feedback["drills"][number]; onRepeat: (text: string) => void }) {
  return (
    <div className="rounded-xl border border-neutral-100 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-bold">{drill.word}</p>
        <button type="button" onClick={() => onRepeat(drill.sentence)} className="btn-ghost px-2.5 py-1 text-xs">🔊 Repeat</button>
      </div>
      <p className="font-mono text-sm text-accent">{drill.ipa}</p>
      <p className="text-xs text-neutral-500">Stress: {drill.stress} · {drill.syllables}</p>
      <p className="mt-1.5 text-sm italic">“{drill.sentence}”</p>
    </div>
  );
}

export function VocabularyCard({ vocabulary }: { vocabulary: NonNullable<Feedback["vocabulary"]> }) {
  return (
    <div className="rounded-xl bg-canvas p-3 text-sm">
      <p className="eyebrow">Vocabulary upgrade</p>
      <p className="mt-1 text-neutral-500 line-through">{vocabulary.used}</p>
      <p className="font-semibold text-emerald-700">{vocabulary.better}</p>
    </div>
  );
}

export function FeedbackSidebar({ feedback, count, onRepeat }: { feedback: Feedback | null; count: number; onRepeat: (text: string) => void }) {
  if (!feedback) return <Empty>Coaching notes appear here after you speak. {COACH.name} never reads them out loud.</Empty>;
  const pace = feedback.pace >= 130 && feedback.pace <= 160 ? "Optimal" : feedback.pace < 130 ? "A little slow" : "A little fast";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-center">
        {[[feedback.fluency, "Fluency"], [feedback.confidence, "Confidence"], [`${feedback.pace} wpm`, pace], [feedback.fillerWords, "Fillers"]].map(([v, l]) => (
          <div key={String(l)} className="rounded-xl bg-canvas py-2"><p className="text-lg font-bold">{v}</p><p className="eyebrow">{l}</p></div>
        ))}
      </div>
      {feedback.grammar.length > 0 && (
        <div>
          <p className="eyebrow mb-1.5">Grammar</p>
          <ul className="space-y-1 text-sm">{feedback.grammar.map((g, i) => <li key={i}><span className="text-red-500 line-through">{g.wrong}</span> → <span className="font-semibold text-emerald-700">{g.correct}</span></li>)}</ul>
        </div>
      )}
      {feedback.vocabulary && <VocabularyCard vocabulary={feedback.vocabulary} />}
      {feedback.drills.length > 0 && (
        <div>
          <p className="eyebrow mb-1.5">Pronunciation drills</p>
          <div className="space-y-2">{feedback.drills.map((d, i) => <PronunciationCard key={i} drill={d} onRepeat={onRepeat} />)}</div>
        </div>
      )}
      <p className="text-xs text-neutral-400">Notes from exchange {count}.</p>
    </div>
  );
}

/** 30-day fluency: one series, 2px line, ≥8px markers, hover tooltip, no legend (title names the series). */
export function FluencyChart({ series }: { series: { date: string; fluency: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0) return <Empty>Finish a session to start your 30-day fluency line.</Empty>;
  const W = 600, H = 180, PAD = { l: 34, r: 12, t: 12, b: 26 };
  const x = (i: number) => PAD.l + (series.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (series.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.fluency)}`).join(" ");
  const h = hover !== null ? series[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Fluency score over the last 30 days">
        {[0, 50, 100].map((v) => <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeDasharray={v ? "2 4" : undefined} /><text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{v}</text></g>)}
        <path d={path} fill="none" stroke="#3f37c9" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(i)} cy={y(p.fluency)} r="12" fill="transparent" />
            <circle cx={x(i)} cy={y(p.fluency)} r={hover === i ? 5 : 4} fill="#3f37c9" stroke="#fff" strokeWidth="2" />
          </g>
        ))}
        <text x={PAD.l} y={H - 8} fontSize="11" fill="#6b7280">{series[0].date}</text>
        <text x={W - PAD.r} y={H - 8} fontSize="11" fill="#6b7280" textAnchor="end">{series[series.length - 1].date}</text>
      </svg>
      {h && <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg bg-neutral-900 px-2.5 py-1 text-xs text-white">{h.date} · fluency {h.fluency}</div>}
    </div>
  );
}

export function SessionSummary({ open, onClose, summary, fluency, xp, xpParts }: { open: boolean; onClose: () => void; summary: Summary | null; fluency: number | null; xp: number; xpParts: { source: string; amount: number }[] }) {
  return (
    <Modal open={open} onClose={onClose} title="Session complete" subtitle={summary?.headline ?? "Nice work showing up."} className="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-canvas py-3"><p className="text-2xl font-bold">{fluency ?? "—"}</p><p className="eyebrow">Fluency</p></div>
          <div className="rounded-xl bg-canvas py-3"><p className="text-2xl font-bold text-accent">+{xp}</p><p className="eyebrow">XP{xpParts.some((p) => p.source === "mission") ? " · mission done" : ""}</p></div>
        </div>
        {summary && (
          <>
            {summary.strengths.length > 0 && <div><p className="eyebrow mb-1">Strengths</p><ul className="list-disc pl-5 text-sm">{summary.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
            {summary.focus.length > 0 && <div><p className="eyebrow mb-1">Focus next</p><ul className="list-disc pl-5 text-sm">{summary.focus.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
            {summary.vocabulary.length > 0 && <div><p className="eyebrow mb-1">New vocabulary</p><p className="flex flex-wrap gap-1.5">{summary.vocabulary.map((v, i) => <span key={i} className="pill bg-accent-soft text-accent">{v}</span>)}</p></div>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Link href="/gamification/speaking/history" className="btn-ghost">History</Link>
          <Link href="/gamification/speaking" className="btn-primary">Practice again</Link>
        </div>
      </div>
    </Modal>
  );
}
