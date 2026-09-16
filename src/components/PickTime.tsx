"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { fmtTime, todayYmd } from "@/lib/time";
import { useApi, useToast } from "./Toast";
import { Modal } from "./Modal";

export type PickTarget = {
  studentId: string;
  title: string;
  sessionId?: string;
  /** Set when rescheduling: the class keeps its mentor, only the time moves. */
  existing?: { id: string; mentorId: string; startAt: string };
  /** Pre-selected mentor for a new booking. */
  mentorId?: string;
};

type Person = { id: string; name: string };
type Slot = { startAt: string; endAt: string };

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const zonedYmd = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Calendar + mentor + free-slot picker. Books (POST) or reschedules (PATCH) via the existing class API. */
export function PickTime({ target, user, mentors, onClose }: { target: PickTarget | null; user: SessionUser; mentors: Person[]; onClose: () => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title="Pick a time" subtitle={target?.title} className="max-w-md">
      {target && <Picker target={target} user={user} mentors={mentors} onClose={onClose} />}
    </Modal>
  );
}

function Picker({ target, user, mentors, onClose }: { target: PickTarget; user: SessionUser; mentors: Person[]; onClose: () => void }) {
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const today = todayYmd(user.timezone);
  const initial = target.existing ? zonedYmd(target.existing.startAt, user.timezone) : todayYmd(user.timezone, 1);

  const [date, setDate] = useState(initial);
  const [[y, m], setMonth] = useState(() => initial.split("-").slice(0, 2).map(Number) as [number, number]);
  const [mentorId, setMentorId] = useState(
    target.existing?.mentorId ?? (user.role === "MENTOR" ? user.id : target.mentorId ?? mentors[0]?.id ?? ""),
  );
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [mentorTz, setMentorTz] = useState(user.timezone);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mentorId || !date) return;
    setSlots(null);
    setPicked(null);
    const q = new URLSearchParams({ mentorId, date, studentId: target.studentId, ...(target.existing ? { exclude: target.existing.id } : {}) });
    api<{ timezone: string; slots: Slot[] }>(`/api/slots?${q}`).then((d) => {
      setSlots(d?.slots ?? []);
      if (d) setMentorTz(d.timezone);
    });
  }, [mentorId, date, target, api]);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    const res = target.existing
      ? await api(`/api/classes/${target.existing.id}`, { method: "PATCH", json: { startAt: picked } })
      : await api("/api/classes", { method: "POST", json: { title: target.title, studentId: target.studentId, mentorId, startAt: picked, sessionId: target.sessionId } });
    setBusy(false);
    if (!res) return;
    toast(target.existing ? "Class rescheduled." : "Class booked.", "ok");
    router.refresh();
    onClose();
  }

  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const shift = (n: number) => setMonth(([yy, mm]) => { const d = new Date(yy, mm - 1 + n, 1); return [d.getFullYear(), d.getMonth() + 1]; });

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} className="btn-ghost px-2.5 py-1">‹</button>
          <p className="font-semibold">{monthLabel}</p>
          <button type="button" onClick={() => shift(1)} className="btn-ghost px-2.5 py-1">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DOW.map((d) => <span key={d} className="eyebrow py-1">{d}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const v = ymd(y, m, i + 1);
            const past = v < today;
            return (
              <button
                key={v}
                type="button"
                disabled={past}
                onClick={() => setDate(v)}
                className={`rounded-lg py-1.5 text-sm font-medium transition ${v === date ? "bg-accent text-white" : past ? "text-neutral-300" : "text-neutral-700 hover:bg-accent-soft"}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-neutral-100 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="eyebrow">Available slots</p>
          <select className="input w-auto py-1.5" value={mentorId} disabled={!!target.existing || user.role === "MENTOR"} onChange={(e) => setMentorId(e.target.value)}>
            {mentors.map((mt) => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
          </select>
        </div>
        {slots === null ? (
          <p className="py-3 text-sm text-neutral-400">Loading…</p>
        ) : slots.length === 0 ? (
          <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-neutral-500">
            No free slots that day{mentorTz !== user.timezone ? ` (mentor's hours are set in ${mentorTz})` : ""}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s.startAt}
                type="button"
                onClick={() => setPicked(s.startAt)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${picked === s.startAt ? "border-accent bg-accent text-white" : "border-neutral-200 bg-white hover:border-accent"}`}
              >
                {fmtTime(s.startAt, user.timezone)}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-400">Times in {user.timezone}. Classes are 60 minutes.</p>
      </div>

      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!picked || busy} onClick={confirm}>{busy ? "Saving…" : "Confirm"}</button>
      </div>
    </div>
  );
}
