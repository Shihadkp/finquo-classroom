import { describe, expect, it } from "vitest";
import { generateSlots, isValidClassInterval, joinState, overlaps, parseRange, zonedMinuteToUtc } from "./rules";

const d = (iso: string) => new Date(iso);
const iv = (s: string, e: string) => ({ startAt: d(s), endAt: d(e) });

describe("overlaps", () => {
  const a = iv("2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z");
  it("detects partial and full overlap", () => {
    expect(overlaps(a, iv("2026-09-17T10:30:00Z", "2026-09-17T11:30:00Z"))).toBe(true);
    expect(overlaps(a, iv("2026-09-17T09:30:00Z", "2026-09-17T10:30:00Z"))).toBe(true);
    expect(overlaps(a, iv("2026-09-17T09:00:00Z", "2026-09-17T12:00:00Z"))).toBe(true);
    expect(overlaps(a, a)).toBe(true);
  });
  it("treats touching intervals as free", () => {
    expect(overlaps(a, iv("2026-09-17T11:00:00Z", "2026-09-17T12:00:00Z"))).toBe(false);
    expect(overlaps(a, iv("2026-09-17T09:00:00Z", "2026-09-17T10:00:00Z"))).toBe(false);
  });
});

describe("joinState", () => {
  const cls = iv("2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z");
  it("opens 10 minutes before start", () => {
    expect(joinState(cls, d("2026-09-17T09:49:59Z"))).toBe("early");
    expect(joinState(cls, d("2026-09-17T09:50:00Z"))).toBe("open");
  });
  it("closes 60 minutes after end", () => {
    expect(joinState(cls, d("2026-09-17T12:00:00Z"))).toBe("open");
    expect(joinState(cls, d("2026-09-17T12:00:01Z"))).toBe("ended");
  });
});

describe("generateSlots", () => {
  const tz = "Asia/Kolkata"; // UTC+5:30, no DST
  const early = d("2026-01-01T00:00:00Z");
  it("converts a zoned minute to the right instant", () => {
    // 2026-09-17 is a Thursday. 09:00 IST == 03:30Z
    expect(zonedMinuteToUtc("2026-09-17", 9 * 60, tz).toISOString()).toBe("2026-09-17T03:30:00.000Z");
    expect(zonedMinuteToUtc("2026-09-17", 0, "Europe/London").toISOString()).toBe("2026-09-16T23:00:00.000Z");
  });
  it("yields half-hour starts fully inside the block, sorted", () => {
    const slots = generateSlots("2026-09-17", tz, [{ weekday: 4, startMinute: 9 * 60, endMinute: 11 * 60 }], [], early);
    expect(slots.map((s) => s.startAt.toISOString())).toEqual([
      "2026-09-17T03:30:00.000Z",
      "2026-09-17T04:00:00.000Z",
      "2026-09-17T04:30:00.000Z",
    ]);
    expect(slots.every(isValidClassInterval)).toBe(true);
  });
  it("ignores other weekdays, rounds odd block starts up, removes busy and past slots", () => {
    const busy = [iv("2026-09-17T04:00:00Z", "2026-09-17T05:00:00Z")]; // 09:30–10:30 IST
    const slots = generateSlots(
      "2026-09-17",
      tz,
      [
        { weekday: 3, startMinute: 0, endMinute: 1440 },
        { weekday: 4, startMinute: 9 * 60 + 10, endMinute: 12 * 60 },
      ],
      busy,
      d("2026-09-17T03:45:00Z"), // 09:15 IST — 09:30 slot is still future but busy
    );
    expect(slots.map((s) => s.startAt.toISOString())).toEqual([
      "2026-09-17T05:00:00.000Z", // 10:30
      "2026-09-17T05:30:00.000Z", // 11:00
    ]);
  });
  it("rejects malformed intervals", () => {
    expect(isValidClassInterval(iv("2026-09-17T10:10:00Z", "2026-09-17T11:10:00Z"))).toBe(false);
    expect(isValidClassInterval(iv("2026-09-17T10:00:00Z", "2026-09-17T11:30:00Z"))).toBe(false);
  });
});

describe("parseRange", () => {
  it("handles the three forms", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });
  it("clamps the end and rejects unsatisfiable or invalid input", () => {
    expect(parseRange("bytes=0-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=1000-", 1000)).toBeNull();
    expect(parseRange("bytes=50-10", 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
  });
});
