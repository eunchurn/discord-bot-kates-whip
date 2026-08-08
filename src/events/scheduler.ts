import type { Client } from "discord.js";
import { DateTime } from "luxon";

import { TICK_SECONDS } from "../config.ts";
import { buildReminder } from "../lib/reminder.ts";
import { allGuilds, clearFired, pruneFired, recordFired } from "../store.ts";
import type { EventConfig, GuildConfig } from "../types.ts";
import { classifySendError, type SendOutcome } from "./dispatch-errors.ts";
import { nextOccurrences } from "./schedule.ts";

/**
 * A reminder is only sent if the tick lands within this window after its due
 * time. Wide enough to absorb tick jitter and a short restart, narrow enough
 * that a bot that was offline for an hour does not spam stale pings.
 */
const CATCHUP_MS = 3 * 60 * 1000;

/** Fired-ledger entries older than this are pruned. */
const LEDGER_TTL_DAYS = 14;

function ledgerKey(occurrence: DateTime, lead: number): string {
  return `${occurrence.toUTC().toISO({ suppressMilliseconds: true })}|${lead}`;
}

/** All reminder offsets for an event, largest lead first, start last. */
export function reminderOffsets(event: EventConfig): number[] {
  const offsets = [...event.leadMinutes];
  if (event.announceAtStart && !offsets.includes(0)) offsets.push(0);
  return offsets.sort((a, b) => b - a);
}

export interface DueReminder {
  occurrence: DateTime;
  lead: number;
  key: string;
}

/**
 * Reminders that are due right now and have not been sent yet — the whole
 * scheduling decision, with no side effects, so it can be tested directly.
 */
export function dueReminders(event: EventConfig, now: DateTime): DueReminder[] {
  const offsets = reminderOffsets(event);
  const maxLead = offsets[0] ?? 0;

  // Look back far enough that a reminder whose lead time already passed
  // within the catch-up window is still considered.
  const from = now.minus({ minutes: maxLead }).minus(CATCHUP_MS);
  const occurrences = nextOccurrences(event.schedule, from, offsets.length + 2);

  const due: DueReminder[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.diff(now).as("minutes") > maxLead) break;

    for (const lead of offsets) {
      const sinceDue = now.diff(occurrence.minus({ minutes: lead })).toMillis();
      if (sinceDue < 0 || sinceDue > CATCHUP_MS) continue;

      const key = ledgerKey(occurrence, lead);
      if (event.fired[key]) continue;

      due.push({ occurrence, lead, key });
    }
  }
  return due;
}

async function dispatch(
  client: Client,
  guild: GuildConfig,
  event: EventConfig,
  occurrence: DateTime,
  lead: number,
): Promise<SendOutcome> {
  const channelId = event.channelId || guild.defaultChannelId;
  if (!channelId) {
    return { kind: "giveUp", message: "no channel configured — run /setup or /event edit" };
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) {
      return {
        kind: "giveUp",
        message: `channel ${channelId} is not a text channel this bot can post in`,
      };
    }

    const { content, embed } = buildReminder(event, occurrence, lead, guild.locale);
    await channel.send({
      content: content || undefined,
      embeds: [embed],
      allowedMentions: { parse: ["everyone", "roles"] },
    });
    console.log(`🔔 ${guild.guildId} • ${event.name} • T-${lead}m • ${occurrence.toISO()}`);
    return { kind: "sent" };
  } catch (error) {
    return classifySendError(error, channelId);
  }
}

async function runTick(client: Client): Promise<void> {
  const now = DateTime.utc();
  const cutoff = now.minus({ days: LEDGER_TTL_DAYS }).toJSDate();
  const firedAt = now.toJSDate();

  for (const guild of allGuilds()) {
    for (const event of guild.events) {
      await pruneFired(event, cutoff);
      if (!event.enabled) continue;

      for (const due of dueReminders(event, now)) {
        // Claim before sending so a slow send cannot double-fire on the
        // next tick, and so a crash mid-send does not replay on restart.
        await recordFired(event, due.key, firedAt);

        const outcome = await dispatch(client, guild, event, due.occurrence, due.lead);

        if (outcome.kind === "retry") {
          // Release the claim so the next tick can try again.
          await clearFired(event, due.key);
          console.warn(`⚠️  ${event.name} (T-${due.lead}m): ${outcome.message} — will retry`);
        } else if (outcome.kind === "giveUp") {
          // Keep the claim: retrying cannot help until someone fixes the
          // setup, and re-firing every tick would only repeat this line.
          console.error(`❌ ${event.name} (T-${due.lead}m): ${outcome.message} — reminder dropped`);
        }
      }
    }
  }
}

export function startScheduler(client: Client): () => void {
  let running = false;

  const tick = () => {
    if (running) return; // never overlap ticks
    running = true;
    runTick(client)
      .catch((error) => console.error("❌ Scheduler tick failed:", error))
      .finally(() => {
        running = false;
      });
  };

  const interval = setInterval(tick, Math.max(5, TICK_SECONDS) * 1000);
  tick();

  console.log(`⏰ Scheduler started (tick every ${TICK_SECONDS}s)`);
  return () => clearInterval(interval);
}
