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

describe("no text that decays once the start passes", () => {
  test("no reminder carries a relative timestamp", () => {
    // Discord re-renders `<t:…:R>` live, so it would turn into "5 minutes ago"
    // under a "time remaining" label. The headline carries the countdown
    // instead, and it is frozen at send time.
    for (const lead of [0, 5, 10, 60, 1440]) {
      for (const locale of ["ko", "en"] as const) {
        const { embed } = buildReminder(bearHunt(), OCCURRENCE, lead, locale);
        expect(JSON.stringify(embed.toJSON())).not.toMatch(/<t:\d+:R>/);
      }
    }
  });

  test("the only scheduling field is the absolute start time", () => {
    for (const lead of [0, 10]) {
      const names = fields(lead).map((field) => field.name);
      expect(names).not.toContain("남은 시간");
      expect(names).not.toContain("상태");
      expect(names[0]).toBe("시작 시각");
    }
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

  test("T-0 states the event has started, in the past tense", () => {
    expect(buildReminder(bearHunt(), OCCURRENCE, 0, "ko").embed.toJSON().description)
      .toContain("이벤트 시작됨.");
    expect(buildReminder(bearHunt(), OCCURRENCE, 0, "en").embed.toJSON().description)
      .toContain("Event started.");
  });

  test("the ping line repeats the headline", () => {
    const { content } = buildReminder(bearHunt({ mentions: ["7"] }), OCCURRENCE, 0, "ko");
    expect(content).toBe("<@&7> 🐻 **Bear Hunt 1** — 이벤트 시작됨.");
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
