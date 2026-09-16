// Display helpers — everything is stored UTC, shown in the viewer's timezone.

export function fmtDateTime(d: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(d));
}

export function fmtTime(d: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(d),
  );
}

export function fmtDate(d: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(
    new Date(d),
  );
}

/** Today's YYYY-MM-DD in `tz`, for <input type="date"> defaults. */
export function todayYmd(tz: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
