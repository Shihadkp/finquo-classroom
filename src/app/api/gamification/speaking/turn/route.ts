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
 * Closing the connection (student interrupts) stops generation; the partial reply is still saved.
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
  const feedback = JSON.parse(session.feedback) as Feedback[];
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
      if (reply.trim()) turns.push({ role: "assistant", text: reply.trim(), at: new Date().toISOString() });
      send("reply", { text: reply });

      // Feedback runs after the spoken reply so it never delays the voice.
      try {
        const fb = await feedbackFor(llm, { utterance: text, recent: turns.slice(-6, -1), alreadyCorrected: feedback.flatMap((f) => f.grammar.map((g) => g.wrong)), seconds: body.seconds ?? 0 });
        feedback.push(fb);
        send("feedback", { feedback: fb, exchangeNo });
      } catch (e) {
        console.error(e);
      }
      await db.speakingSession.update({ where: { id: session.id }, data: { transcript: JSON.stringify(turns), feedback: JSON.stringify(feedback) } });
      send("done", {});
      try { controller.close(); } catch { /* already closed by abort */ }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
});
