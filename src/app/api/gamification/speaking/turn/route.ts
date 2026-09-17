import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, handle, readJson } from "@/lib/api";
import { COACH, missionFor, type Feedback, type ModeId, type Turn } from "@/lib/gamification/aria";
import { ariaClient, feedbackFor, replyStream, systemFor } from "@/lib/gamification/ariaServer";
import { profile } from "@/lib/gamification/service";

/**
 * POST /api/gamification/speaking/turn { sessionId, text, seconds } → Server-Sent Events.
 * Stands in for WS /speaking/live: Next.js route handlers can't upgrade to WebSocket, and a one-way
 * token stream per turn is all the browser needs (the mic side stays local via the Web Speech API).
 *
 * events: delta {text} · reply {text} · feedback {feedback, exchangeNo} · done · error {message}
 * Closing the connection (student interrupts) stops generation; the partial reply is saved, marked
 * as cut off so the model answers what the student said instead of finishing its own sentence.
 *
 * Writes are ordered and guarded: the transcript is persisted as soon as the reply is final, before
 * the slow feedback call, and with a compare-and-swap on `updatedAt`. Two overlapping turns used to
 * read the same history and clobber each other, losing an exchange and making the coach repeat it.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ sessionId?: string; text?: string; seconds?: number }>(req);
  const text = body.text?.trim() ?? "";
  if (!body.sessionId || !text) return fail(400, "Nothing was said.");
  const session = await db.speakingSession.findFirst({ where: { id: body.sessionId, userId: user.id } });
  if (!session) return fail(404, "Session not found.");
  if (session.endedAt) return fail(409, "This session has ended.");
  const llm = ariaClient();

  const turns = JSON.parse(session.transcript) as Turn[];
  // Ignore an exact repeat of the last thing the student said: it is the microphone hearing an echo,
  // or a double-send, and answering it twice is what reads as the coach repeating herself.
  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  if (lastUser && lastUser.text.trim().toLowerCase() === text.toLowerCase()) {
    return fail(409, "Duplicate turn ignored.");
  }
  turns.push({ role: "user", text, at: new Date().toISOString() });
  const exchangeNo = turns.filter((t) => t.role === "user").length;
  const mission = session.missionDate ? missionFor(session.missionDate, (await profile(user)).level) : null;
  const system = systemFor({ mode: session.mode as ModeId, scenario: session.scenario, studentName: user.name, mission });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => { if (!req.signal.aborted) controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      let reply = "";
      try {
        for await (const chunk of replyStream(llm, system, turns, exchangeNo, req.signal)) {
          reply += chunk;
          send("delta", { text: chunk });
        }
      } catch (e) {
        if (!req.signal.aborted) { console.error(e); send("error", { message: `${COACH.name} lost the thread for a second. Try again.` }); }
      }
      if (reply.trim()) {
        // A barge-in leaves a half-finished sentence. Store it marked, or the model reads it back as
        // something it meant to say and finishes it next turn instead of answering the student.
        const cut = req.signal.aborted;
        turns.push({ role: "assistant", text: cut ? `${reply.trim()} …[cut off — the student interrupted; do not repeat or finish this, answer what they said]` : reply.trim(), at: new Date().toISOString() });
      }
      send("reply", { text: reply });

      // Persist the exchange NOW, before the slow feedback call, and only if nobody else wrote first.
      const saved = await db.speakingSession.updateMany({
        where: { id: session.id, updatedAt: session.updatedAt },
        data: { transcript: JSON.stringify(turns) },
      });
      if (!saved.count) console.warn(`speaking turn raced another write, discarded: session ${session.id}`);

      // Feedback is computed after the spoken reply so it never delays the voice, and is appended to
      // a freshly read row so a concurrent turn's feedback is not lost.
      try {
        const fb = await feedbackFor(llm, { utterance: text, recent: turns.slice(-6, -1), alreadyCorrected: (JSON.parse(session.feedback) as Feedback[]).flatMap((f) => f.grammar.map((g) => g.wrong)), seconds: body.seconds ?? 0 });
        const fresh = await db.speakingSession.findUnique({ where: { id: session.id }, select: { feedback: true } });
        const list = JSON.parse(fresh?.feedback ?? "[]") as Feedback[];
        list.push(fb);
        await db.speakingSession.update({ where: { id: session.id }, data: { feedback: JSON.stringify(list) } });
        send("feedback", { feedback: fb, exchangeNo });
      } catch (e) {
        console.error(e);
      }
      send("done", {});
      try { controller.close(); } catch { /* already closed by abort */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
});
