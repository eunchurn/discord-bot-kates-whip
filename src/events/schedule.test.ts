import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";

import { describeSchedule, nextOccurrences } from "./schedule.ts";
import type { EventSchedule } from "../types.ts";

const SEOUL = "Asia/Seoul";

/** 2026-08-07 is a Friday. */
const NOW = DateTime.fromISO("2026-08-07T10:00:00", { zone: SEOUL }).toUTC();

function seoulLocal(occurrence: DateTime): string {
  return occurrence.setZone(SEOUL).toFormat("yyyy-MM-dd HH:mm");
}

describe("weekly schedules", () => {
  const schedule: EventSchedule = {
    kind: "weekly",
    time: "20:00",
    timezone: SEOUL,
    weekdays: [1, 4], // Mon, Thu
  };

  test("returns the next matching weekdays in order", () => {
    const found = nextOccurrences(schedule, NOW, 3).map(seoulLocal);
    expect(found).toEqual(["2026-08-10 20:00", "2026-08-13 20:00", "2026-08-17 20:00"]);
  });

  test("today still counts when the time has not passed yet", () => {
    const friday: EventSchedule = { ...schedule, weekdays: [5] };
    const found = nextOccurrences(friday, NOW, 1).map(seoulLocal);
    expect(found).toEqual(["2026-08-07 20:00"]);
  });

  test("today is skipped once the time has passed", () => {
    const afterStart = DateTime.fromISO("2026-08-07T20:01:00", { zone: SEOUL }).toUTC();
    const friday: EventSchedule = { ...schedule, weekdays: [5] };
    const found = nextOccurrences(friday, afterStart, 1).map(seoulLocal);
    expect(found).toEqual(["2026-08-14 20:00"]);
  });
});

describe("interval schedules (Bear Hunt)", () => {
  const schedule: EventSchedule = {
    kind: "interval",
    time: "21:00",
    timezone: SEOUL,
    intervalDays: 2,
    anchorDate: "2026-08-06",
  };

  test("repeats every two days from the anchor", () => {
    const found = nextOccurrences(schedule, NOW, 3).map(seoulLocal);
    expect(found).toEqual(["2026-08-08 21:00", "2026-08-10 21:00", "2026-08-12 21:00"]);
  });

  test("an anchor on today fires today when the time is still ahead", () => {
    const today: EventSchedule = { ...schedule, anchorDate: "2026-08-07" };
    const found = nextOccurrences(today, NOW, 2).map(seoulLocal);
    expect(found).toEqual(["2026-08-07 21:00", "2026-08-09 21:00"]);
  });

  test("Bear Hunt 2 offset by one day never collides with Bear Hunt 1", () => {
    const bear1 = nextOccurrences(schedule, NOW, 5).map(seoulLocal);
    const bear2 = nextOccurrences({ ...schedule, anchorDate: "2026-08-07" }, NOW, 5).map(seoulLocal);
    expect(bear1.filter((slot) => bear2.includes(slot))).toEqual([]);
  });
});

describe("daily and once", () => {
  test("daily returns consecutive days", () => {
    const schedule: EventSchedule = { kind: "daily", time: "07:00", timezone: SEOUL };
    const found = nextOccurrences(schedule, NOW, 2).map(seoulLocal);
    expect(found).toEqual(["2026-08-08 07:00", "2026-08-09 07:00"]);
  });

  test("once returns at most one occurrence", () => {
    const schedule: EventSchedule = {
      kind: "once",
      time: "18:30",
      timezone: SEOUL,
      anchorDate: "2026-08-20",
    };
    const found = nextOccurrences(schedule, NOW, 5).map(seoulLocal);
    expect(found).toEqual(["2026-08-20 18:30"]);
  });

  test("a past one-off returns nothing", () => {
    const schedule: EventSchedule = {
      kind: "once",
      time: "18:30",
      timezone: SEOUL,
      anchorDate: "2026-01-01",
    };
    expect(nextOccurrences(schedule, NOW, 5)).toEqual([]);
  });
});

