import { beforeEach, describe, expect, test } from "bun:test";

import { prisma } from "./db.ts";
import {
  allGuilds,
  clearFired,
  deleteEvent,
  ensureGuild,
  getGuild,
  pruneFired,
  recordFired,
  reload,
  resetFired,
  saveEvent,
  saveGuildSettings,
} from "./store.ts";
import type { EventConfig } from "./types.ts";

function makeEvent(overrides: Partial<EventConfig> = {}): EventConfig {
  return {
    id: "evt001",
    name: "Bear Hunt 1",
    presetKey: "bear-hunt-1",
    emoji: "🐻",
    note: "First bear trap.",
    channelId: "chan-1",
    mentions: ["everyone", "role-9"],
    leadMinutes: [10, 5],
    announceAtStart: true,
    schedule: {
      kind: "interval",
      time: "20:00",
      timezone: "UTC",
      intervalDays: 2,
      anchorDate: "2026-08-06",
    },
    enabled: true,
    createdBy: "user-1",
    createdAt: "2026-08-07T00:00:00.000Z",
    fired: {},
    ...overrides,
  };
}

beforeEach(async () => {
  await prisma.firedReminder.deleteMany();
  await prisma.event.deleteMany();
  await prisma.guild.deleteMany();
  await reload();
});

describe("guild settings", () => {
  test("a new guild gets UTC defaults and is persisted", async () => {
    const guild = await ensureGuild("g1");
    expect(guild.timezone).toBe("UTC");
    expect(guild.events).toEqual([]);

    await reload();
    expect(getGuild("g1")?.timezone).toBe("UTC");
  });

  test("settings survive a reload", async () => {
    const guild = await ensureGuild("g1");
    guild.defaultChannelId = "chan-42";
    guild.adminRoleId = "role-7";
    guild.timezone = "Asia/Seoul";
    guild.locale = "en";
    await saveGuildSettings(guild);

    await reload();
    expect(getGuild("g1")).toMatchObject({
      defaultChannelId: "chan-42",
      adminRoleId: "role-7",
      timezone: "Asia/Seoul",
      locale: "en",
    });
  });

  test("ensureGuild returns the same instance for the same id", async () => {
    expect(await ensureGuild("g1")).toBe(await ensureGuild("g1"));
    expect(allGuilds()).toHaveLength(1);
  });
});

describe("events", () => {
  test("a saved event round-trips through the database intact", async () => {
    await ensureGuild("g1");
    const event = makeEvent();
    await saveEvent("g1", event);

    await reload();
    expect(getGuild("g1")?.events[0]).toEqual({ ...event, fired: {} });
  });

  test("saving an existing id updates instead of duplicating", async () => {
    await ensureGuild("g1");
    await saveEvent("g1", makeEvent());
    await saveEvent("g1", makeEvent({ name: "Bear Hunt 1 (late)", leadMinutes: [30] }));

    await reload();
    const events = getGuild("g1")?.events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("Bear Hunt 1 (late)");
    expect(events[0]?.leadMinutes).toEqual([30]);
  });

  test("saveEvent creates the guild row when it is missing", async () => {
    await saveEvent("g-new", makeEvent({ id: "solo" }));
    await reload();
    expect(getGuild("g-new")?.events.map((event) => event.id)).toEqual(["solo"]);
  });

  test("events are scoped to their guild", async () => {
    await ensureGuild("g1");
    await ensureGuild("g2");
    await saveEvent("g1", makeEvent({ id: "a" }));
    await saveEvent("g2", makeEvent({ id: "b", name: "Castle Battle" }));

    await reload();
    expect(getGuild("g1")?.events.map((event) => event.id)).toEqual(["a"]);
    expect(getGuild("g2")?.events.map((event) => event.id)).toEqual(["b"]);
  });

  test("deleting an event removes it from cache and database", async () => {
    await ensureGuild("g1");
    await saveEvent("g1", makeEvent());
    await deleteEvent("g1", "evt001");

    expect(getGuild("g1")?.events).toEqual([]);
    await reload();
    expect(getGuild("g1")?.events).toEqual([]);
  });
});

describe("fired ledger", () => {
  test("a recorded reminder survives a restart", async () => {
    await ensureGuild("g1");
    const event = makeEvent();
    await saveEvent("g1", event);
    await recordFired(event, "2026-08-08T20:00:00Z|10", new Date("2026-08-08T19:50:01.000Z"));

    await reload();
    expect(getGuild("g1")?.events[0]?.fired).toEqual({
      "2026-08-08T20:00:00Z|10": "2026-08-08T19:50:01.000Z",
    });
  });

  test("clearing a failed send lets it be retried", async () => {
    await ensureGuild("g1");
    const event = makeEvent();
    await saveEvent("g1", event);
    await recordFired(event, "k1", new Date("2026-08-08T19:50:01.000Z"));
    await clearFired(event, "k1");

    expect(event.fired).toEqual({});
    await reload();
    expect(getGuild("g1")?.events[0]?.fired).toEqual({});
  });

  test("resetFired wipes the ledger when a schedule changes", async () => {
    await ensureGuild("g1");
    const event = makeEvent();
    await saveEvent("g1", event);
    await recordFired(event, "k1", new Date("2026-08-08T19:50:01.000Z"));
    await recordFired(event, "k2", new Date("2026-08-08T19:55:01.000Z"));
    await resetFired(event);

    await reload();
    expect(getGuild("g1")?.events[0]?.fired).toEqual({});
  });

  test("pruneFired drops only entries older than the cutoff", async () => {
    await ensureGuild("g1");
    const event = makeEvent();
    await saveEvent("g1", event);
    await recordFired(event, "old", new Date("2026-07-01T00:00:00.000Z"));
    await recordFired(event, "new", new Date("2026-08-08T00:00:00.000Z"));

    await pruneFired(event, new Date("2026-08-01T00:00:00.000Z"));

    expect(Object.keys(event.fired)).toEqual(["new"]);
    await reload();
    expect(Object.keys(getGuild("g1")?.events[0]?.fired ?? {})).toEqual(["new"]);
  });

  test("deleting an event cascades its ledger away", async () => {
    await ensureGuild("g1");
    const event = makeEvent();
    await saveEvent("g1", event);
    await recordFired(event, "k1", new Date("2026-08-08T19:50:01.000Z"));

    await deleteEvent("g1", event.id);
    expect(await prisma.firedReminder.count()).toBe(0);
  });
});
