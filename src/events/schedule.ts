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
    case "monthlyDay": {
      // February has no 31st, so short months fall back to their last day
      // rather than skipping the event entirely.
      const wanted = schedule.dayOfMonth ?? 1;
      return day.day === Math.min(wanted, day.daysInMonth ?? 31);
    }
    case "monthlyWeekday": {
      if (day.weekday !== schedule.weekday) return false;
      const nth = schedule.nthWeek ?? 1;
      // The last matching weekday is the one with no same weekday after it.
      if (nth === -1) return day.day + 7 > (day.daysInMonth ?? 31);
      return Math.ceil(day.day / 7) === nth;
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

const ORDINALS: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  [-1]: "last",
};

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
    case "interval": {
      const days = schedule.intervalDays ?? 2;
      // A whole number of weeks reads better as weeks on a named day.
      if (days % 7 === 0) {
        const weeks = days / 7;
        const anchor = DateTime.fromISO(schedule.anchorDate ?? "", { zone: schedule.timezone });
        const weekday = anchor.isValid ? (WEEKDAY_LABELS[anchor.weekday - 1] ?? "") : "";
        const every = weeks === 1 ? "Every week" : `Every ${weeks} weeks`;
        return `${every}${weekday ? ` on ${weekday}` : ""} ${suffix} (from ${schedule.anchorDate})`;
      }
      return `Every ${days} days ${suffix} (from ${schedule.anchorDate})`;
    }
    case "once":
      return `Once on ${schedule.anchorDate} ${suffix}`;
    case "monthlyDay":
      return `Day ${schedule.dayOfMonth ?? 1} of every month ${suffix}`;
    case "monthlyWeekday": {
      const nth = ORDINALS[schedule.nthWeek ?? 1] ?? "1st";
      const weekday = WEEKDAY_LABELS[(schedule.weekday ?? 1) - 1] ?? "?";
      return `The ${nth} ${weekday} of every month ${suffix}`;
    }
  }
}