describe("monthly by day of the month", () => {
  const schedule: EventSchedule = {
    kind: "monthlyDay",
    time: "20:00",
    timezone: SEOUL,
    dayOfMonth: 15,
  };

  test("fires on that day every month", () => {
    expect(nextOccurrences(schedule, NOW, 3).map(seoulLocal)).toEqual([
      "2026-08-15 20:00",
      "2026-09-15 20:00",
      "2026-10-15 20:00",
    ]);
  });

  test("a day past this month rolls to the next", () => {
    const first: EventSchedule = { ...schedule, dayOfMonth: 1 };
    expect(nextOccurrences(first, NOW, 2).map(seoulLocal)).toEqual([
      "2026-09-01 20:00",
      "2026-10-01 20:00",
    ]);
  });

  test("the 31st falls back to the last day of short months", () => {
    const last: EventSchedule = { ...schedule, dayOfMonth: 31 };
    const found = nextOccurrences(last, NOW, 8).map(seoulLocal);
    expect(found.slice(0, 3)).toEqual([
      "2026-08-31 20:00",
      "2026-09-30 20:00", // September has 30 days
      "2026-10-31 20:00",
    ]);
    // 2027 is not a leap year, so February clamps to the 28th.
    expect(found).toContain("2027-02-28 20:00");
  });
});

describe("monthly by nth weekday (Tri-Alliance Clash)", () => {
  test("the 2nd Saturday of each month", () => {
    const schedule: EventSchedule = {
      kind: "monthlyWeekday",
      time: "13:00",
      timezone: "UTC",
      nthWeek: 2,
      weekday: 6,
    };
    const found = nextOccurrences(schedule, NOW, 3);
    expect(found.map((o) => o.setZone("UTC").toFormat("yyyy-MM-dd"))).toEqual([
      "2026-08-08",
      "2026-09-12",
      "2026-10-10",
    ]);
    for (const occurrence of found) expect(occurrence.setZone("UTC").weekday).toBe(6);
  });

  test("the last Sunday of each month", () => {
    const schedule: EventSchedule = {
      kind: "monthlyWeekday",
      time: "13:00",
      timezone: "UTC",
      nthWeek: -1,
      weekday: 7,
    };
    const found = nextOccurrences(schedule, NOW, 3);
    expect(found.map((o) => o.setZone("UTC").toFormat("yyyy-MM-dd"))).toEqual([
      "2026-08-30",
      "2026-09-27",
      "2026-10-25",
    ]);
    // "Last" means no further same weekday remains in that month.
    for (const occurrence of found) {
      const day = occurrence.setZone("UTC");
      expect(day.weekday).toBe(7);
      expect(day.day + 7).toBeGreaterThan(day.daysInMonth ?? 31);
    }
  });

  test("a 5th weekday only fires in months that have one", () => {
    const schedule: EventSchedule = {
      kind: "monthlyWeekday",
      time: "13:00",
      timezone: "UTC",
      nthWeek: 5,
      weekday: 1, // Monday
    };
    const found = nextOccurrences(schedule, NOW, 3).map((o) =>
      o.setZone("UTC").toFormat("yyyy-MM-dd"),
    );
    expect(found).toEqual(["2026-08-31", "2026-11-30", "2027-03-29"]);
  });
});

describe("fortnightly (Swordland Showdown)", () => {
  test("every 2 weeks always lands on the anchor's weekday", () => {
    // 2026-08-09 is a Sunday.
    const schedule: EventSchedule = {
      kind: "interval",
      time: "13:00",
      timezone: "UTC",
      intervalDays: 14,
      anchorDate: "2026-08-09",
    };
    const found = nextOccurrences(schedule, NOW, 4);
    expect(found.map((o) => o.setZone("UTC").toFormat("yyyy-MM-dd"))).toEqual([
      "2026-08-09",
      "2026-08-23",
      "2026-09-06",
      "2026-09-20",
    ]);
    for (const occurrence of found) expect(occurrence.setZone("UTC").weekday).toBe(7);
  });

  test("it skips the intervening week", () => {
    const schedule: EventSchedule = {
      kind: "interval",
      time: "13:00",
      timezone: "UTC",
      intervalDays: 14,
      anchorDate: "2026-08-09",
    };
    const dates = nextOccurrences(schedule, NOW, 4).map((o) =>
      o.setZone("UTC").toFormat("yyyy-MM-dd"),
    );
    expect(dates).not.toContain("2026-08-16");
  });
});

