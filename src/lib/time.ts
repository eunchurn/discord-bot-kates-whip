import { DateTime } from "luxon";

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WEEKDAY_ALIASES: Record<string, number> = {
  mon: 1, monday: 1, "월": 1, "월요일": 1,
  tue: 2, tues: 2, tuesday: 2, "화": 2, "화요일": 2,
  wed: 3, weds: 3, wednesday: 3, "수": 3, "수요일": 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, "목": 4, "목요일": 4,
  fri: 5, friday: 5, "금": 5, "금요일": 5,
  sat: 6, saturday: 6, "토": 6, "토요일": 6,
  sun: 7, sunday: 7, "일": 7, "일요일": 7,
};

const NTH_ALIASES: Record<string, number> = {
  "1st": 1, first: 1, "1": 1, "첫째": 1, "첫": 1,
  "2nd": 2, second: 2, "2": 2, "둘째": 2,
  "3rd": 3, third: 3, "3": 3, "셋째": 3,
  "4th": 4, fourth: 4, "4": 4, "넷째": 4,
  "5th": 5, fifth: 5, "5": 5, "다섯째": 5,
  last: -1, "마지막": -1,
};

export type ParsedDays =
  | { kind: "daily" }
  | { kind: "weekly"; weekdays: number[] }
  /** `alignWeekday` snaps the anchor forward to that weekday, for fortnights. */
  | { kind: "interval"; intervalDays: number; alignWeekday?: number }
  | { kind: "monthlyDay"; dayOfMonth?: number }
  | { kind: "monthlyWeekday"; nthWeek: number; weekday: number };

/**
 * Accepts:
 *   "mon,thu"          -> weekly on Monday and Thursday
 *   "daily"            -> every day
 *   "every2" / "2d"    -> every second day
 *   "every2w" / "2w"   -> every second week, aligned to the anchor's weekday
 *   "every2w:sun"      -> every second Sunday
 *   "monthly"          -> monthly, on the anchor's day of the month
 *   "monthly:15"       -> the 15th of every month
 *   "monthly:2nd-sat"  -> the second Saturday of every month
 *   "monthly:last-sun" -> the last Sunday of every month
 */
export function parseDays(input: string): ParsedDays | { error: string } {
  const raw = input.trim().toLowerCase();
  if (!raw) return { error: "No schedule given." };

  if (["daily", "everyday", "every day", "매일"].includes(raw)) {
    return { kind: "daily" };
  }

  // Weeks before days, so "2w" is not read as a bare number.
  const weeks = raw.match(/^(?:every\s*)?(\d+)\s*w(?:eeks?)?(?:\s*[:\-]\s*([a-z가-힣]+))?$/);
  if (weeks) {
    const count = Number(weeks[1]);
    if (!Number.isInteger(count) || count < 1 || count > 8) {
      return { error: "Week interval must be between 1 and 8 weeks." };
    }
    const alignToken = weeks[2];
    if (alignToken !== undefined) {
      const weekday = WEEKDAY_ALIASES[alignToken];
      if (!weekday) return { error: `Could not read the weekday \`${alignToken}\`.` };
      return { kind: "interval", intervalDays: count * 7, alignWeekday: weekday };
    }
    return { kind: "interval", intervalDays: count * 7 };
  }

  if (raw === "monthly" || raw === "매월" || raw === "매달") {
    return { kind: "monthlyDay" };
  }

  const monthly = raw.match(/^(?:monthly|매월|매달)\s*[:\-]\s*(.+)$/);
  if (monthly) {
    const spec = monthly[1]!.trim();

    const dayOnly = spec.match(/^(\d{1,2})(?:st|nd|rd|th|일)?$/);
    if (dayOnly) {
      const day = Number(dayOnly[1]);
      if (day < 1 || day > 31) return { error: "Day of the month must be 1–31." };
      return { kind: "monthlyDay", dayOfMonth: day };
    }

    const nthWeekday = spec.match(/^([a-z0-9가-힣]+)\s*[-\s]\s*([a-z가-힣]+)$/);
    if (nthWeekday) {
      const nth = NTH_ALIASES[nthWeekday[1]!];
      const weekday = WEEKDAY_ALIASES[nthWeekday[2]!];
      if (nth === undefined) {
        return { error: `Could not read \`${nthWeekday[1]}\`. Use \`1st\`–\`5th\` or \`last\`.` };
      }
      if (!weekday) return { error: `Could not read the weekday \`${nthWeekday[2]}\`.` };
      return { kind: "monthlyWeekday", nthWeek: nth, weekday };
    }

    return {
      error: `Could not read \`${spec}\`. Use \`monthly:15\`, \`monthly:2nd-sat\` or \`monthly:last-sun\`.`,
    };
  }

  const interval = raw.match(/^every\s*(\d+)\s*(?:d|days?)?$|^(\d+)\s*d(?:ays?)?$/);
  if (interval) {
    const days = Number(interval[1] ?? interval[2]);
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      return { error: "Interval must be between 1 and 60 days." };
    }
    return days === 1 ? { kind: "daily" } : { kind: "interval", intervalDays: days };
  }

  const tokens = raw.split(/[\s,/|]+/).filter(Boolean);
  const weekdays: number[] = [];
  for (const token of tokens) {
    const weekday = WEEKDAY_ALIASES[token];
    if (!weekday) {
      return {
        error:
          `Could not read \`${token}\`. Use weekdays (\`mon,thu\`), \`daily\`, \`every2\`, ` +
          "`every2w`, or `monthly:2nd-sat`.",
      };
    }
    if (!weekdays.includes(weekday)) weekdays.push(weekday);
  }
  if (weekdays.length === 0) return { error: "No weekday recognised." };
  return { kind: "weekly", weekdays: weekdays.sort((a, b) => a - b) };
}

