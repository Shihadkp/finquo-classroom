"use client";

import { useState } from "react";
import { useApi } from "@/components/Toast";

type Block = { id: string; weekday: number; startMinute: number; endMinute: number };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 – 21:00 rows

export function WeekGrid({ initial }: { initial: Block[] }) {
  const api = useApi();
  const [blocks, setBlocks] = useState(initial);
  const [busy, setBusy] = useState(false);

  const covering = (weekday: number, minute: number) =>
    blocks.find((b) => b.weekday === weekday && b.startMinute <= minute && minute < b.endMinute);

  async function toggle(weekday: number, hour: number) {
    if (busy) return;
    setBusy(true);
    const start = hour * 60;
    const hit = covering(weekday, start);
    if (hit) {
      // Remove the hour: delete the block, re-add whatever remains on either side.
      if (await api(`/api/availability?id=${hit.id}`, { method: "DELETE" })) {
        const rest: Block[] = [];
        for (const [s, e] of [[hit.startMinute, start], [start + 60, hit.endMinute]]) {
          if (e - s >= 60) {
            const b = await api<Block>("/api/availability", { method: "POST", json: { weekday, startMinute: s, endMinute: e } });
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
      for (const old of [before, after]) if (old) await api(`/api/availability?id=${old.id}`, { method: "DELETE" });
      const b = await api<Block>("/api/availability", { method: "POST", json: { weekday, startMinute: s, endMinute: e } });
      setBlocks((bs) => [...bs.filter((x) => x !== before && x !== after), ...(b ? [b] : [])]);
    }
    setBusy(false);
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <thead>
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
                      className={`h-8 w-full rounded-md transition ${on ? "bg-accent hover:bg-accent-dark" : "bg-neutral-50 hover:bg-accent-soft"}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