describe("UTC server time (the default)", () => {
  const schedule: EventSchedule = { kind: "weekly", time: "20:00", timezone: "UTC", weekdays: [1] };

  test("20:00 UTC stays 20:00 UTC year round", () => {
    const found = nextOccurrences(schedule, NOW, 3);
    expect(found.map((o) => o.toUTC().toFormat("HH:mm"))).toEqual(["20:00", "20:00", "20:00"]);
    // Monday, in UTC.
    expect(found.map((o) => o.toUTC().weekday)).toEqual([1, 1, 1]);
  });

  test("a KST viewer sees it at 05:00 the next day", () => {
    const [first] = nextOccurrences(schedule, NOW, 1);
    expect(first?.setZone(SEOUL).toFormat("yyyy-MM-dd HH:mm")).toBe("2026-08-11 05:00");
  });
});

describe("timezones", () => {
  test("the stored zone wins, not the caller's zone", () => {
    const schedule: EventSchedule = {
      kind: "daily",
      time: "20:00",
      timezone: "America/New_York",
    };
    const [first] = nextOccurrences(schedule, NOW, 1);
    expect(first?.setZone("America/New_York").toFormat("HH:mm")).toBe("20:00");
    // 20:00 EDT is 09:00 the next day in Seoul.
    expect(first?.setZone(SEOUL).toFormat("HH:mm")).toBe("09:00");
  });

  test("survives a DST transition", () => {
    // US DST ends 2026-11-01; a 01:30 local time is ambiguous that day.
    const schedule: EventSchedule = {
      kind: "daily",
      time: "01:30",
      timezone: "America/New_York",
    };
    const from = DateTime.fromISO("2026-10-30T12:00:00", { zone: "America/New_York" }).toUTC();
    const found = nextOccurrences(schedule, from, 4);
    expect(found).toHaveLength(4);
    for (const occurrence of found) {
      expect(occurrence.setZone("America/New_York").toFormat("HH:mm")).toBe("01:30");
    }
  });
});

describe("describeSchedule", () => {
  test("renders each kind", () => {
    expect(
      describeSchedule({ kind: "weekly", time: "20:00", timezone: SEOUL, weekdays: [1, 4] }),
    ).toBe("Mon, Thu at 20:00 (Asia/Seoul)");
    expect(describeSchedule({ kind: "daily", time: "07:00", timezone: SEOUL })).toBe(
      "Every day at 07:00 (Asia/Seoul)",
    );
    expect(
      describeSchedule({
        kind: "interval",
        time: "21:00",
        timezone: SEOUL,
        intervalDays: 2,
        anchorDate: "2026-08-06",
      }),
    ).toBe("Every 2 days at 21:00 (Asia/Seoul) (from 2026-08-06)");
  });

  test("whole weeks read as weeks on a named day", () => {
    expect(
      describeSchedule({
        kind: "interval",
        time: "13:00",
        timezone: "UTC",
        intervalDays: 14,
        anchorDate: "2026-08-09", // a Sunday
      }),
    ).toBe("Every 2 weeks on Sun at 13:00 (UTC) (from 2026-08-09)");
  });

  test("monthly kinds", () => {
    expect(
      describeSchedule({ kind: "monthlyDay", time: "13:00", timezone: "UTC", dayOfMonth: 15 }),
    ).toBe("Day 15 of every month at 13:00 (UTC)");

    expect(
      describeSchedule({
        kind: "monthlyWeekday",
        time: "13:00",
        timezone: "UTC",
        nthWeek: 2,
        weekday: 6,
      }),
    ).toBe("The 2nd Sat of every month at 13:00 (UTC)");

    expect(
      describeSchedule({
        kind: "monthlyWeekday",
        time: "13:00",
        timezone: "UTC",
        nthWeek: -1,
        weekday: 7,
      }),
    ).toBe("The last Sun of every month at 13:00 (UTC)");
  });
});
