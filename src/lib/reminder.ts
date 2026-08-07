import { EmbedBuilder } from "discord.js";
import type { DateTime } from "luxon";

import { discordTimestamp } from "./time.ts";
import type { EventConfig, GuildConfig } from "../types.ts";

type Locale = GuildConfig["locale"];

function leadPhrase(locale: Locale, minutes: number): string {
  if (minutes === 0) return locale === "ko" ? "지금 시작합니다!" : "Starting now!";
  if (locale === "ko") {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const label = hours > 0 ? (rest ? `${hours}시간 ${rest}분` : `${hours}시간`) : `${minutes}분`;
    return `${label} 후 시작합니다!`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const label = hours > 0 ? (rest ? `${hours}h ${rest}m` : `${hours}h`) : `${minutes} min`;
  return `Starts in ${label}!`;
}

const COPY = {
  ko: {
    startsAt: "시작 시각",
    relative: "남은 시간",
    status: "상태",
    started: "🔔 시작됨",
    footer: "Kate's Whip • 연맹 이벤트 알림",
    rally: "연맹원 전원 집합!",
    serverTime: "서버 시간",
  },
  en: {
    startsAt: "Starts at",
    relative: "Countdown",
    status: "Status",
    started: "🔔 Started",
    footer: "Kate's Whip • alliance event reminder",
    rally: "All hands on deck!",
    serverTime: "Server time",
  },
} as const;

/** UTC is Kingshot's server time, so label it as such. */
function zoneLabel(zone: string, locale: Locale): string {
  return zone === "UTC" ? `${COPY[locale].serverTime}, UTC` : zone;
}

export function buildMentionLine(event: EventConfig): string {
  return event.mentions
    .map((mention) => (mention === "everyone" ? "@everyone" : `<@&${mention}>`))
    .join(" ");
}

export function buildReminder(
  event: EventConfig,
  occurrence: DateTime,
  leadMinutes: number,
  locale: Locale,
): { content: string; embed: EmbedBuilder } {
  const copy = COPY[locale];
  const headline = leadPhrase(locale, leadMinutes);

  const embed = new EmbedBuilder()
    .setTitle(`${event.emoji} ${event.name}`)
    .setDescription(`**${headline}**\n${copy.rally}`)
    .setColor(leadMinutes === 0 ? 0xe74c3c : leadMinutes <= 5 ? 0xf39c12 : 0x3498db)
    .addFields(
      {
        name: copy.startsAt,
        value: `${discordTimestamp(occurrence, "F")}\n\`${occurrence
          .setZone(event.schedule.timezone)
          .toFormat("yyyy-MM-dd HH:mm")}\` (${zoneLabel(event.schedule.timezone, locale)})`,
        inline: false,
      },
      // Discord renders `<t:R>` live, so a countdown flips to "5 minutes ago"
      // once the start passes. At T-0 there is nothing to count down to, so
      // state that it has started instead of mislabelling elapsed time.
      leadMinutes === 0
        ? { name: copy.status, value: `**${copy.started}**`, inline: true }
        : { name: copy.relative, value: discordTimestamp(occurrence, "R"), inline: true },
    )
    .setFooter({ text: copy.footer });

  if (event.note) embed.addFields({ name: "​", value: event.note, inline: false });

  const mentionLine = buildMentionLine(event);
  const content = mentionLine ? `${mentionLine} ${event.emoji} **${event.name}** — ${headline}` : "";

  return { content, embed };
}
