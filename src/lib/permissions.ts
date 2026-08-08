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
