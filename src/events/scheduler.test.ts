import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";

import { dueReminders, reminderOffsets } from "./scheduler.ts";
import type { EventConfig } from "../types.ts";

const SEOUL = "Asia/Seoul";

/** Friday 2026-08-07, event starts 20:00 KST. */
function bearHunt(overrides: Partial<EventConfig> = {}): EventConfig {
  return {
    id: "test01",
    name: "Bear Hunt 1",
    presetKey: "bear-hunt-1",
    emoji: "🐻",
    channelId: "123",
    mentions: [],
    leadMinutes: [10, 5],
    announceAtStart: true,
    schedule: { kind: "daily", time: "20:00", timezone: SEOUL },
    enabled: true,
    createdBy: "1",
    createdAt: "2026-08-01T00:00:00Z",
    fired: {},
    ...overrides,
  };
}

function at(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: SEOUL }).toUTC();
}

describe("reminderOffsets", () => {
  test("includes the start announcement, largest lead first", () => {
    expect(reminderOffsets(bearHunt())).toEqual([10, 5, 0]);
  });

  test("omits the start announcement when disabled", () => {
    expect(reminderOffsets(bearHunt({ announceAtStart: false }))).toEqual([10, 5]);
  });
});

describe("dueReminders", () => {
  test("nothing is due well before the first lead time", () => {
    expect(dueReminders(bearHunt(), at("2026-08-07T19:30:00"))).toEqual([]);
  });

  test("the 10-minute reminder fires at T-10", () => {
    const due = dueReminders(bearHunt(), at("2026-08-07T19:50:05"));
    expect(due.map((item) => item.lead)).toEqual([10]);
    expect(due[0]?.occurrence.setZone(SEOUL).toFormat("HH:mm")).toBe("20:00");
  });

  test("the 5-minute reminder fires at T-5, not the 10 again", () => {
    const event = bearHunt();
    const first = dueReminders(event, at("2026-08-07T19:50:05"));
    for (const item of first) event.fired[item.key] = "2026-08-07T10:50:05Z";

    const second = dueReminders(event, at("2026-08-07T19:55:10"));
    expect(second.map((item) => item.lead)).toEqual([5]);
  });

  test("the start announcement fires at T-0", () => {
    const due = dueReminders(bearHunt(), at("2026-08-07T20:00:02"));
    expect(due.map((item) => item.lead)).toEqual([0]);
  });

  test("an already-sent reminder is never returned twice", () => {
    const event = bearHunt();
    const due = dueReminders(event, at("2026-08-07T19:50:05"));
    expect(due).toHaveLength(1);
    for (const item of due) event.fired[item.key] = "2026-08-07T10:50:05Z";
    expect(dueReminders(event, at("2026-08-07T19:50:35"))).toEqual([]);
    expect(dueReminders(event, at("2026-08-07T19:52:00"))).toEqual([]);
  });

  test("a missed reminder still fires inside the 3-minute catch-up window", () => {
    // Bot was down; first tick after restart lands 2 minutes late.
    const due = dueReminders(bearHunt(), at("2026-08-07T19:52:00"));
    expect(due.map((item) => item.lead)).toEqual([10]);
  });

  test("a long outage does not replay stale reminders", () => {
    // Restart 20 minutes after the event already started.
    expect(dueReminders(bearHunt(), at("2026-08-07T20:20:00"))).toEqual([]);
  });

  test("consecutive occurrences get independent ledger keys", () => {
    const event = bearHunt();
    const today = dueReminders(event, at("2026-08-07T19:50:05"));
    for (const item of today) event.fired[item.key] = "2026-08-07T10:50:05Z";

    const tomorrow = dueReminders(event, at("2026-08-08T19:50:05"));
    expect(tomorrow.map((item) => item.lead)).toEqual([10]);
    expect(tomorrow[0]?.key).not.toBe(today[0]?.key);
  });

  test("a long lead time is honoured", () => {
    const event = bearHunt({ leadMinutes: [120, 10], announceAtStart: false });
    expect(dueReminders(event, at("2026-08-07T18:00:10")).map((i) => i.lead)).toEqual([120]);
    expect(dueReminders(event, at("2026-08-07T19:50:10")).map((i) => i.lead)).toEqual([10]);
  });

  test("interval events fire only on their own cycle days", () => {
    const event = bearHunt({
      schedule: {
        kind: "interval",
        time: "20:00",
        timezone: SEOUL,
        intervalDays: 2,
        anchorDate: "2026-08-06",
      },
    });
    // 08-06 is a cycle day, so 08-07 is not and 08-08 is.
    expect(dueReminders(event, at("2026-08-07T19:50:05"))).toEqual([]);
    expect(dueReminders(event, at("2026-08-08T19:50:05")).map((i) => i.lead)).toEqual([10]);
  });
});
