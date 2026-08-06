import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import { WIKI_EVENTS_URL } from "../config.ts";
import { ensureGuild } from "../store.ts";
import type { Command } from "./types.ts";

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guildId ? await ensureGuild(interaction.guildId) : undefined;

  const embed = new EmbedBuilder()
    .setTitle("🪢 Kate's Whip")
    .setDescription(
      "Alliance event reminders for Kingshot. Set a schedule once, and everyone gets pinged before it starts.",
    )
    .setColor(0xe67e22)
    .addFields(
      {
        name: "Getting started",
        value: [
          "`/setup channel:#alliance admin_role:@R4`",
          "`/event presets` — see the alliance event catalog",
          "`/event add preset:Bear Hunt 1 time:20:00 mention:@Alliance`",
        ].join("\n"),
      },
      {
        name: "Scheduling",
        value: [
          "`time:` **UTC = Kingshot server time** by default, 24h (`20:00`)",
          "Everyone still sees the reminder in their own local time.",
          "`days:` `mon,thu` · `daily` · `every2` (every 2 days)",
          "`remind:` `10,5` — minutes before start (default `10,5`)",
          "`anchor:` for `every2`, a date the cycle lands on (`YYYY-MM-DD`)",
          "`timezone:` only if you want something other than UTC",
        ].join("\n"),
      },
      {
        name: "Managing",
        value: [
          "`/event list` — all events with next start time",
          "`/event next` — what's coming up",
          "`/event edit` · `/event toggle` · `/event remove`",
          "`/event test` — preview a reminder, nobody gets pinged",
        ].join("\n"),
      },
      {
        name: "Extras",
        value: `\`/giftcodes\` — active Kingshot gift codes\n[Event wiki](${WIKI_EVENTS_URL})`,
      },
    );

  if (guild) {
    embed.setFooter({
      text: `Timezone ${guild.timezone} • ${guild.events.length} event(s) • language ${guild.locale}`,
    });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("How to use Kate's Whip"),
  execute,
};
