"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ClassDTO } from "@/lib/types";
import { joinState } from "@/lib/rules";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { useApi } from "@/components/Toast";
import { Avatar } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { DeleteButton } from "@/components/DeleteButton";

const STATUS_STYLE: Record<ClassDTO["status"], string> = {
  SCHEDULED: "bg-accent-soft text-accent",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
};

export function ClassCard({ cls, user, live }: { cls: ClassDTO; user: SessionUser; live?: boolean }) {
  const router = useRouter();
  const api = useApi();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const other = user.role === "MENTOR" ? cls.student : cls.mentor;
  const canManage = user.role === "ADMIN" || (user.role === "MENTOR" && cls.mentorId === user.id);
  const start = new Date(cls.startAt);
  const end = new Date(cls.endAt);
  const state = joinState({ startAt: start, endAt: end }, new Date(now));

  async function cancel() {
    if (!confirm("Cancel this class?")) return;
    if (await api(`/api/classes/${cls.id}`, { method: "PATCH", json: { status: "CANCELLED" } })) router.refresh();
  }

  return (
    <article className={`card flex flex-wrap items-center gap-4 p-5 ${live ? "border-red-200 ring-2 ring-red-100" : ""}`}>
      <Avatar name={user.role === "ADMIN" ? cls.mentor.name : other.name} className="size-11 text-sm" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <h3 className="truncate text-base font-semibold tracking-tight">{cls.title}</h3>
          <span className={`pill ${STATUS_STYLE[cls.status]}`}>{live ? "live" : cls.status.toLowerCase()}</span>
        </div>
        <p className="text-sm text-neutral-500">
          {user.role === "ADMIN" ? `${cls.mentor.name} · ${cls.student.name}` : `with ${other.name}`}
          <span className="text-neutral-300"> · </span>
          {fmtDateTime(start, user.timezone)} – {fmtTime(end, user.timezone)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {cls.status === "SCHEDULED" && state === "open" && (
          <Link href={`/room/${cls.id}`} className="btn-primary">Join</Link>
        )}
        {cls.status === "SCHEDULED" && state === "early" && (
          <span className="pill bg-neutral-100 text-neutral-500">Opens 10m before</span>
        )}
        {cls.status === "SCHEDULED" && state === "ended" && <span className="pill bg-neutral-100 text-neutral-500">Ended</span>}
        {cls.status === "SCHEDULED" && state !== "ended" && <CopyLink path={`/room/${cls.id}`} />}

        {/* Recordings are admin-only (QA). Everyone else just sees whether they attended. */}
        {cls.status === "COMPLETED" && user.role === "ADMIN" && cls.recording && (
          cls.recording.status === "READY" ? (
            <Link href={`/recordings/${cls.id}`} className="btn-primary">Watch recording</Link>
          ) : cls.recording.status === "FAILED" ? (
            <span className="text-sm text-red-600">{cls.recording.error ?? "Recording failed"}</span>
          ) : (
            <Link href={`/recordings/${cls.id}`} className="text-sm text-neutral-500">Recording is being prepared…</Link>
          )
        )}
        {cls.status === "COMPLETED" && user.role === "ADMIN" && !cls.recording && <span className="text-sm text-neutral-400">No recording</span>}
        {cls.status === "COMPLETED" && user.role === "STUDENT" && (
          <span className={`pill ${cls.studentJoinedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{cls.studentJoinedAt ? "Attended" : "Missed"}</span>
        )}

        {canManage && cls.status === "SCHEDULED" && (
          <>
            <Link href={`/schedule/new?reschedule=${cls.id}`} className="btn-ghost">Reschedule</Link>
            <button onClick={cancel} className="btn-danger">Cancel</button>
          </>
        )}
        {/* Cancel keeps the record; delete removes it and its recording for good. Admins only. */}
        {user.role === "ADMIN" && !live && (
          <DeleteButton
            url={`/api/classes/${cls.id}`}
            confirm={`Delete "${cls.title}" permanently?

This also deletes its recording. Cancel instead if you want to keep the record.`}
            done="Class deleted."
            className="btn-ghost px-3 py-2 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600"
          />
        )}
      </div>
    </article>
  );
}
