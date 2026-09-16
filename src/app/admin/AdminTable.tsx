"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ClassDTO, RecordingStatus } from "@/lib/types";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { useApi, useToast } from "@/components/Toast";
import { Avatar, Empty, Panel } from "@/components/ui";

const REC_STYLE: Record<RecordingStatus, string> = {
  RECORDING: "bg-red-50 text-red-600",
  UPLOADED: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-amber-50 text-amber-700",
  READY: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
};

const STATUS_STYLE: Record<ClassDTO["status"], string> = {
  SCHEDULED: "bg-accent-soft text-accent",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
};

export function AdminTable({ classes, mentors, user }: { classes: ClassDTO[]; mentors: { id: string; name: string }[]; user: SessionUser }) {
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [mentorId, setMentorId] = useState("");

  const now = Date.now();
  const inProgress = classes.filter((c) => c.status === "SCHEDULED" && new Date(c.startAt).getTime() <= now && new Date(c.endAt).getTime() + 3_600_000 > now);
  const nextUp = classes
    .filter((c) => c.status === "SCHEDULED" && new Date(c.startAt).getTime() > now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5);
  const filtered = classes.filter((c) => (!status || c.status === status) && (!mentorId || c.mentorId === mentorId));

  async function end(id: string) {
    if (!confirm("End this class now?")) return;
    if (await api(`/api/classes/${id}/complete`, { method: "POST" })) router.refresh();
  }
  async function retry(id: string) {
    if (await api(`/api/recordings/${id}/retry`, { method: "POST" })) { toast("Transcode queued.", "ok"); router.refresh(); }
  }
  /** Testing aid: move a scheduled class to start right now (rules bypassed except overlap). */
  async function startNow(id: string) {
    const startAt = new Date(Math.floor(now / 60_000) * 60_000).toISOString();
    if (await api(`/api/classes/${id}`, { method: "PATCH", json: { startAt, force: true } })) { toast("Class moved to now.", "ok"); router.refresh(); }
  }

  const liveDot = (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel title="Next up" badge={<span className="pill bg-accent-soft text-accent">{nextUp.length}</span>} action={<Link href="/schedule" className="text-sm font-semibold text-accent hover:underline">Schedule →</Link>}>
          {nextUp.length === 0 ? (
            <Empty>Nothing scheduled.</Empty>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {nextUp.map((c) => (
                <li key={c.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="w-14 shrink-0 text-sm font-semibold text-accent">{fmtTime(c.startAt, user.timezone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.title}</span>
                    <span className="block truncate text-xs text-neutral-500">{c.mentor.name} · {c.student.name} · {fmtDateTime(c.startAt, user.timezone)}</span>
                  </span>
                  <button onClick={() => startNow(c.id)} className="btn-ghost px-3 py-1.5 text-xs">Start now</button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={<>{liveDot} Live now</>} badge={<span className="pill bg-red-50 text-red-600">{inProgress.length} active</span>}>
          {inProgress.length === 0 ? (
            <Empty>No class is running.</Empty>
          ) : (
            <ul className="space-y-3">
              {inProgress.map((c) => (
                <li key={c.id} className="rounded-xl bg-canvas p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.mentor.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.title}</span>
                      <span className="block truncate text-xs text-neutral-500">{c.mentor.name} · {c.student.name}</span>
                    </span>
                    <span className="pill bg-emerald-50 text-emerald-700">{fmtTime(c.startAt, user.timezone)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link href={`/room/${c.id}`} className="btn-ghost flex-1 py-2 text-xs">Join</Link>
                    <button onClick={() => end(c.id)} className="btn-danger flex-1 py-2 text-xs">End call</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="All classes"
        badge={<span className="pill bg-neutral-100 text-neutral-600">{filtered.length}</span>}
        className="overflow-hidden"
        action={
          <span className="flex gap-2">
            <select className="input w-auto py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option>SCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option>
            </select>
            <select className="input w-auto py-1.5" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
              <option value="">All mentors</option>
              {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </span>
        }
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-canvas">
              <tr>
                <th className="th">Class</th><th className="th">Mentor / Student</th><th className="th">When</th>
                <th className="th">Status</th><th className="th">Recording</th><th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-canvas/60">
                  <td className="td font-semibold">{c.title}</td>
                  <td className="td text-neutral-600">
                    <span className="flex items-center gap-2"><Avatar name={c.mentor.name} className="size-7 text-[10px]" />{c.mentor.name} <span className="text-neutral-300">/</span> {c.student.name}</span>
                  </td>
                  <td className="td text-neutral-600">{fmtDateTime(c.startAt, user.timezone)}</td>
                  <td className="td"><span className={`pill ${STATUS_STYLE[c.status]}`}>{c.status.toLowerCase()}</span></td>
                  <td className="td">
                    {c.recording ? (
                      <span className="flex items-center gap-2">
                        <span className={`pill ${REC_STYLE[c.recording.status]}`} title={c.recording.error ?? undefined}>{c.recording.status.toLowerCase()}</span>
                        {c.recording.status === "FAILED" && <button onClick={() => retry(c.id)} className="text-xs font-semibold text-accent hover:underline">Retry</button>}
                        {c.recording.status === "READY" && <Link href={`/recordings/${c.id}`} className="text-xs font-semibold text-accent hover:underline">Watch</Link>}
                      </span>
                    ) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="td text-right">
                    {c.status === "SCHEDULED" && new Date(c.startAt).getTime() > now && (
                      <button onClick={() => startNow(c.id)} className="text-xs font-semibold text-neutral-500 hover:text-accent">Start now</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No classes match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
