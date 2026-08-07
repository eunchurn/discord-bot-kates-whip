import { DEFAULT_ADMIN_ROLE_ID, DEFAULT_TIMEZONE } from "./config.ts";
import { prisma } from "./db.ts";
import type { EventModel, GuildModel } from "./generated/prisma/models.ts";
import type { EventConfig, EventSchedule, GuildConfig } from "./types.ts";

type EventRowWithFired = EventModel & {
  fired: { key: string; firedAt: Date }[];
};

/* ------------------------------------------------------------ row mapping */

function toGuild(row: GuildModel): GuildConfig {
  return {
    guildId: row.id,
    timezone: row.timezone,
    defaultChannelId: row.defaultChannelId ?? undefined,
    adminRoleId: row.adminRoleId ?? undefined,
    locale: row.locale === "en" ? "en" : "ko",
    events: [],
  };
}

function toEvent(row: EventRowWithFired): EventConfig {
  const fired: Record<string, string> = {};
  for (const entry of row.fired) fired[entry.key] = entry.firedAt.toISOString();

  return {
    id: row.id,
    name: row.name,
    presetKey: row.presetKey,
    emoji: row.emoji,
    note: row.note ?? undefined,
    channelId: row.channelId,
    mentions: JSON.parse(row.mentions) as string[],
    leadMinutes: JSON.parse(row.leadMinutes) as number[],
    announceAtStart: row.announceAtStart,
    schedule: JSON.parse(row.schedule) as EventSchedule,
    enabled: row.enabled,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    fired,
  };
}

/** The column payload shared by create and update. */
function eventData(guildId: string, event: EventConfig) {
  return {
    guildId,
    name: event.name,
    presetKey: event.presetKey,
    emoji: event.emoji,
    note: event.note ?? null,
    channelId: event.channelId,
    mentions: JSON.stringify(event.mentions),
    leadMinutes: JSON.stringify(event.leadMinutes),
    announceAtStart: event.announceAtStart,
    schedule: JSON.stringify(event.schedule),
    enabled: event.enabled,
    createdBy: event.createdBy,
    createdAt: new Date(event.createdAt),
  };
}

/* ------------------------------------------------------------------ cache */

/**
 * The dataset is a handful of rows, so it is mirrored in memory: reads stay
 * synchronous (embeds and autocomplete need them inline), while every write
 * goes through this module and hits Prisma before returning, so the cache and
 * the database never drift.
 */
const cache = new Map<string, GuildConfig>();

/** Read the whole database into the cache. Call once at startup. */
export async function loadStore({ quiet = false } = {}): Promise<void> {
  const [guilds, events] = await Promise.all([
    prisma.guild.findMany(),
    prisma.event.findMany({ include: { fired: { select: { key: true, firedAt: true } } } }),
  ]);

  cache.clear();
  for (const row of guilds) cache.set(row.id, toGuild(row));
  for (const row of events) cache.get(row.guildId)?.events.push(toEvent(row));

  if (!quiet) {
    console.log(`🗄️  Loaded ${guilds.length} guild(s) and ${events.length} event(s)`);
  }
}

/** Re-read everything from the database. Used by tests. */
export function reload(): Promise<void> {
  return loadStore({ quiet: true });
}

/* --------------------------------------------------------------- read API */

export function getGuild(guildId: string): GuildConfig | undefined {
  return cache.get(guildId);
}

export function allGuilds(): GuildConfig[] {
  return [...cache.values()];
}

/** Get the guild config, creating a default row if this guild is new. */
export async function ensureGuild(guildId: string): Promise<GuildConfig> {
  const existing = cache.get(guildId);
  if (existing) return existing;

  const created: GuildConfig = {
    guildId,
    timezone: DEFAULT_TIMEZONE,
    adminRoleId: DEFAULT_ADMIN_ROLE_ID,
    locale: "ko",
    events: [],
  };
  cache.set(guildId, created);

  await prisma.guild.upsert({
    where: { id: guildId },
    create: {
      id: guildId,
      timezone: created.timezone,
      adminRoleId: created.adminRoleId ?? null,
      locale: created.locale,
    },
    update: {},
  });

  return created;
}

/* -------------------------------------------------------------- write API */

export async function saveGuildSettings(guild: GuildConfig): Promise<void> {
  const data = {
    timezone: guild.timezone,
    defaultChannelId: guild.defaultChannelId ?? null,
    adminRoleId: guild.adminRoleId ?? null,
    locale: guild.locale,
  };

  cache.set(guild.guildId, guild);
  await prisma.guild.upsert({
    where: { id: guild.guildId },
    create: { id: guild.guildId, ...data },
    update: data,
  });
}

export async function saveEvent(guildId: string, event: EventConfig): Promise<void> {
  const guild = await ensureGuild(guildId);
  if (!guild.events.some((candidate) => candidate.id === event.id)) {
    guild.events.push(event);
  }

  const data = eventData(guildId, event);
  await prisma.event.upsert({
    where: { id: event.id },
    create: { id: event.id, ...data },
    update: data,
  });
}

export async function deleteEvent(guildId: string, eventId: string): Promise<void> {
  const guild = cache.get(guildId);
  if (guild) guild.events = guild.events.filter((event) => event.id !== eventId);
  // `fired_reminders` rows cascade.
  await prisma.event.deleteMany({ where: { id: eventId, guildId } });
}

/* ----------------------------------------------------------- fired ledger */

/** Record that a reminder was sent, so it is never sent again. */
export async function recordFired(
  event: EventConfig,
  key: string,
  firedAt: Date,
): Promise<void> {
  event.fired[key] = firedAt.toISOString();
  await prisma.firedReminder.upsert({
    where: { eventId_key: { eventId: event.id, key } },
    create: { eventId: event.id, key, firedAt },
    update: { firedAt },
  });
}

/** Undo a claim when the send failed, so the next tick can retry. */
export async function clearFired(event: EventConfig, key: string): Promise<void> {
  delete event.fired[key];
  await prisma.firedReminder.deleteMany({ where: { eventId: event.id, key } });
}

/** Drop the whole ledger for an event — used when its schedule changes. */
export async function resetFired(event: EventConfig): Promise<void> {
  event.fired = {};
  await prisma.firedReminder.deleteMany({ where: { eventId: event.id } });
}

/** Forget ledger entries older than `before`. */
export async function pruneFired(event: EventConfig, before: Date): Promise<void> {
  const cutoff = before.toISOString();
  let removed = false;
  for (const [key, firedAt] of Object.entries(event.fired)) {
    if (firedAt < cutoff) {
      delete event.fired[key];
      removed = true;
    }
  }
  if (!removed) return;
  await prisma.firedReminder.deleteMany({
    where: { eventId: event.id, firedAt: { lt: before } },
  });
}
