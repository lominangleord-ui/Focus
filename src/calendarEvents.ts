export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  createdAt: number;
};

/** Validate a local calendar date stored as YYYY-MM-DD. */
export function isCalendarDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= daysInMonth;
}

/** Keep today's and future events; an event expires at the start of the next local date. */
export function pruneExpiredCalendarEvents(events: readonly CalendarEvent[], today: string): CalendarEvent[] {
  return events.filter((event) => event.date >= today);
}

/** Normalize persisted event data and discard invalid or already-expired entries. */
export function normalizeCalendarEvents(value: unknown, today: string): CalendarEvent[] {
  if (!Array.isArray(value) || !isCalendarDateKey(today)) return [];

  const seenIds = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim().slice(0, 120) : "";
    const title = typeof candidate.title === "string" ? candidate.title.trim().slice(0, 140) : "";
    const date = candidate.date;
    if (!id || seenIds.has(id) || !title || !isCalendarDateKey(date) || date < today) continue;

    seenIds.add(id);
    events.push({
      id,
      title,
      date,
      createdAt: typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : 0,
    });
  }
  return events;
}
