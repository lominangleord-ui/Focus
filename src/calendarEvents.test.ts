import { describe, expect, it } from "vitest";
import {
  isCalendarDateKey,
  normalizeCalendarEvents,
  pruneExpiredCalendarEvents,
  type CalendarEvent,
} from "./calendarEvents";

const today: CalendarEvent = {
  id: "today",
  title: "Planning review",
  date: "2026-11-05",
  createdAt: 10,
};
const future: CalendarEvent = {
  id: "future",
  title: "Design sync",
  date: "2026-11-08",
  createdAt: 20,
};
const expired: CalendarEvent = {
  id: "expired",
  title: "Yesterday's event",
  date: "2026-11-04",
  createdAt: 5,
};

describe("calendar event dates", () => {
  it("accepts real calendar dates and rejects malformed dates", () => {
    expect(isCalendarDateKey("2024-02-29")).toBe(true);
    expect(isCalendarDateKey("2026-11-05")).toBe(true);
    expect(isCalendarDateKey("2025-02-29")).toBe(false);
    expect(isCalendarDateKey("2026-13-01")).toBe(false);
    expect(isCalendarDateKey("2026-4-01")).toBe(false);
    expect(isCalendarDateKey(null)).toBe(false);
  });
});

describe("calendar event expiry and persistence", () => {
  it("keeps events happening today or later and removes past dates", () => {
    expect(pruneExpiredCalendarEvents([expired, today, future], "2026-11-05")).toEqual([today, future]);
  });

  it("normalizes persisted events and drops expired, duplicate, or invalid entries", () => {
    const events = normalizeCalendarEvents([
      expired,
      { ...today, title: "  Planning review  " },
      { ...future, id: "future-clean" },
      { ...future, id: "today" },
      { id: "bad-date", title: "Not a real date", date: "2026-02-30", createdAt: 30 },
      { id: "empty", title: "   ", date: "2026-11-09", createdAt: 40 },
      { id: "missing-date", title: "Missing date", createdAt: 50 },
      null,
    ], "2026-11-05");

    expect(events).toEqual([
      { ...today, title: "Planning review" },
      { ...future, id: "future-clean" },
    ]);
  });

  it("returns no entries for a non-array payload", () => {
    expect(normalizeCalendarEvents({ id: "one" }, "2026-11-05")).toEqual([]);
  });
});
