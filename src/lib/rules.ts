// Pure scheduling / video / streaming rules. No I/O — covered by rules.test.ts.

export const CLASS_MINUTES = 60;
export const JOIN_OPENS_BEFORE_MS = 10 * 60_000;
export const JOIN_CLOSES_AFTER_MS = 60 * 60_000;

export type Interval = { startAt: Date; endAt: Date };

/** Half-open interval overlap: a starts before b ends and ends after b starts. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.startAt < b.endAt && a.endAt > b.startAt;
}

export type JoinState = "early" | "open" | "ended";

export function joinState(cls: Interval, now: Date = new Date()): JoinState {
  const t = now.getTime();
  if (t < cls.startAt.getTime() - JOIN_OPENS_BEFORE_MS) return "early";
  if (t > cls.endAt.getTime() + JOIN_CLOSES_AFTER_MS) return "ended";
  return "open";
}

export type AvailabilityBlock = { weekday: number; startMinute: number; endMinute: number };

/**
 * Local wall-clock parts for an instant in a given IANA timezone.
 * Intl is the only tz database available without a dependency.
 */
export function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    weekday,
    year: +get("year"),
    month: +get("month"),
    day: +get("day"),
    minute: +get("hour") * 60 + +get("minute"),
  };
}

/** Instant corresponding to `minute` past midnight on `ymd` (YYYY-MM-DD) in `tz`. */
export function zonedMinuteToUtc(ymd: string, minute: number, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // Guess as if UTC, measure the tz offset Intl reports at that instant, correct once.
  const guess = new Date(Date.UTC(y, m - 1, d, 0, minute));
  const p = zonedParts(guess, tz);
  const offsetMs = Date.UTC(p.year, p.month - 1, p.day, 0, p.minute) - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Bookable 60-minute slots on `ymd` (in `tz`) that lie entirely within an availability
 * block and don't collide with `busy`. Starts land on :00 / :30.
 */
export function generateSlots(
  ymd: string,
  tz: string,
  availability: AvailabilityBlock[],
  busy: Interval[],
  now: Date = new Date(),
): Interval[] {
  const weekday = zonedParts(zonedMinuteToUtc(ymd, 12 * 60, tz), tz).weekday;
  const out: Interval[] = [];
  for (const block of availability) {
    if (block.weekday !== weekday) continue;
    const first = Math.ceil(block.startMinute / 30) * 30;
    for (let m = first; m + CLASS_MINUTES <= block.endMinute; m += 30) {
      const startAt = zonedMinuteToUtc(ymd, m, tz);
      const endAt = new Date(startAt.getTime() + CLASS_MINUTES * 60_000);
      const slot = { startAt, endAt };
      if (startAt <= now) continue;
      if (busy.some((b) => overlaps(slot, b))) continue;
      if (out.some((s) => s.startAt.getTime() === startAt.getTime())) continue;
      out.push(slot);
    }
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** True when startAt is on :00/:30 and endAt is exactly 60 minutes later. */
export function isValidClassInterval(i: Interval): boolean {
  const ms = i.startAt.getTime();
  return ms % (30 * 60_000) === 0 && i.endAt.getTime() - ms === CLASS_MINUTES * 60_000;
}

export type ByteRange = { start: number; end: number };

/**
 * Parse an HTTP Range header ("bytes=a-b", "bytes=a-", "bytes=-n") against `size`.
 * Returns null for absent/invalid/unsatisfiable ranges (caller sends 200 or 416).
 */
export function parseRange(header: string | null | undefined, size: number): ByteRange | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number, end: number;
  if (m[1] === "") {
    const suffix = Math.min(+m[2], size);
    start = size - suffix;
    end = size - 1;
  } else {
    start = +m[1];
    end = m[2] === "" ? size - 1 : Math.min(+m[2], size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}