/** Parse "20:00", "8:5", "0930" or "8pm" into a normalised "HH:mm". */
export function parseTime(input: string): string | { error: string } {
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");

  const ampm = raw.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59) return { error: `Invalid time \`${input}\`.` };
    if (ampm[3] === "pm" && hour !== 12) hour += 12;
    if (ampm[3] === "am" && hour === 12) hour = 0;
    return format(hour, minute);
  }

  const colon = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour > 23 || minute > 59) return { error: `Invalid time \`${input}\`.` };
    return format(hour, minute);
  }

  const compact = raw.match(/^(\d{3,4})$/);
  if (compact) {
    const value = compact[1]!.padStart(4, "0");
    const hour = Number(value.slice(0, 2));
    const minute = Number(value.slice(2));
    if (hour > 23 || minute > 59) return { error: `Invalid time \`${input}\`.` };
    return format(hour, minute);
  }

  return { error: `Could not read time \`${input}\`. Use \`HH:mm\`, e.g. \`20:00\`.` };
}

function format(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Parse "10,5" into a descending, de-duplicated list of lead minutes. */
export function parseLeadMinutes(input: string): number[] | { error: string } {
  const parts = input.split(/[\s,]+/).filter(Boolean);
  const minutes: number[] = [];
  for (const part of parts) {
    const value = Number(part.replace(/m(in(utes?)?)?$/i, ""));
    if (!Number.isInteger(value) || value < 0 || value > 1440) {
      return { error: `\`${part}\` is not a valid lead time (0–1440 minutes).` };
    }
    if (!minutes.includes(value)) minutes.push(value);
  }
  if (minutes.length === 0) return { error: "No reminder times given." };
  return minutes.sort((a, b) => b - a);
}

export function isValidTimezone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

/** IANA zones supported by the runtime, for slash-command autocomplete. */
export function listTimezones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported("timeZone");
    } catch {
      /* fall through */
    }
  }
  return [
    "Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Asia/Manila",
    "Asia/Jakarta", "Asia/Kolkata", "Asia/Dubai", "Europe/London", "Europe/Berlin",
    "Europe/Paris", "Europe/Moscow", "America/New_York", "America/Chicago",
    "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Australia/Sydney",
    "UTC",
  ];
}

/** Discord renders this as localised, per-viewer time. */
export function discordTimestamp(dt: DateTime, style: "f" | "F" | "R" | "t" = "f"): string {
  return `<t:${Math.floor(dt.toSeconds())}:${style}>`;
}
