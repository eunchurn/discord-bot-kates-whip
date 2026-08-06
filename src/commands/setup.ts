import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import { checkManagePermission } from "../lib/permissions.ts";
import { isValidTimezone, listTimezones } from "../lib/time.ts";
import { ensureGuild, saveGuildSettings } from "../store.ts";
import type { Command } from "./types.ts";

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command only works inside a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = await ensureGuild(interaction.guildId);
  const denied = checkManagePermission(interaction, guild);
  if (denied) {
    await interaction.reply({ content: `❌ ${denied}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.options.getChannel("channel");
  const adminRole = interaction.options.getRole("admin_role");
  const timezone = interaction.options.getString("timezone");
  const language = interaction.options.getString("language");

  if (timezone && !isValidTimezone(timezone)) {
    await interaction.reply({
      content: `❌ \`${timezone}\` is not a valid IANA timezone (try \`UTC\` or \`Asia/Seoul\`).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (channel) guild.defaultChannelId = channel.id;
  if (adminRole) guild.adminRoleId = adminRole.id;
  if (timezone) guild.timezone = timezone;
  if (language === "ko" || language === "en") guild.locale = language;
  await saveGuildSettings(guild);

  const lines = [
    "✅ **Kate's Whip configured**",
    `• Default channel: ${guild.defaultChannelId ? `<#${guild.defaultChannelId}>` : "_not set_"}`,
    `• Admin role: ${guild.adminRoleId ? `<@&${guild.adminRoleId}>` : "_Manage Server only_"}`,
    `• Timezone: \`${guild.timezone}\``,
    `• Reminder language: \`${guild.locale}\``,
    "",
    "Next: add an event with `/event add`.",
  ];

  await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
}

export const setupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure the default channel, admin role, timezone and language.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Default channel for event reminders")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addRoleOption((option) =>
      option.setName("admin_role").setDescription("Role allowed to manage events"),
    )
    .addStringOption((option) =>
      option
        .setName("timezone")
        .setDescription("Default timezone. UTC = Kingshot server time (default)")
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("language")
        .setDescription("Language used in reminder messages")
        .addChoices({ name: "한국어", value: "ko" }, { name: "English", value: "en" }),
    ),

  execute,

  autocomplete: async (interaction) => {
    const query = interaction.options.getFocused().toLowerCase();
    const matches = listTimezones()
      .filter((zone) => zone.toLowerCase().includes(query))
      .slice(0, 25)
      .map((zone) => ({ name: zone, value: zone }));
    await interaction.respond(matches);
  },
};
