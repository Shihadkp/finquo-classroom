"use client";

import { useState } from "react";
import { useApi, useToast } from "@/components/Toast";

type Block = { id: string; weekday: number; startMinute: number; endMinute: number };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i); // full day, so early mornings and late evenings are bookable

/** Presets: one click instead of 168 clicks. */
const PRESETS: { label: string; hint: string; days: number[]; from: number; to: number }[] = [
  { label: "All day, every day", hint: "00:00 – 24:00, Sun–Sat", days: [0, 1, 2, 3, 4, 5, 6], from: 0, to: 24 },
  { label: "Every day 8–22", hint: "Waking hours, all week", days: [0, 1, 2, 3, 4, 5, 6], from: 8, to: 22 },
  { label: "Weekdays 9–17", hint: "Mon–Fri office hours", days: [1, 2, 3, 4, 5], from: 9, to: 17 },
];

export function WeekGrid({ initial, mentorId }: { initial: Block[]; mentorId?: string }) {
  const api = useApi();
  const toast = useToast();
  const [blocks, setBlocks] = useState(initial);
  const [busy, setBusy] = useState(false);
  const owner = mentorId ? { mentorId } : {};
  const q = mentorId ? `&mentorId=${mentorId}` : "";

  const covering = (weekday: number, minute: number) =>
    blocks.find((b) => b.weekday === weekday && b.startMinute <= minute && minute < b.endMinute);

  async function toggle(weekday: number, hour: number) {
    if (busy) return;
    setBusy(true);
    const start = hour * 60;
    const hit = covering(weekday, start);
    if (hit) {
      // Remove the hour: delete the block, re-add whatever remains on either side.
      if (await api(`/api/availability?id=${hit.id}${q}`, { method: "DELETE" })) {
        const rest: Block[] = [];
        for (const [s, e] of [[hit.startMinute, start], [start + 60, hit.endMinute]]) {
          if (e - s >= 60) {
            const b = await api<Block>("/api/availability", { method: "POST", json: { ...owner, weekday, startMinute: s, endMinute: e } });
            if (b) rest.push(b);
          }
        }
        setBlocks((bs) => [...bs.filter((b) => b.id !== hit.id), ...rest]);
      }
    } else {
      // Add the hour, merging with neighbours so slot generation sees one continuous block.
      const before = covering(weekday, start - 1);
      const after = covering(weekday, start + 60);
      const s = before ? before.startMinute : start;
      const e = after ? after.endMinute : start + 60;
      for (const old of [before, after]) if (old) await api(`/api/availability?id=${old.id}${q}`, { method: "DELETE" });
      const b = await api<Block>("/api/availability", { method: "POST", json: { ...owner, weekday, startMinute: s, endMinute: e } });
      setBlocks((bs) => [...bs.filter((x) => x !== before && x !== after), ...(b ? [b] : [])]);
    }
    setBusy(false);
  }

  /** Replace the whole week with one preset (or clear it). */
  async function apply(preset?: (typeof PRESETS)[number]) {
    if (busy) return;
    if (!preset && !confirm("Clear all availability? Existing booked classes are not affected.")) return;
    setBusy(true);
    const cleared = await api<{ cleared: number }>(`/api/availability?all=1${q}`, { method: "DELETE" });
    if (!cleared) return setBusy(false);
    const made: Block[] = [];
    if (preset) {
      for (const weekday of preset.days) {
        const b = await api<Block>("/api/availability", { method: "POST", json: { ...owner, weekday, startMinute: preset.from * 60, endMinute: preset.to * 60 } });
        if (b) made.push(b);
      }
    }
    setBlocks(made);
    setBusy(false);
    toast(preset ? `Set to ${preset.label.toLowerCase()}.` : "Availability cleared.", "ok");
  }

  const hours = blocks.reduce((n, b) => n + (b.endMinute - b.startMinute) / 60, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" disabled={busy} onClick={() => apply(p)} title={p.hint} className="btn-ghost text-xs">{p.label}</button>
        ))}
        <button type="button" disabled={busy} onClick={() => apply()} className="btn-danger text-xs">Clear all</button>
        <span className="ml-auto text-xs text-neutral-500">{hours}h open per week</span>
      </div>

      <div className="card max-h-[70vh] overflow-auto p-0">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="w-16" />
              {DAYS.map((d) => (
                <th key={d} className="py-3 text-xs font-medium uppercase tracking-wider text-neutral-500">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h} className="border-t border-neutral-100">
                <td className="py-1 pr-3 text-right text-xs text-neutral-400">{String(h).padStart(2, "0")}:00</td>
                {DAYS.map((_, weekday) => {
                  const on = !!covering(weekday, h * 60);
                  return (
                    <td key={weekday} className="p-0.5">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${DAYS[weekday]} ${h}:00`}
                        disabled={busy}
                        onClick={() => toggle(weekday, h)}
                        className={`h-7 w-full rounded-md transition ${on ? "bg-accent hover:bg-accent-dark" : "bg-neutral-50 hover:bg-accent-soft"}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
