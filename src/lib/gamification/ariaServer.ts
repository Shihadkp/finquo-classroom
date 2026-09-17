// Server-only model calls for Aria Live. Session memory = the stored transcript + feedback, replayed each turn.
//
// Two interchangeable backends behind one tiny interface:
//   • Any OpenAI-compatible endpoint (ARIA_BASE_URL + ARIA_API_KEY + ARIA_MODEL) — e.g. Groq's free tier, Gemini, OpenRouter, Ollama.
//   • Anthropic Claude (ANTHROPIC_API_KEY), used when no ARIA_BASE_URL is set.

import Anthropic from "@anthropic-ai/sdk";
import { fail } from "@/lib/api";
import { ARIA_SYSTEM, COACH, FEEDBACK_TOOL, MODES, SUMMARY_TOOL, type Feedback, type ModeId, type Summary, type Turn } from "./aria";

export type Msg = { role: "user" | "assistant" | "system"; content: string };
type JsonTool = { name: string; description: string; strict: true; input_schema: Anthropic.Tool["input_schema"] };

export interface LLM {
  /** Streams plain text for the next spoken reply. */
  stream(system: string, msgs: Msg[], signal: AbortSignal): AsyncIterable<string>;
  /** Returns an object matching the tool's JSON schema. */
  json<T>(system: string, prompt: string, tool: JsonTool): Promise<T>;
}

export const isAriaConfigured = () => !!((process.env.ARIA_BASE_URL && process.env.ARIA_API_KEY) || process.env.ANTHROPIC_API_KEY);

export function ariaClient(): LLM {
  if (process.env.ARIA_BASE_URL && process.env.ARIA_API_KEY) return openAiCompatible(process.env.ARIA_BASE_URL, process.env.ARIA_API_KEY, process.env.ARIA_MODEL || "openai/gpt-oss-120b");
  if (process.env.ANTHROPIC_API_KEY) return claude(new Anthropic());
  throw fail(503, `${COACH.name} isn't configured yet. Set ARIA_BASE_URL + ARIA_API_KEY (free: Groq) or ANTHROPIC_API_KEY.`);
}

// ─── OpenAI-compatible (Groq / Gemini / OpenRouter / Ollama) ─────────────────
function openAiCompatible(baseUrl: string, apiKey: string, model: string): LLM {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
  // Reasoning models (gpt-oss, qwen3) think before they speak; "low" keeps that to a few tokens. Omitted when unset so non-reasoning providers don't reject it.
  const reasoning = process.env.ARIA_REASONING_EFFORT ? { reasoning_effort: process.env.ARIA_REASONING_EFFORT } : {};
  return {
    async *stream(system, msgs, signal) {
      const res = await fetch(url, { method: "POST", headers, signal, body: JSON.stringify({ model, stream: true, max_tokens: 600, temperature: 0.8, ...reasoning, messages: [{ role: "system", content: system }, ...msgs] }) });
      if (!res.ok || !res.body) throw new Error(`LLM ${res.status}: ${await res.text().catch(() => "")}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.replace(/^data:\s?/, "").trim();
          if (!line.startsWith("data:") || !data || data === "[DONE]") continue;
          try {
            const text = JSON.parse(data).choices?.[0]?.delta?.content;
            if (text) yield text as string;
          } catch { /* keep-alive or partial line */ }
        }
      }
    },
    async json<T>(system: string, prompt: string, tool: JsonTool) {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({
        model, temperature: 0.2, max_tokens: 1500, response_format: { type: "json_object" }, ...reasoning,
        messages: [{ role: "system", content: `${system}\n\nRespond with ONLY a JSON object matching this schema exactly (no prose):\n${JSON.stringify(tool.input_schema)}` }, { role: "user", content: prompt }],
      }) });
      if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text().catch(() => "")}`);
      const body = await res.json();
      const raw = String(body.choices?.[0]?.message?.content ?? "{}");
      return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as T;
    },
  };
}

// ─── Anthropic Claude ────────────────────────────────────────────────────────
const CLAUDE_MODEL = "claude-opus-5";
function claude(client: Anthropic): LLM {
  return {
    async *stream(system, msgs, signal) {
      const s = client.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "low" },
        messages: msgs as Anthropic.MessageParam[], // mid-conversation "system" nudges are supported on this model
      });
      signal.addEventListener("abort", () => s.controller.abort());
      for await (const ev of s) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
    },
    async json<T>(system: string, prompt: string, tool: JsonTool) {
      const res = await client.messages.create({
        model: CLAUDE_MODEL, max_tokens: 1500, output_config: { effort: "low" }, system,
        tools: [tool], tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: prompt }],
      });
      const t = res.content.find((b) => b.type === "tool_use");
      if (!t || t.type !== "tool_use") throw new Error("No structured output returned");
      return t.input as T;
    },
  };
}

