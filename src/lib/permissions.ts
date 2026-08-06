import { PermissionFlagsBits, type ChatInputCommandInteraction, type GuildMember } from "discord.js";

import type { GuildConfig } from "../types.ts";

/**
 * Returns an error string when the caller may not manage events, or "" when
 * they may. Managing requires either the configured admin role or the
 * Manage Server permission — so a fresh install is never locked out.
 */
export function checkManagePermission(
  interaction: ChatInputCommandInteraction,
  guild: GuildConfig,
): string {
  const member = interaction.member as GuildMember | null;
  if (!member) return "This command can only be used inside a server.";

  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return "";

  const adminRoleId = guild.adminRoleId;
  if (!adminRoleId) {
    return "You need the **Manage Server** permission, or ask an admin to set an admin role with `/setup`.";
  }
  if (member.roles.cache.has(adminRoleId)) return "";

  return `You need the <@&${adminRoleId}> role (or **Manage Server**) to do that.`;
}
