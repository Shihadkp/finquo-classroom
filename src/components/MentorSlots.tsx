"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { fmtTime, todayYmd } from "@/lib/time";
import { useApi } from "./Toast";
import { Modal } from "./Modal";

type Slot = { startAt: string; endAt: string };
type Block = { weekday: number; startMinute: number; endMinute: number };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "Slots" button → dialog with the mentor's weekly hours and the free 60-min slots on a chosen day. */
export function MentorSlots({ mentor, blocks, user }: { mentor: { id: string; name: string; timezone: string }; blocks: Block[]; user: SessionUser }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => todayYmd(user.timezone));
  const [slots, setSlots] = useState<Slot[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setSlots(null);
    api<{ slots: Slot[] }>(`/api/slots?${new URLSearchParams({ mentorId: mentor.id, date })}`).then((d) => setSlots(d?.slots ?? []));
  }, [open, date, mentor.id, api]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost px-3 py-1.5 text-xs">Slots</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Availability — ${mentor.name}`} subtitle={`Weekly hours are set in ${mentor.timezone}; free slots below are shown in ${user.timezone}.`} className="max-w-lg">
        <div className="space-y-5">
          <div>
            <p className="eyebrow mb-2">Weekly hours</p>
            {blocks.length === 0 ? (
              <p className="text-sm italic text-neutral-400">This mentor hasn't set any hours yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3">
                {blocks.map((b, i) => (
                  <li key={i} className="rounded-lg bg-canvas px-3 py-1.5"><span className="font-semibold">{DAYS[b.weekday]}</span> <span className="text-neutral-600">{hhmm(b.startMinute)}–{hhmm(b.endMinute)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="eyebrow">Free slots</p>
              <input type="date" className="input w-auto py-1.5" value={date} min={todayYmd(user.timezone)} onChange={(e) => setDate(e.target.value)} />
            </div>
            {slots === null ? (
              <p className="py-2 text-sm text-neutral-400">Loading…</p>
            ) : slots.length === 0 ? (
              <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-neutral-500">No free slots that day.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => <span key={s.startAt} className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-semibold">{fmtTime(s.startAt, user.timezone)}</span>)}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
