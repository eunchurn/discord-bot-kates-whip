import { resolve } from "node:path";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? "";

export const DATA_DIR = resolve(process.env.DATA_DIR ?? "./data");

/**
 * SQLite connection string holding guild settings, events and the
 * sent-reminder ledger. Also read by the Prisma CLI via prisma.config.ts.
 */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? `file:${resolve(DATA_DIR, "kates-whip.db")}`;

/** How often the scheduler evaluates pending reminders. */
export const TICK_SECONDS = num("TICK_SECONDS", 30);

/**
 * Kingshot runs on UTC server time, so schedules default to UTC. Discord
 * renders the timestamps in each member's own local time anyway.
 */
export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE ?? "UTC";

export const DEFAULT_LEAD_MINUTES: number[] = (
  process.env.DEFAULT_LEAD_MINUTES ?? "10,5"
)
  .split(",")
  .map((part) => Number(part.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

/** Public gift code feed, shared with the KingshotRedeemer bot. */
export const GIFT_CODES_API_URL = "https://kingshot.net/api/gift-codes";

export const WIKI_EVENTS_URL = "https://kingshotwiki.com/events/";
