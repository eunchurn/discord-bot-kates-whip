import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { DateTime } from "luxon";

import { DEFAULT_LEAD_MINUTES, WIKI_EVENTS_URL } from "../config.ts";
import { PRESET_CHOICES, PRESETS, findPreset } from "../events/presets.ts";
import { describeSchedule, nextOccurrence, nextOccurrences } from "../events/schedule.ts";
import { reminderOffsets } from "../events/scheduler.ts";
import { checkManagePermission } from "../lib/permissions.ts";
import { buildReminder } from "../lib/reminder.ts";
import {
  discordTimestamp,
  isValidTimezone,
  listTimezones,
  parseDays,
  parseLeadMinutes,
  parseTime,
} from "../lib/time.ts";
import { deleteEvent, ensureGuild, resetFired, saveEvent } from "../store.ts";
import type { EventConfig, EventSchedule, GuildConfig } from "../types.ts";
import type { Command } from "./types.ts";

class UserError extends Error {}

function fail(message: string): never {
  throw new UserError(message);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function findEvent(guild: GuildConfig, needle: string): EventConfig {
  const key = needle.trim().toLowerCase();
  const found =
    guild.events.find((event) => event.id === key) ??
    guild.events.find((event) => event.name.toLowerCase() === key) ??
    guild.events.find((event) => event.name.toLowerCase().includes(key));
  if (!found) fail(`No event matches \`${needle}\`. Use \`/event list\` to see them.`);
  return found;
}

/** Build a schedule from the raw `days` / `time` / `timezone` / `anchor` options. */
function buildSchedule(
  daysInput: string,
  timeInput: string,
  timezone: string,
  anchorInput: string | null,
): EventSchedule {
  if (!isValidTimezone(timezone)) {
    fail(`\`${timezone}\` is not a valid IANA timezone (try \`UTC\` or \`Asia/Seoul\`).`);
  }

  const time = parseTime(timeInput);
  if (typeof time !== "string") fail(time.error);

  const days = parseDays(daysInput);
  if ("error" in days) fail(days.error);

  const schedule: EventSchedule = { kind: days.kind, time, timezone };

  if (days.kind === "weekly") schedule.weekdays = days.weekdays;

  if (days.kind === "interval") {
    schedule.intervalDays = days.intervalDays;
    const anchor = anchorInput
      ? DateTime.fromISO(anchorInput, { zone: timezone })
      : DateTime.now().setZone(timezone);
    if (!anchor.isValid) fail(`\`${anchorInput}\` is not a valid date. Use \`YYYY-MM-DD\`.`);
    schedule.anchorDate = anchor.toFormat("yyyy-MM-dd");
  }

  return schedule;
}

function eventSummary(event: EventConfig): string {
  const next = nextOccurrence(event.schedule);
  const mentions = event.mentions
    .map((m) => (m === "everyone" ? "@everyone" : `<@&${m}>`))
    .join(" ");
  const offsets = reminderOffsets(event)
    .map((lead) => (lead === 0 ? "start" : `${lead}m`))
    .join(", ");

  return [
    `${describeSchedule(event.schedule)}`,
    `Next: ${next ? `${discordTimestamp(next, "F")} (${discordTimestamp(next, "R")})` : "—"}`,
    `Reminders: ${offsets} • Channel: <#${event.channelId}>${mentions ? ` • ${mentions}` : ""}`,
    `ID: \`${event.id}\`${event.enabled ? "" : " • ⏸️ **paused**"}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ add -- */

async function handleAdd(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): Promise<void> {
  const presetKey = interaction.options.getString("preset", true);
  const preset = findPreset(presetKey);
  if (!preset) fail(`Unknown preset \`${presetKey}\`.`);

  const nameInput = interaction.options.getString("name");
  const name = nameInput?.trim() || preset.label;
  if (presetKey === "custom" && !nameInput?.trim()) {
    fail("A custom event needs a `name`.");
  }

  const daysInput = interaction.options.getString("days") ?? preset.defaultDays;
  if (!daysInput) {
    fail(
      `\`${preset.label}\` has no default recurrence — pass \`days\`, e.g. \`days: sun\` or \`days: every2\`.`,
    );
  }

  const timeInput = interaction.options.getString("time", true);
  const timezone = interaction.options.getString("timezone") ?? guild.timezone;
  const anchor = interaction.options.getString("anchor");
  const schedule = buildSchedule(daysInput, timeInput, timezone, anchor);

  const channel = interaction.options.getChannel("channel");
  const channelId = channel?.id ?? guild.defaultChannelId ?? interaction.channelId;
  if (!channelId) fail("No channel to announce in. Set one with `/setup` or pass `channel`.");

  const remindInput = interaction.options.getString("remind");
  let leadMinutes = DEFAULT_LEAD_MINUTES;
  if (remindInput) {
    const parsed = parseLeadMinutes(remindInput);
    if (!Array.isArray(parsed)) fail(parsed.error);
    leadMinutes = parsed;
  }

  const mentionRole = interaction.options.getRole("mention");
  const mentionEveryone = interaction.options.getBoolean("mention_everyone") ?? false;
  const mentions: string[] = [];
  if (mentionEveryone) mentions.push("everyone");
  if (mentionRole) mentions.push(mentionRole.id);

  const announceAtStart = interaction.options.getBoolean("announce_at_start") ?? true;

  const event: EventConfig = {
    id: shortId(),
    name,
    presetKey,
    emoji: preset.emoji,
    note: presetKey === "custom" ? undefined : preset.note,
    channelId,
    mentions,
    leadMinutes: leadMinutes.filter((m) => m > 0),
    announceAtStart,
    schedule,
    enabled: true,
    createdBy: interaction.user.id,
    createdAt: new Date().toISOString(),
    fired: {},
  };

  await saveEvent(guild.guildId, event);

  const embed = new EmbedBuilder()
    .setTitle(`✅ ${event.emoji} ${event.name} scheduled`)
    .setDescription(eventSummary(event))
    .setColor(0x2ecc71);

  await interaction.reply({ embeds: [embed] });
}

/* ----------------------------------------------------------------- list -- */

async function handleList(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): Promise<void> {
  if (guild.events.length === 0) {
    await interaction.reply({
      content: "No events configured yet. Add one with `/event add`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sorted = [...guild.events].sort((a, b) => {
    const nextA = nextOccurrence(a.schedule)?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    const nextB = nextOccurrence(b.schedule)?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    return nextA - nextB;
  });

  const embed = new EmbedBuilder()
    .setTitle("📋 Scheduled alliance events")
    .setColor(0x3498db)
    .setFooter({ text: `${guild.events.length} event(s) • server timezone ${guild.timezone}` });

  // Discord allows at most 25 embed fields.
  for (const event of sorted.slice(0, 25)) {
    embed.addFields({
      name: `${event.enabled ? "" : "⏸️ "}${event.emoji} ${event.name}`,
      value: eventSummary(event),
      inline: false,
    });
  }
  if (sorted.length > 25) {
    embed.setDescription(`Showing the 25 soonest of ${sorted.length} events.`);
  }

  await interaction.reply({ embeds: [embed] });
}

/* ----------------------------------------------------------------- next -- */

async function handleNext(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): Promise<void> {
  const count = interaction.options.getInteger("count") ?? 10;
  const upcoming: { event: EventConfig; at: DateTime }[] = [];

  for (const event of guild.events) {
    if (!event.enabled) continue;
    for (const at of nextOccurrences(event.schedule, DateTime.utc(), 5)) {
      upcoming.push({ event, at });
    }
  }

  if (upcoming.length === 0) {
    await interaction.reply({
      content: "Nothing scheduled. Add an event with `/event add`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  upcoming.sort((a, b) => a.at.toMillis() - b.at.toMillis());

  const lines = upcoming
    .slice(0, count)
    .map(
      ({ event, at }) =>
        `${event.emoji} **${event.name}** — ${discordTimestamp(at, "F")} (${discordTimestamp(at, "R")})`,
    );

  const embed = new EmbedBuilder()
    .setTitle("⏭️ Upcoming events")
    .setDescription(lines.join("\n"))
    .setColor(0x9b59b6);

  await interaction.reply({ embeds: [embed] });
}

/* ----------------------------------------------------------------- edit -- */

async function handleEdit(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): Promise<void> {
  const event = findEvent(guild, interaction.options.getString("event", true));

  const daysInput = interaction.options.getString("days");
  const timeInput = interaction.options.getString("time");
  const timezoneInput = interaction.options.getString("timezone");
  const anchorInput = interaction.options.getString("anchor");

  if (daysInput || timeInput || timezoneInput || anchorInput) {
    const days = daysInput ?? describeDaysOption(event.schedule);
    const time = timeInput ?? event.schedule.time;
    const timezone = timezoneInput ?? event.schedule.timezone;
    const anchor = anchorInput ?? event.schedule.anchorDate ?? null;
    event.schedule = buildSchedule(days, time, timezone, anchor);
    // The occurrence keys change, so the old ledger is meaningless.
    await resetFired(event);
  }

  const channel = interaction.options.getChannel("channel");
  if (channel) event.channelId = channel.id;

  const name = interaction.options.getString("name");
  if (name?.trim()) event.name = name.trim();

  const remindInput = interaction.options.getString("remind");
  if (remindInput) {
    const parsed = parseLeadMinutes(remindInput);
    if (!Array.isArray(parsed)) fail(parsed.error);
    event.leadMinutes = parsed.filter((m) => m > 0);
  }

  const mentionRole = interaction.options.getRole("mention");
  const mentionEveryone = interaction.options.getBoolean("mention_everyone");
  if (mentionRole || mentionEveryone !== null) {
    const mentions: string[] = [];
    if (mentionEveryone ?? event.mentions.includes("everyone")) mentions.push("everyone");
    if (mentionRole) mentions.push(mentionRole.id);
    else mentions.push(...event.mentions.filter((m) => m !== "everyone"));
    event.mentions = [...new Set(mentions)];
  }

  const announceAtStart = interaction.options.getBoolean("announce_at_start");
  if (announceAtStart !== null) event.announceAtStart = announceAtStart;

  await saveEvent(guild.guildId, event);

  const embed = new EmbedBuilder()
    .setTitle(`✏️ ${event.emoji} ${event.name} updated`)
    .setDescription(eventSummary(event))
    .setColor(0xf1c40f);

  await interaction.reply({ embeds: [embed] });
}

/** Reverse of parseDays, so `/event edit` can keep the untouched part. */
function describeDaysOption(schedule: EventSchedule): string {
  switch (schedule.kind) {
    case "daily":
      return "daily";
    case "interval":
      return `every${schedule.intervalDays ?? 2}`;
    case "weekly": {
      const names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      return (schedule.weekdays ?? []).map((weekday) => names[weekday - 1] ?? "mon").join(",");
    }
    case "once":
      return "daily";
  }
}

/* -------------------------------------------------------- remove/toggle -- */

async function handleRemove(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): Promise<void> {
  const event = findEvent(guild, interaction.options.getString("event", true));
  await deleteEvent(guild.guildId, event.id);
  await interaction.reply(`🗑️ Removed **${event.emoji} ${event.name}**.`);
}

async function handleToggle(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): Promise<void> {
  const event = findEvent(guild, interaction.options.getString("event", true));
  event.enabled = !event.enabled;
  await saveEvent(guild.guildId, event);
  await interaction.reply(
    event.enabled
      ? `▶️ **${event.name}** resumed. Next: ${
          nextOccurrence(event.schedule)
            ? discordTimestamp(nextOccurrence(event.schedule)!, "F")
            : "—"
        }`
      : `⏸️ **${event.name}** paused. No reminders will be sent.`,
  );
}

/* ----------------------------------------------------------------- test -- */

async function handleTest(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): Promise<void> {
  const event = findEvent(guild, interaction.options.getString("event", true));
  const lead = interaction.options.getInteger("lead") ?? event.leadMinutes[0] ?? 10;
  const occurrence = nextOccurrence(event.schedule) ?? DateTime.utc().plus({ minutes: lead });

  const { embed } = buildReminder(event, occurrence, lead, guild.locale);
  await interaction.reply({
    content: `Preview — this is what members will see in <#${event.channelId}> (mentions are not pinged here).`,
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

/* -------------------------------------------------------------- presets -- */

async function handlePresets(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("📖 Alliance event presets")
    .setURL(WIKI_EVENTS_URL)
    .setDescription(
      "Times differ per kingdom and alliance, so presets only carry the recurrence and flavour — you pick the actual day and time.",
    )
    .setColor(0x1abc9c);

  for (const preset of PRESETS.slice(0, 25)) {
    embed.addFields({
      name: `${preset.emoji} ${preset.label}`,
      value: `${preset.cadence}\n${preset.note}\n\`preset: ${preset.key}\``,
      inline: true,
    });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/* -------------------------------------------------------------- command -- */

const MUTATING = new Set(["add", "edit", "remove", "toggle"]);

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command only works inside a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = await ensureGuild(interaction.guildId);
  const sub = interaction.options.getSubcommand();

  if (MUTATING.has(sub)) {
    const denied = checkManagePermission(interaction, guild);
    if (denied) {
      await interaction.reply({ content: `❌ ${denied}`, flags: MessageFlags.Ephemeral });
      return;
    }
  }

  try {
    switch (sub) {
      case "add":
        await handleAdd(interaction, guild);
        break;
      case "list":
        await handleList(interaction, guild);
        break;
      case "next":
        await handleNext(interaction, guild);
        break;
      case "edit":
        await handleEdit(interaction, guild);
        break;
      case "remove":
        await handleRemove(interaction, guild);
        break;
      case "toggle":
        await handleToggle(interaction, guild);
        break;
      case "test":
        await handleTest(interaction, guild);
        break;
      case "presets":
        await handlePresets(interaction);
        break;
      default:
        await interaction.reply({
          content: `Unknown subcommand \`${sub}\`.`,
          flags: MessageFlags.Ephemeral,
        });
    }
  } catch (error) {
    const message =
      error instanceof UserError ? error.message : `Something went wrong: ${String(error)}`;
    if (!(error instanceof UserError)) console.error("❌ /event failed:", error);
    const payload = { content: `❌ ${message}`, flags: MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
}

const TIME_DESC = "Start time in server time (UTC), 24h — e.g. 20:00";
const DAYS_DESC = "mon,thu  |  daily  |  every2 (every 2 days)";
const REMIND_DESC = "Minutes before start, comma separated. Default 10,5";
const ANCHOR_DESC = "For every-N-days: the date a cycle lands on (YYYY-MM-DD)";

export const eventCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Schedule alliance event reminders")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Schedule a new alliance event reminder")
        .addStringOption((option) =>
          option
            .setName("preset")
            .setDescription("Which alliance event")
            .setRequired(true)
            .addChoices(...PRESET_CHOICES),
        )
        .addStringOption((option) =>
          option.setName("time").setDescription(TIME_DESC).setRequired(true),
        )
        .addStringOption((option) => option.setName("days").setDescription(DAYS_DESC))
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription("Timezone for `time`. Defaults to UTC (Kingshot server time)")
            .setAutocomplete(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to announce in")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) =>
          option.setName("mention").setDescription("Role to ping"),
        )
        .addStringOption((option) => option.setName("remind").setDescription(REMIND_DESC))
        .addStringOption((option) =>
          option.setName("name").setDescription("Custom display name"),
        )
        .addStringOption((option) => option.setName("anchor").setDescription(ANCHOR_DESC))
        .addBooleanOption((option) =>
          option.setName("mention_everyone").setDescription("Ping @everyone"),
        )
        .addBooleanOption((option) =>
          option
            .setName("announce_at_start")
            .setDescription("Also announce when the event starts (default: true)"),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List every configured event"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("next")
        .setDescription("Show upcoming events in chronological order")
        .addIntegerOption((option) =>
          option
            .setName("count")
            .setDescription("How many to show (default 10)")
            .setMinValue(1)
            .setMaxValue(25),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Change an existing event")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event to edit")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) => option.setName("time").setDescription(TIME_DESC))
        .addStringOption((option) => option.setName("days").setDescription(DAYS_DESC))
        .addStringOption((option) =>
          option.setName("timezone").setDescription("IANA timezone").setAutocomplete(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to announce in")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) => option.setName("mention").setDescription("Role to ping"))
        .addStringOption((option) => option.setName("remind").setDescription(REMIND_DESC))
        .addStringOption((option) => option.setName("name").setDescription("Display name"))
        .addStringOption((option) => option.setName("anchor").setDescription(ANCHOR_DESC))
        .addBooleanOption((option) =>
          option.setName("mention_everyone").setDescription("Ping @everyone"),
        )
        .addBooleanOption((option) =>
          option.setName("announce_at_start").setDescription("Announce at start time"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete an event")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event to remove")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Pause or resume an event")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event to pause/resume")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Preview a reminder without pinging anyone")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event to preview")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("lead")
            .setDescription("Lead time to preview, in minutes")
            .setMinValue(0)
            .setMaxValue(1440),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("presets").setDescription("Show the alliance event catalog"),
    ),

  execute,

  autocomplete: async (interaction) => {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value).toLowerCase();

    if (focused.name === "timezone") {
      await interaction.respond(
        listTimezones()
          .filter((zone) => zone.toLowerCase().includes(query))
          .slice(0, 25)
          .map((zone) => ({ name: zone, value: zone })),
      );
      return;
    }

    if (focused.name === "event" && interaction.guildId) {
      const guild = await ensureGuild(interaction.guildId);
      await interaction.respond(
        guild.events
          .filter((event) => event.name.toLowerCase().includes(query) || event.id.includes(query))
          .slice(0, 25)
          .map((event) => ({
            name: `${event.emoji} ${event.name} — ${describeSchedule(event.schedule)}`.slice(0, 100),
            value: event.id,
          })),
      );
      return;
    }

    await interaction.respond([]);
  },
};
