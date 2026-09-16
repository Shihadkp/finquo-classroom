// Pure helpers shared by the server page and the client cards (no "use client" here on purpose).

import type { ClassDTO } from "@/lib/types";

export type Session = { id: string; order: number; title: string };
export type Program = { id: string; name: string; sessions: Session[] };
export type StudentDTO = { id: string; name: string; email: string; timezone: string; programId: string | null; program: Program | null; classes: ClassDTO[] };

const DAY = 86_400_000;

/** Everything a card or row shows, derived from the student's bookings. */
export function summarize(s: StudentDTO, now: number) {
  const t = (c: ClassDTO) => new Date(c.startAt).getTime();
  const active = s.classes.filter((c) => c.status !== "CANCELLED");
  const completed = active.filter((c) => c.status === "COMPLETED").sort((a, b) => t(b) - t(a));
  const upcoming = active.filter((c) => c.status === "SCHEDULED" && new Date(c.endAt).getTime() > now).sort((a, b) => t(a) - t(b));
  const live = upcoming.find((c) => t(c) <= now) ?? null;
  const next = upcoming.find((c) => t(c) > now) ?? null;
  const last = completed[0] ?? null;
  const mentor = (live ?? next ?? last)?.mentor ?? null;
  const total = s.program?.sessions.length ?? completed.length;
  const recordings = completed.filter((c) => c.recording?.status === "READY").length;
  const attended = completed.filter((c) => c.studentJoinedAt).length;
  const attendance = completed.length ? Math.round((attended / completed.length) * 100) : null;
  const status = upcoming.length ? "scheduled" : last && now - t(last) < 30 * DAY ? "active" : completed.length ? "idle" : "new";
  return { active, completed, upcoming, live, next, last, mentor, total, recordings, attended, attendance, status };
}
