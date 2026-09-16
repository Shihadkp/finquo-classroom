"use client";

// Aria Live session: browser speech recognition (hold-to-talk or auto VAD) → SSE reply stream → sentence-by-sentence TTS.
// The student can interrupt at any moment: holding to talk or pressing Interrupt cancels Aria's voice and aborts the stream.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { COACH, MODES, type Feedback, type ModeId, type Summary, type Turn } from "@/lib/gamification/aria";
import { fmtClock } from "@/lib/time";
import { useApi, useToast } from "@/components/Toast";
import { Panel } from "@/components/ui";
import { FeedbackSidebar, SessionSummary, TranscriptPanel, VoiceOrb, Waveform, type OrbStatus } from "./aria";

type Session = { id: string; mode: ModeId; scenario: string; missionDate: string | null; turns: Turn[] };
type Rec = { start(): void; stop(): void; abort(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type RecCtor = new () => Rec;
const recognitionCtor = (): RecCtor | null => (typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition ?? null));

const VOICE_KEY = "aria.voiceURI";
const RATE_KEY = "aria.rate";
const LANG_KEY = "aria.lang";

/**
 * Accent the recogniser listens for. Using en-US for an Indian-English speaker garbles words
 * badly, so the default comes from the learner's timezone rather than being hardcoded.
 */
const LANGS = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-CA", label: "English (Canada)" },
  { code: "en-SG", label: "English (Singapore)" },
  { code: "en-ZA", label: "English (South Africa)" },
  { code: "en-NG", label: "English (Nigeria)" },
  { code: "en-PH", label: "English (Philippines)" },
  { code: "en-IE", label: "English (Ireland)" },
];

const TZ_LANG: Record<string, string> = {
  "Asia/Kolkata": "en-IN", "Asia/Calcutta": "en-IN", "Asia/Colombo": "en-IN", "Asia/Karachi": "en-IN",
  "Asia/Dhaka": "en-IN", "Asia/Kathmandu": "en-IN", "Asia/Dubai": "en-IN", "Asia/Qatar": "en-IN",
  "Europe/London": "en-GB", "Europe/Dublin": "en-IE", "Australia/Sydney": "en-AU", "Australia/Melbourne": "en-AU",
  "Asia/Singapore": "en-SG", "Africa/Johannesburg": "en-ZA", "Africa/Lagos": "en-NG", "Asia/Manila": "en-PH",
};
const defaultLang = (tz: string) => TZ_LANG[tz] ?? (tz.startsWith("Asia/") ? "en-IN" : tz.startsWith("Europe/") ? "en-GB" : "en-US");
const PREFERRED = /Google US English|Microsoft Aria|Microsoft Jenny|Samantha|Google UK English Female|Microsoft Zira/i;

/** Voices arrive asynchronously in Chrome; resolve once the list is non-empty (or after a short timeout). */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const s = window.speechSynthesis;
    if (!s) return resolve([]);
    const got = s.getVoices();
    if (got.length) return resolve(got);
    const t = setTimeout(() => resolve(s.getVoices()), 1500);
    s.onvoiceschanged = () => { clearTimeout(t); resolve(s.getVoices()); };
  });
}

