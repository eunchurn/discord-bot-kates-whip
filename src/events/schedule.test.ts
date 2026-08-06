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
});
