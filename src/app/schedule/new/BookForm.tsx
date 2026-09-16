"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ClassDTO } from "@/lib/types";
import { fmtTime, todayYmd } from "@/lib/time";
import { useApi, useToast } from "@/components/Toast";

type Person = { id: string; name: string };
type Slot = { startAt: string; endAt: string };

export function BookForm({ user, students, mentors, existing }: { user: SessionUser; students: Person[]; mentors: Person[]; existing: ClassDTO | null }) {
  const router = useRouter();
  const api = useApi();
  const toast = useToast();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [studentId, setStudentId] = useState(existing?.studentId ?? students[0]?.id ?? "");
  const [mentorId, setMentorId] = useState(existing?.mentorId ?? (user.role === "MENTOR" ? user.id : mentors[0]?.id ?? ""));
  const [date, setDate] = useState(todayYmd(user.timezone, 1));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [mentorTz, setMentorTz] = useState(user.timezone);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mentorId || !date) return;
    setSlots(null);
    setPicked(null);
    const q = new URLSearchParams({ mentorId, date, studentId, ...(existing ? { exclude: existing.id } : {}) });
    api<{ timezone: string; slots: Slot[] }>(`/api/slots?${q}`).then((d) => {
      if (!d) return setSlots([]);
      setSlots(d.slots);
      setMentorTz(d.timezone);
    });
  }, [mentorId, date, studentId, existing, api]);

  async function confirm() {
    if (!picked) return toast("Pick a time slot first.");
    setBusy(true);
    const res = existing
      ? await api(`/api/classes/${existing.id}`, { method: "PATCH", json: { startAt: picked, title } })
      : await api("/api/classes", { method: "POST", json: { title, studentId, mentorId, startAt: picked } });
    setBusy(false);
    if (!res) return;
    toast(existing ? "Class rescheduled." : "Class booked.", "ok");
    router.push("/schedule");
    router.refresh();
  }

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" placeholder="e.g. Algebra — quadratics" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="student">Student</label>
          <select id="student" className="input" value={studentId} disabled={!!existing} onChange={(e) => setStudentId(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {user.role === "ADMIN" && (
          <div>
            <label className="label" htmlFor="mentor">Mentor</label>
            <select id="mentor" className="input" value={mentorId} disabled={!!existing} onChange={(e) => setMentorId(e.target.value)}>
              {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input id="date" type="date" className="input" value={date} min={todayYmd(user.timezone)} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <p className="label">
          Available times <span className="normal-case tracking-normal text-neutral-400">· shown in your timezone ({user.timezone})</span>
        </p>
        {slots === null ? (
          <p className="py-6 text-sm text-neutral-400">Loading…</p>
        ) : slots.length === 0 ? (
          <p className="card text-sm text-neutral-500">
            No free slots that day{mentorTz !== user.timezone ? ` (mentor's availability is set in ${mentorTz})` : ""}. Try another date.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.startAt}
                type="button"
                onClick={() => setPicked(s.startAt)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${picked === s.startAt ? "border-accent bg-accent text-white" : "border-neutral-200 bg-white hover:border-accent"}`}
              >
                {fmtTime(s.startAt, user.timezone)}
              </button>
            ))}
          </div>
        )}
        <div className="mt-8 flex items-center gap-3">
          <button className="btn-primary" onClick={confirm} disabled={busy || !picked}>
            {busy ? "Saving…" : existing ? "Confirm new time" : "Confirm booking"}
          </button>
          <button className="btn-ghost" onClick={() => router.back()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
