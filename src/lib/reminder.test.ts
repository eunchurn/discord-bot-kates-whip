import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";

import { buildMentionLine, buildReminder } from "./reminder.ts";
import type { EventConfig } from "../types.ts";

const OCCURRENCE = DateTime.fromISO("2026-08-07T13:00:00Z").toUTC();

function bearHunt(overrides: Partial<EventConfig> = {}): EventConfig {
  return {
    id: "e1",
    name: "Bear Hunt 1",
    presetKey: "bear-hunt-1",
    emoji: "🐻",
    note: "First bear trap.",
    channelId: "c1",
    mentions: [],
    leadMinutes: [10, 5],
    announceAtStart: true,
    schedule: { kind: "interval", time: "13:00", timezone: "UTC", intervalDays: 2 },
    enabled: true,
    createdBy: "u1",
    createdAt: "2026-08-01T00:00:00.000Z",
    fired: {},
    ...overrides,
  };
}

function fields(lead: number, locale: "ko" | "en" = "ko") {
  const { embed } = buildReminder(bearHunt(), OCCURRENCE, lead, locale);
  return embed.toJSON().fields ?? [];
}

describe("countdown vs started", () => {
  test("a lead-time reminder counts down with a live timestamp", () => {
    const relative = fields(10).find((field) => field.name === "남은 시간");
    expect(relative?.value).toBe(`<t:${OCCURRENCE.toSeconds()}:R>`);
  });

  test("the start announcement says it started instead of counting down", () => {
    const names = fields(0).map((field) => field.name);
    expect(names).toContain("상태");
    expect(names).not.toContain("남은 시간");

    const status = fields(0).find((field) => field.name === "상태");
    expect(status?.value).toContain("시작됨");
  });

  test("no field carries a bare relative timestamp at T-0", () => {
    // A `<t:…:R>` here would render as "5 minutes ago" once the start passes.
    for (const field of fields(0)) {
      expect(field.value).not.toMatch(/<t:\d+:R>/);
    }
  });

  test("English keeps the same behaviour", () => {
    expect(fields(10, "en").map((f) => f.name)).toContain("Countdown");
    const names = fields(0, "en").map((field) => field.name);
    expect(names).toContain("Status");
    expect(names).not.toContain("Countdown");
  });
});

describe("headline", () => {
  test("lead times read as time remaining", () => {
    expect(buildReminder(bearHunt(), OCCURRENCE, 10, "ko").embed.toJSON().description)
      .toContain("10분 후 시작합니다!");
    expect(buildReminder(bearHunt(), OCCURRENCE, 90, "ko").embed.toJSON().description)
      .toContain("1시간 30분 후");
    expect(buildReminder(bearHunt(), OCCURRENCE, 120, "en").embed.toJSON().description)
      .toContain("Starts in 2h");
  });

  test("T-0 announces the start", () => {
    expect(buildReminder(bearHunt(), OCCURRENCE, 0, "ko").embed.toJSON().description)
      .toContain("지금 시작합니다!");
    expect(buildReminder(bearHunt(), OCCURRENCE, 0, "en").embed.toJSON().description)
      .toContain("Starting now!");
  });
});

describe("absolute time", () => {
  test("UTC is labelled as the Kingshot server time", () => {
    const startsAt = fields(0).find((field) => field.name === "시작 시각");
    expect(startsAt?.value).toContain("2026-08-07 13:00");
    expect(startsAt?.value).toContain("서버 시간, UTC");
  });

  test("a non-UTC schedule shows its own zone name", () => {
    const event = bearHunt({
      schedule: { kind: "daily", time: "22:00", timezone: "Asia/Seoul" },
    });
    const { embed } = buildReminder(event, OCCURRENCE, 5, "ko");
    const startsAt = embed.toJSON().fields?.find((field) => field.name === "시작 시각");
    expect(startsAt?.value).toContain("Asia/Seoul");
    expect(startsAt?.value).toContain("2026-08-07 22:00");
  });
});

describe("mentions", () => {
  test("roles and everyone render as pings", () => {
    expect(buildMentionLine(bearHunt({ mentions: ["everyone", "123"] }))).toBe(
      "@everyone <@&123>",
    );
    expect(buildMentionLine(bearHunt())).toBe("");
  });

  test("content is empty when nothing is pinged", () => {
    expect(buildReminder(bearHunt(), OCCURRENCE, 5, "ko").content).toBe("");
    expect(buildReminder(bearHunt({ mentions: ["9"] }), OCCURRENCE, 5, "ko").content).toContain(
      "<@&9>",
    );
  });
});