export function AriaSession({ user, mode, scenario, mission }: { user: SessionUser; mode?: ModeId; scenario?: string; mission?: boolean }) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<OrbStatus>("idle");
  const statusRef = useRef<OrbStatus>("idle");
  useEffect(() => { statusRef.current = status; }, [status]);
  const levelRef = useRef(0);
  const [partial, setPartial] = useState("");
  const [streaming, setStreaming] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [count, setCount] = useState(0);
  const [vad, setVad] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [lang, setLang] = useState(() => defaultLang(user.timezone));
  const [level, setLevel] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [ended, setEnded] = useState<{ summary: Summary | null; fluency: number | null; xp: number; xpParts: { source: string; amount: number }[] } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const supported = !!recognitionCtor();

  const rec = useRef<Rec | null>(null);
  const abort = useRef<AbortController | null>(null);
  const utterances = useRef<SpeechSynthesisUtterance[]>([]); // held so Chrome can't garbage-collect them mid-sentence
  const spokenUpTo = useRef(0);
  const talkStart = useRef(0);
  const listening = useRef(false);
  const vadRef = useRef(false);
  const started = useRef(Date.now());
  const sessionRef = useRef<Session | null>(null);
  const finalText = useRef("");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const rateRef = useRef(1);
  const endedRef = useRef(false);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef(defaultLang(user.timezone));

  // ── Voice out ──────────────────────────────────────────────────────────────
  // Chrome occasionally ignores a lone cancel() while utterances are still queued; a second call a beat later is reliable.
  const stopVoice = useCallback(() => { utterances.current = []; const s = window.speechSynthesis; s?.cancel(); setTimeout(() => s?.cancel(), 60); }, []);

  const speak = useCallback((text: string) => {
    const s = window.speechSynthesis;
    if (!text.trim() || !s) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rateRef.current; u.lang = voiceRef.current?.lang ?? "en-US";
    if (voiceRef.current) u.voice = voiceRef.current;
    u.onstart = () => setStatus((st) => (st === "listening" ? st : "speaking"));
    u.onend = u.onerror = () => {
      utterances.current = utterances.current.filter((x) => x !== u);
      if (!s.speaking && !s.pending) setStatus((st) => (st === "speaking" ? "idle" : st));
    };
    utterances.current.push(u);
    s.speak(u);
  }, []);

  /** Speak complete sentences as soon as they arrive, so the voice starts before the reply is finished. */
  const speakNewSentences = useCallback((full: string, flush = false) => {
    const rest = full.slice(spokenUpTo.current);
    const m = flush ? [rest] : rest.match(/[^.!?]*[.!?]+["')\]]?(\s+|$)/g);
    if (!m) return;
    for (const piece of m) { if (piece.trim()) speak(piece.trim()); spokenUpTo.current += piece.length; }
  }, [speak]);

  const voiceBusy = () => { const s = window.speechSynthesis; return !!s && (s.speaking || s.pending); };

  // Load voices once; restore the saved choice or pick a sensible English default.
  useEffect(() => {
    let alive = true;
    loadVoices().then((all) => {
      if (!alive) return;
      const en = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
      const list = en.length ? en : all;
      setVoices(list);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(VOICE_KEY);
        const r = Number(localStorage.getItem(RATE_KEY)); if (r) { setRate(r); rateRef.current = r; }
        const l = localStorage.getItem(LANG_KEY); if (l) { setLang(l); langRef.current = l; }
      } catch { /* storage unavailable */ }
      const want = (() => { try { return localStorage.getItem(LANG_KEY) ?? defaultLang(user.timezone); } catch { return defaultLang(user.timezone); } })();
      const pick = list.find((v) => v.voiceURI === saved)
        ?? list.find((v) => v.lang.replace("_", "-") === want)
        ?? list.find((v) => PREFERRED.test(v.name)) ?? list[0] ?? null;
      voiceRef.current = pick; setVoiceURI(pick?.voiceURI ?? "");
    });
    // Chrome silently pauses long speech after ~15s; nudging resume keeps it going.
    const keepAlive = setInterval(() => { const s = window.speechSynthesis; if (s?.speaking && !s.paused) { s.pause(); s.resume(); } }, 10_000);
    return () => { alive = false; clearInterval(keepAlive); };
  }, []);

  function chooseVoice(uri: string) {
    const v = voices.find((x) => x.voiceURI === uri) ?? null;
    voiceRef.current = v; setVoiceURI(uri);
    try { localStorage.setItem(VOICE_KEY, uri); } catch { /* ignore */ }
    stopVoice(); speak(`Hi, I'm ${COACH.name}. This is how I'll sound.`);
  }
  function chooseLang(code: string) {
    setLang(code); langRef.current = code;
    try { localStorage.setItem(LANG_KEY, code); } catch { /* ignore */ }
    // Re-open the mic so the new accent takes effect immediately.
    if (listening.current) { rec.current?.abort(); listening.current = false; setTimeout(() => startListening(false), 150); }
    toast(`Listening for ${LANGS.find((l) => l.code === code)?.label ?? code}.`, "ok");
  }
  function chooseRate(r: number) {
    setRate(r); rateRef.current = r;
    try { localStorage.setItem(RATE_KEY, String(r)); } catch { /* ignore */ }
  }

  // Start the session once voices are ready, then speak the opener with the chosen voice.
  useEffect(() => {
    let alive = true;
    Promise.all([
      api<Session>("/api/gamification/speaking/start", { method: "POST", json: mission ? { mission: true } : { mode, scenario } }),
      loadVoices(),
    ]).then(([s]) => {
      if (!alive) return;
      if (!s) return router.push("/gamification/speaking");
      setSession(s); sessionRef.current = s; setTurns(s.turns);
      speak(s.turns[0].text);
    });
    return () => { alive = false; stopVoice(); rec.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { const t = setInterval(() => setElapsed(Date.now() - started.current), 1000); return () => clearInterval(t); }, []);

  // Mic level meter for the orb and waveform.
  useEffect(() => {
    let ctx: AudioContext | null = null, raf = 0, stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => {
      stream = s; ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(s); const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an); setAnalyser(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => { an.getByteFrequencyData(data); const v = data.reduce((a, b) => a + b, 0) / data.length / 128; levelRef.current = v; setLevel(v); raf = requestAnimationFrame(tick); };
      tick();
    }).catch(() => toast(`Microphone access is needed for ${COACH.name}.`));
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ctx?.close(); };
  }, [toast]);

  // ── Voice in ───────────────────────────────────────────────────────────────
  const interrupt = useCallback(() => { stopVoice(); abort.current?.abort(); setStreaming(""); setStatus("idle"); }, [stopVoice]);

  const startListening = useCallback((cutAria = true) => {
    const Ctor = recognitionCtor();
    if (!Ctor || listening.current || !sessionRef.current || endedRef.current) return;
    if (cutAria) interrupt();
    const r = new Ctor();
    r.lang = langRef.current; r.interimResults = true; r.continuous = true;
    finalText.current = ""; talkStart.current = Date.now();
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText.current += t + " "; else interim += t;
      }
      const heard = (finalText.current + interim).trim();
      setPartial(heard);
      if (!vadRef.current || !heard) return;
      // Stop after a short pause rather than waiting for Chrome to finalise, which can take seconds.
      // Interim text is kept as the utterance if the pause arrives first.
      if (silence.current) clearTimeout(silence.current);
      silence.current = setTimeout(() => {
        if (!finalText.current.trim() && interim) finalText.current = interim;
        r.stop();
      }, 900);
    };
    r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") toast(`Mic error: ${e.error}`); };
    r.onend = () => {
      listening.current = false;
      if (silence.current) { clearTimeout(silence.current); silence.current = null; }
      const text = finalText.current.trim();
      setPartial("");
      if (text) void send(text, (Date.now() - talkStart.current) / 1000);
      else if (vadRef.current && !abort.current) setTimeout(() => startListening(false), 250);
      else setStatus("idle");
    };
    r.start(); rec.current = r; listening.current = true; setStatus("listening");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupt, toast]);

  const stopListening = () => { if (silence.current) { clearTimeout(silence.current); silence.current = null; } rec.current?.stop(); };

  /** Auto mode: open the mic only once Aria has finished talking, so she doesn't hear herself. */
  const listenAfterVoice = useCallback(() => {
    const tick = () => {
      if (!vadRef.current || endedRef.current) return;
      if (voiceBusy()) return void setTimeout(tick, 200);
      startListening(false);
    };
    setTimeout(tick, 200);
  }, [startListening]);

  // Hold spacebar to talk (when not typing in an input).
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); startListening(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && !vadRef.current) { e.preventDefault(); stopListening(); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [startListening]);

  useEffect(() => { vadRef.current = vad; if (vad) listenAfterVoice(); else rec.current?.stop(); }, [vad, listenAfterVoice]);

  // Barge-in (auto mode): while Quo speaks, watch the mic. The first half-second sets a baseline for speaker bleed;
  // a voice clearly above it for ~300ms cuts her off and opens the mic. ponytail: level heuristic, swap for a real VAD if echo is bad.
  useEffect(() => {
    let baseline = 0, samples = 0, hot = 0, speakingSince = 0;
    const t = setInterval(() => {
      if (!vadRef.current || statusRef.current !== "speaking" || listening.current) { baseline = 0; samples = 0; hot = 0; speakingSince = 0; return; }
      const v = levelRef.current;
      if (!speakingSince) speakingSince = Date.now();
      if (Date.now() - speakingSince < 600) { baseline = Math.max(baseline, v); samples++; return; }
      const threshold = Math.max(0.14, baseline * 2.2);
      hot = v > threshold ? hot + 1 : 0;
      if (hot >= 3) { hot = 0; interrupt(); startListening(false); }
    }, 100);
    return () => clearInterval(t);
  }, [interrupt, startListening]);

  // ── One exchange ───────────────────────────────────────────────────────────
  async function send(text: string, seconds: number) {
    const s = sessionRef.current; if (!s) return;
    const userTurn: Turn = { role: "user", text, at: new Date().toISOString() };
    setTurns((t) => [...t, userTurn]);
    setStatus("thinking"); setStreaming(""); spokenUpTo.current = 0;
    const ac = new AbortController(); abort.current = ac;
    let full = "";
    try {
      const res = await fetch("/api/gamification/speaking/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: s.id, text, seconds }), signal: ac.signal });
      if (!res.ok || !res.body) { const b = await res.json().catch(() => null); throw new Error(b?.message ?? `${COACH.name} is unavailable.`); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n"); buf = events.pop() ?? "";
        for (const ev of events) {
          const type = /^event: (.+)$/m.exec(ev)?.[1]; const data = JSON.parse(/^data: (.+)$/m.exec(ev)?.[1] ?? "{}");
          if (type === "delta") { full += data.text; setStreaming(full); speakNewSentences(full); }
          else if (type === "reply") { speakNewSentences(full, true); setStreaming(""); if (full.trim()) setTurns((t) => [...t, { role: "assistant", text: full.trim(), at: new Date().toISOString() }]); }
          else if (type === "feedback") { setFeedback(data.feedback); setCount(data.exchangeNo); }
          else if (type === "error") toast(data.message);
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) { toast(e instanceof Error ? e.message : `${COACH.name} is unavailable.`); setStatus("idle"); }
    } finally {
      if (abort.current === ac) abort.current = null;
      if (vadRef.current && !listening.current) listenAfterVoice();
    }
  }

  async function end() {
    endedRef.current = true;
    interrupt(); rec.current?.abort(); setVad(false);
    const s = sessionRef.current; if (!s) return;
    const r = await api<{ summary: Summary | null; fluency: number | null; xp: number; xpParts?: { source: string; amount: number }[] }>("/api/gamification/speaking/end", { method: "POST", json: { sessionId: s.id } });
    if (r) { setEnded({ summary: r.summary, fluency: r.fluency, xp: r.xp, xpParts: r.xpParts ?? [] }); router.refresh(); }
  }

  const missionLimit = 5 * 60_000;
  useEffect(() => { if (session?.missionDate && elapsed >= missionLimit && !ended) void end(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [elapsed]);

  const modeName = session ? MODES[session.mode].name : "";
  const scenarioTitle = session ? MODES[session.mode].scenarios.find((x) => x.id === session.scenario)?.title : "";
  const voiceLabel = (v: SpeechSynthesisVoice) => `${v.name.replace(/^Microsoft |^Google /, "")} · ${v.lang}${v.localService ? "" : " · online"}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-accent">{session?.missionDate ? "Daily mission" : modeName}</p>
              <h1 className="text-xl">{session ? scenarioTitle : `Connecting to ${COACH.name}…`}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-xl bg-canvas px-3 py-1.5 font-mono font-semibold">{session?.missionDate ? `${fmtClock(Math.max(0, missionLimit - elapsed))} left` : fmtClock(elapsed)}</span>
              <select value={lang} onChange={(e) => chooseLang(e.target.value)} className="input w-auto py-1.5 text-xs" aria-label="Your accent" title="The accent the microphone listens for — pick yours for accurate transcription">
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <select value={voiceURI} onChange={(e) => chooseVoice(e.target.value)} className="input w-auto max-w-56 py-1.5 text-xs" aria-label={`${COACH.name}'s voice`} title={`${COACH.name}'s voice (saved on this device)`}>
                {voices.length === 0 && <option value="">Loading voices…</option>}
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{voiceLabel(v)}</option>)}
              </select>
              {[0.9, 1, 1.2].map((r) => <button key={r} type="button" onClick={() => chooseRate(r)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${rate === r ? "bg-accent text-white" : "bg-canvas text-neutral-600"}`}>{r}x</button>)}
              <button type="button" onClick={interrupt} className="btn-ghost px-3 py-1.5 text-xs text-red-600">■ Interrupt</button>
            </div>
          </div>
          <VoiceOrb status={status} level={level} />
          <div className="flex justify-center"><Waveform analyser={analyser} active={status === "listening"} /></div>
          {!supported && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-center text-sm text-amber-700">Your browser has no speech recognition. Use Chrome or Edge for {COACH.product}.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button type="button" disabled={!session || !supported || vad}
              onPointerDown={(e) => { e.preventDefault(); startListening(true); }} onPointerUp={stopListening} onPointerLeave={() => listening.current && !vad && stopListening()}
              className={`btn-primary select-none px-8 py-3 ${status === "listening" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>🎙 {status === "listening" ? "Release to send" : "Hold to talk (or Space)"}</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vad} onChange={(e) => setVad(e.target.checked)} disabled={!session || !supported} /> Auto voice detection</label>
            <button type="button" onClick={end} disabled={!session || !!ended} className="btn-ghost">End session</button>
          </div>
          {vad && <p className="mt-3 text-center text-xs text-neutral-400">Auto mode: just start talking to interrupt {COACH.name}. The mic reopens on its own when she finishes.</p>}
        </div>
        <Panel title="Transcript">
          <TranscriptPanel turns={turns} partial={partial} streaming={streaming} name={user.name} />
        </Panel>
      </div>
      <Panel title="Coaching notes" badge={feedback ? <span className="pill bg-emerald-50 text-emerald-700">live</span> : null}>
        <FeedbackSidebar feedback={feedback} count={count} onRepeat={(t) => { stopVoice(); speak(t); }} />
      </Panel>
      <SessionSummary open={!!ended} onClose={() => router.push("/gamification/speaking")} summary={ended?.summary ?? null} fluency={ended?.fluency ?? null} xp={ended?.xp ?? 0} xpParts={ended?.xpParts ?? []} />
    </div>
  );
}