// ─── Aria-specific calls ─────────────────────────────────────────────────────
export function systemFor(o: { mode: ModeId; scenario: string; studentName: string; mission?: { title: string; prompt: string; twist: string } | null }) {
  const m = MODES[o.mode];
  const sc = m.scenarios.find((s) => s.id === o.scenario);
  return [
    ARIA_SYSTEM,
    `Mode: ${m.name}. ${m.persona}`,
    sc ? `Scenario: ${sc.title}.` : "",
    o.mission ? `Today's mission for the student: "${o.mission.title}" — ${o.mission.prompt} ${o.mission.twist} Steer the conversation so they complete it within about five minutes.` : "",
    `The student's name is ${o.studentName}. Use it occasionally.`,
    "Style: this is live speech, not writing. One or two short sentences, then hand the turn straight back with a question or a reaction they can answer. React to what they actually said before asking anything. Never list, never use markdown, never narrate actions. If they give a one-word answer, ask something concrete to draw them out. Keep the energy up: you are a curious person in a conversation, not an interviewer working through a script.",
    "Never repeat yourself. Do not reuse a sentence pattern you have already used in this conversation — above all 'you could say X, which sounds more natural'. Do not re-ask a question they have already answered, and do not restate their own words back to them. If a reply of yours would resemble an earlier one, say something different instead.",
  ].filter(Boolean).join("\n\n");
}

/** Aria's next spoken reply. Every third exchange carries a nudge to coach briefly, woven into the reply. */
export function replyStream(llm: LLM, system: string, turns: Turn[], exchangeNo: number, signal: AbortSignal) {
  const msgs: Msg[] = turns.map((t) => ({ role: t.role, content: t.text }));
  if (exchangeNo > 0 && exchangeNo % 3 === 0) {
    msgs.push({ role: "system", content: "Now, within your reply, weave in ONE short natural coaching remark about the student's English (a better phrase, a grammar slip, or a pronunciation tip) without sounding like a teacher, then keep the conversation going with a question. Phrase it differently from any correction you have already given." });
  } else {
    // Without this the model coaches on nearly every turn and its phrasing starts to repeat.
    msgs.push({ role: "system", content: "This turn is conversation only. Do not correct their English, do not suggest a better phrasing, and do not comment on how they speak. Just respond to what they said and keep it moving." });
  }
  return llm.stream(system, msgs, signal);
}

/** Structured feedback for one student utterance. Never spoken; stored. */
export async function feedbackFor(llm: LLM, o: { utterance: string; recent: Turn[]; alreadyCorrected: string[]; seconds: number }): Promise<Feedback> {
  const words = o.utterance.trim().split(/\s+/).filter(Boolean).length;
  const measuredPace = o.seconds > 1 ? Math.round((words / o.seconds) * 60) : 0;
  const fb = await llm.json<Feedback>(
    "You are a speech coach's analysis engine. Assess ONLY the student's latest utterance (spoken, transcribed). Be fair: transcription may drop punctuation. Pronunciation: list at most 3 words a non-native speaker would find hard, with a drill for each (IPA, stressed syllable, syllable breakdown, one practice sentence). Grammar: real errors only, never repeat corrections already given. Vocabulary: one upgrade suggestion or null. Scores are integers 0-100.",
    `Recent exchanges:\n${o.recent.map((t) => `${t.role === "user" ? "Student" : COACH.name}: ${t.text}`).join("\n")}\n\nStudent's latest utterance: "${o.utterance}"\nMeasured pace: ${measuredPace || "unknown"} words per minute.\nAlready corrected earlier in this session (do not repeat): ${o.alreadyCorrected.join("; ") || "nothing yet"}.`,
    FEEDBACK_TOOL,
  );
  // Defensive defaults so a loose free model can't break the UI.
  fb.grammar ??= []; fb.pronunciation ??= []; fb.drills ??= []; fb.vocabulary ??= null;
  if (measuredPace) fb.pace = measuredPace;
  return fb;
}

export async function summarize(llm: LLM, turns: Turn[], feedback: Feedback[]): Promise<Summary> {
  const s = await llm.json<Summary>(
    `You are ${COACH.name}, wrapping up a spoken English practice session. Summarise warmly and concretely. fluency is an integer 0-100 for the whole session.`,
    `Transcript:\n${turns.map((t) => `${t.role === "user" ? "Student" : COACH.name}: ${t.text}`).join("\n")}\n\nPer-turn feedback (JSON): ${JSON.stringify(feedback)}`,
    SUMMARY_TOOL,
  );
  s.strengths ??= []; s.focus ??= []; s.vocabulary ??= [];
  return s;
}
