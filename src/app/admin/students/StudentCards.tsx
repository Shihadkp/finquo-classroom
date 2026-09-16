"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ClassDTO } from "@/lib/types";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { useApi, useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { PickTime, type PickTarget } from "@/components/PickTime";
import { CopyLink } from "@/components/CopyLink";
import { Avatar, Empty, Icon } from "@/components/ui";
import { summarize, type Program, type StudentDTO } from "./summary";

type Person = { id: string; name: string };

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-accent-soft text-accent",
  active: "bg-emerald-50 text-emerald-700",
  idle: "bg-amber-50 text-amber-700",
  new: "bg-neutral-100 text-neutral-600",
};

export function StudentCards({ students, programs, mentors, user }: { students: StudentDTO[]; programs: Program[]; mentors: Person[]; user: SessionUser }) {
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const [view, setView] = useState<"cards" | "list">("cards");
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [target, setTarget] = useState<PickTarget | null>(null);
  const now = Date.now();
  const scheduling = students.find((s) => s.id === schedulingId) ?? null;

  async function enroll(studentId: string, programId: string) {
    if (await api(`/api/users/${studentId}`, { method: "PATCH", json: { programId: programId || null } })) {
      toast(programId ? "Program updated." : "Removed from program.", "ok");
      router.refresh();
    }
  }

  const programSelect = (s: StudentDTO) => (
    <select className="input py-1.5" value={s.programId ?? ""} onChange={(e) => enroll(s.id, e.target.value)}>
      <option value="">No program</option>
      {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-1">
        {(["cards", "list"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${view === v ? "bg-accent text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>{v}</button>
        ))}
      </div>

      {students.length === 0 ? (
        <Empty>No students yet.</Empty>
      ) : view === "cards" ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {students.map((s) => {
            const d = summarize(s, now);
            return (
              <article key={s.id} className="card flex flex-col gap-5 p-5">
                <header className="flex items-start gap-3">
                  <Avatar name={s.name} className="size-12 text-sm" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-neutral-500">{s.program?.name ?? "No program"}</p>
                    <p className="truncate text-xs text-neutral-400">{s.email}</p>
                  </div>
                  <span className={`pill ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                </header>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="eyebrow">Mentor</dt><dd className="mt-1 font-semibold">{d.mentor?.name ?? "—"}</dd></div>
                  <div><dt className="eyebrow">Timezone</dt><dd className="mt-1 font-semibold">{s.timezone}</dd></div>
                </dl>

                <div className="rounded-xl bg-canvas p-4">
                  <p className="eyebrow">Next session</p>
                  {d.live ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{d.live.title} <span className="pill bg-red-50 text-red-600">live</span></span>
                      <Link href={`/room/${d.live.id}`} className="btn-primary px-3 py-1.5 text-xs">Join</Link>
                    </div>
                  ) : d.next ? (
                    <p className="mt-1 text-sm"><span className="font-semibold">{d.next.title}</span><span className="text-neutral-500"> · {fmtDateTime(d.next.startAt, user.timezone)} · {d.next.mentor.name}</span></p>
                  ) : (
                    <p className="mt-1 text-sm italic text-neutral-500">No upcoming session booked</p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {[[`${d.completed.length}/${d.total}`, "Sessions"], [d.attendance === null ? "—" : `${d.attendance}%`, "Attendance"], [d.upcoming.length, "Upcoming"]].map(([v, l]) => (
                    <div key={l} className="rounded-xl border border-neutral-100 py-3">
                      <p className="text-lg font-bold">{v}</p>
                      <p className="eyebrow">{l}</p>
                    </div>
                  ))}
                </div>

                <details className="group rounded-xl border border-neutral-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-accent">
                    View class history <span className="transition group-open:rotate-180">▾</span>
                  </summary>
                  <ul className="divide-y divide-neutral-100 border-t border-neutral-100 px-4 text-sm">
                    {[...d.completed, ...s.classes.filter((c) => c.status === "CANCELLED")].map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0"><span className="block truncate font-medium">{c.title}</span><span className="block text-xs text-neutral-500">{fmtDateTime(c.startAt, user.timezone)} · {c.mentor.name}</span></span>
                        {c.status === "CANCELLED" ? <span className="pill bg-red-50 text-red-600">cancelled</span>
                          : c.recording?.status === "READY" ? <Link href={`/recordings/${c.id}`} className="text-xs font-semibold text-accent hover:underline">Watch</Link>
                          : <span className="pill bg-emerald-50 text-emerald-700">done</span>}
                      </li>
                    ))}
                    {d.completed.length === 0 && <li className="py-3 text-xs italic text-neutral-400">No classes yet.</li>}
                  </ul>
                </details>

                <button type="button" onClick={() => setSchedulingId(s.id)} className="btn-primary w-full">Schedule</button>
                <div><p className="label">Program</p>{programSelect(s)}</div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-canvas">
              <tr><th className="th">Student</th><th className="th">Program</th><th className="th">Progress</th><th className="th">Attendance</th><th className="th">Mentor</th><th className="th">Next class</th><th className="th">Status</th><th className="th" /></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {students.map((s) => {
                const d = summarize(s, now);
                const pct = d.total ? Math.round((d.completed.length / d.total) * 100) : 0;
                return (
                  <tr key={s.id} className="hover:bg-canvas/60">
                    <td className="td"><span className="flex items-center gap-3"><Avatar name={s.name} className="size-10 text-sm" /><span className="leading-tight"><span className="block font-semibold">{s.name}</span><span className="block text-xs text-neutral-500">{s.email}</span></span></span></td>
                    <td className="td w-56">{programSelect(s)}</td>
                    <td className="td">
                      <span className="block text-xs font-semibold">{d.completed.length}/{d.total} · {pct}%</span>
                      <span className="mt-1 block h-1.5 w-32 rounded-full bg-neutral-100"><span className="block h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
                    </td>
                    <td className="td">{d.attendance === null ? <span className="text-neutral-300">—</span> : <span className={`pill ${d.attendance >= 80 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{d.attendance}% · {d.attended}/{d.completed.length}</span>}</td>
                    <td className="td text-neutral-600">{d.mentor?.name ?? "—"}</td>
                    <td className="td">{d.next ? <><span className="block font-semibold">{fmtDateTime(d.next.startAt, user.timezone)}</span><span className="block text-xs text-neutral-500">{d.next.title}</span></> : <span className="text-neutral-300">—</span>}</td>
                    <td className="td"><span className={`pill ${STATUS_STYLE[d.status]}`}>{d.status}</span></td>
                    <td className="td text-right"><button type="button" onClick={() => setSchedulingId(s.id)} className="btn-ghost px-3 py-1.5 text-xs">Schedule</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!scheduling} onClose={() => setSchedulingId(null)} title={`Sessions — ${scheduling?.name ?? ""}`} subtitle="Use Reschedule on a booked class, or Pick time to book a remaining session on the mentor's free slots.">
        {scheduling && (
          scheduling.program ? (
            <SessionRows student={scheduling} user={user} now={now} onPick={setTarget} />
          ) : (
            <div className="space-y-3">
              <Empty>This student isn't enrolled in a program yet.</Empty>
              {programSelect(scheduling)}
            </div>
          )
        )}
      </Modal>

      <PickTime target={target} user={user} mentors={mentors} onClose={() => setTarget(null)} />
    </>
  );
}

function SessionRows({ student, user, now, onPick }: { student: StudentDTO; user: SessionUser; now: number; onPick: (t: PickTarget) => void }) {
  const d = summarize(student, now);
  const defaultMentor = d.mentor?.id;
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="th pl-0">#</th><th className="th">Session title</th><th className="th">Mentor</th><th className="th">Date &amp; time</th><th className="th pr-0">Status</th></tr></thead>
      <tbody className="divide-y divide-neutral-100">
        {student.program!.sessions.map((sess) => {
          const cls = d.active.find((c) => c.sessionId === sess.id) ?? null;
          const start = cls ? new Date(cls.startAt).getTime() : 0;
          const state = !cls ? "remaining" : cls.status === "COMPLETED" ? "done" : start <= now ? "live" : "booked";
          return (
            <tr key={sess.id}>
              <td className="py-3 pr-3 font-mono text-xs text-neutral-400">{String(sess.order).padStart(2, "0")}</td>
              <td className="py-3 pr-3 font-semibold">{sess.title}</td>
              <td className="py-3 pr-3 text-neutral-600">{cls?.mentor.name ?? "—"}</td>
              <td className="py-3 pr-3">
                {state === "booked" ? (
                  <button type="button" onClick={() => onPick({ studentId: student.id, title: sess.title, sessionId: sess.id, existing: { id: cls!.id, mentorId: cls!.mentorId, startAt: cls!.startAt } })} className="btn-ghost px-3 py-1.5 text-xs">
                    <Icon name="calendar" className="size-3.5" /> {fmtDateTime(cls!.startAt, user.timezone)} · Reschedule
                  </button>
                ) : null}
                {state === "booked" || state === "live" ? (
                  <span className="ml-2 inline-block"><CopyLink path={`/room/${cls!.id}`} label="Link" /></span>
                ) : cls ? (
                  <span className="text-neutral-600">{fmtDateTime(cls.startAt, user.timezone)} – {fmtTime(cls.endAt, user.timezone)}</span>
                ) : (
                  <button type="button" onClick={() => onPick({ studentId: student.id, title: sess.title, sessionId: sess.id, mentorId: defaultMentor })} className="btn-ghost px-3 py-1.5 text-xs text-accent">
                    <Icon name="calendar" className="size-3.5" /> Pick time
                  </button>
                )}
              </td>
              <td className="py-3">
                {state === "live" ? <Link href={`/room/${cls!.id}`} className="pill bg-red-50 text-red-600">live · join</Link>
                  : <span className={`pill ${state === "done" ? "bg-emerald-50 text-emerald-700" : state === "booked" ? "bg-accent-soft text-accent" : "bg-neutral-100 text-neutral-500"}`}>{state}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
