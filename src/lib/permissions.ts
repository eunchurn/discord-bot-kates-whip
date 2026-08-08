import {
  PermissionFlagsBits,
  type APIInteractionGuildMember,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";

import type { GuildConfig } from "../types.ts";

/**
 * The caller's role ids.
 *
 * When the guild is not in the client cache, discord.js hands back the raw
 * `APIInteractionGuildMember`, whose `roles` is a plain array of ids — only a
 * cached `GuildMember` has a role manager.
 */
function roleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
  if (!member) return [];
  return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}

/**
 * Returns an error when the bot is not actually a member of this server.
 *
 * A user-installed app receives interactions from servers it has not joined:
 * the slash commands show up and configuration appears to work, but the bot
 * can never post, so every reminder dies with "Missing Access". With the
 * Guilds intent every joined guild is cached, so an absent `interaction.guild`
 * means the bot is not in it.
 */
export function checkBotIsMember(interaction: ChatInputCommandInteraction): string {
  if (!interaction.inGuild() || interaction.guild) return "";

  return [
    "⚠️ **This bot is not a member of this server**, so it cannot post reminders here.",
    "",
    "It looks like the app was added to your account (“Add App”) instead of invited to the server.",
    "Ask someone with **Manage Server** to open this link and choose **Add to Server**:",
    "",
    "https://discord.com/oauth2/authorize?client_id=1535266769227489411&scope=bot+applications.commands&permissions=150528",
    "",
    "You will know it worked when **Kate's Whip** appears in the server's member list.",
  ].join("\n");
}

/**
 * Returns an error string when the caller may not manage events, or "" when
 * they may. Managing requires either the configured admin role or the
 * Manage Server permission — so a fresh install is never locked out.
 */
export function checkManagePermission(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): string {
  if (!interaction.inGuild()) return "This command can only be used inside a server.";

  // Read permissions off the interaction, not off `member`: discord.js always
  // resolves `memberPermissions` into a bitfield, whereas `member.permissions`
  // is a raw string when the guild is uncached, and a string has no `.has()`.
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return "";

  const adminRoleId = guild.adminRoleId;
  if (!adminRoleId) {
    return "You need the **Manage Server** permission, or ask an admin to set an admin role with `/setup`.";
  }
  if (roleIds(interaction.member).includes(adminRoleId)) return "";

  return `You need the <@&${adminRoleId}> role (or **Manage Server**) to do that.`;
}
