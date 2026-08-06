import { DateTime } from "luxon";

import { WEEKDAY_LABELS } from "../lib/time.ts";
import type { EventSchedule } from "../types.ts";

/** How far ahead `nextOccurrences` will scan before giving up. */
const SCAN_DAYS = 400;

function atTime(day: DateTime, time: string): DateTime | null {
  const [hourPart, minutePart] = time.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const dt = day.set({ hour, minute, second: 0, millisecond: 0 });
  // A DST spring-forward can swallow the configured wall-clock time.
  return dt.isValid ? dt : null;
}

function matchesDay(schedule: EventSchedule, day: DateTime): boolean {
  switch (schedule.kind) {
    case "daily":
      return true;
    case "weekly":
      return (schedule.weekdays ?? []).includes(day.weekday);
    case "interval": {
      const interval = schedule.intervalDays ?? 2;
      const anchor = DateTime.fromISO(schedule.anchorDate ?? "", { zone: schedule.timezone });
      if (!anchor.isValid) return false;
      const elapsed = Math.round(day.startOf("day").diff(anchor.startOf("day"), "days").days);
      return elapsed >= 0 && elapsed % interval === 0;
    }
    case "once": {
      const date = DateTime.fromISO(schedule.anchorDate ?? "", { zone: schedule.timezone });
      return date.isValid && date.hasSame(day, "day");
    }
  }
}

/**
 * The next `count` start times at or after `from`, in chronological order.
 * Returned in UTC so callers can compare them without zone juggling.
 */
export function nextOccurrences(
  schedule: EventSchedule,
  from: DateTime = DateTime.utc(),
  count = 1,
): DateTime[] {
  const zone = schedule.timezone;
  const start = from.setZone(zone);
  if (!start.isValid) return [];

  const found: DateTime[] = [];
  let day = start.startOf("day");

  for (let i = 0; i < SCAN_DAYS && found.length < count; i += 1, day = day.plus({ days: 1 })) {
    if (!matchesDay(schedule, day)) continue;
    const occurrence = atTime(day, schedule.time);
    if (!occurrence) continue;
    if (occurrence < start) continue;
    found.push(occurrence.toUTC());
    if (schedule.kind === "once") break;
  }

  return found;
}

export function nextOccurrence(
  schedule: EventSchedule,
  from: DateTime = DateTime.utc(),
): DateTime | undefined {
  return nextOccurrences(schedule, from, 1)[0];
}

/** Human-readable recurrence, e.g. "Mon, Thu at 20:00 (Asia/Seoul)". */
export function describeSchedule(schedule: EventSchedule): string {
  const suffix = `at ${schedule.time} (${schedule.timezone})`;
  switch (schedule.kind) {
    case "daily":
      return `Every day ${suffix}`;
    case "weekly": {
      const days = (schedule.weekdays ?? [])
        .map((weekday) => WEEKDAY_LABELS[weekday - 1] ?? "?")
        .join(", ");
      return `${days || "—"} ${suffix}`;
    }
    case "interval":
      return `Every ${schedule.intervalDays ?? 2} days ${suffix} (from ${schedule.anchorDate})`;
    case "once":
      return `Once on ${schedule.anchorDate} ${suffix}`;
  }
}
