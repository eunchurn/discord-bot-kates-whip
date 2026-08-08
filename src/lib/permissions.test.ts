import { describe, expect, test } from "bun:test";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";

import { checkBotIsMember, checkManagePermission } from "./permissions.ts";
import type { ChatInputCommandInteraction } from "discord.js";
import type { GuildConfig } from "../types.ts";

const ADMIN_ROLE = "1470006260173897738";

function guild(overrides: Partial<GuildConfig> = {}): GuildConfig {
  return {
    guildId: "g1",
    timezone: "UTC",
    adminRoleId: ADMIN_ROLE,
    locale: "ko",
    events: [],
    ...overrides,
  };
}

/**
 * Uncached guild: discord.js hands back the raw APIInteractionGuildMember,
 * where `permissions` is a bitfield *string* and `roles` a string array.
 * Anything calling `member.permissions.has()` throws on this shape.
 */
function rawInteraction(permissions: bigint, roles: string[]): ChatInputCommandInteraction {
  return {
    inGuild: () => true,
    memberPermissions: new PermissionsBitField(permissions),
    member: { permissions: String(permissions), roles },
  } as unknown as ChatInputCommandInteraction;
}

/** Cached guild: a real GuildMember with a role manager. */
function cachedInteraction(permissions: bigint, roles: string[]): ChatInputCommandInteraction {
  return {
    inGuild: () => true,
    memberPermissions: new PermissionsBitField(permissions),
    member: {
      permissions: new PermissionsBitField(permissions),
      roles: { cache: new Map(roles.map((id) => [id, { id }])) },
    },
  } as unknown as ChatInputCommandInteraction;
}

describe("uncached guild (raw member payload)", () => {
  test("Manage Server is allowed without touching member.permissions", () => {
    expect(checkManagePermission(rawInteraction(PermissionFlagsBits.ManageGuild, []), guild())).toBe(
      "",
    );
  });

  test("the admin role is allowed", () => {
    expect(checkManagePermission(rawInteraction(0n, [ADMIN_ROLE]), guild())).toBe("");
  });

  test("neither is denied, naming the role", () => {
    const error = checkManagePermission(rawInteraction(0n, ["other"]), guild());
    expect(error).toContain(ADMIN_ROLE);
  });
});

describe("cached guild (GuildMember)", () => {
  test("Manage Server is allowed", () => {
    expect(
      checkManagePermission(cachedInteraction(PermissionFlagsBits.ManageGuild, []), guild()),
    ).toBe("");
  });

  test("the admin role is allowed", () => {
    expect(checkManagePermission(cachedInteraction(0n, [ADMIN_ROLE]), guild())).toBe("");
  });

  test("neither is denied", () => {
    expect(checkManagePermission(cachedInteraction(0n, []), guild())).not.toBe("");
  });
});

describe("bot membership", () => {
  /** A user-installed app: interactions arrive, but the guild is not cached. */
  const notAMember = {
    inGuild: () => true,
    guild: null,
  } as unknown as ChatInputCommandInteraction;

  const joined = {
    inGuild: () => true,
    guild: { id: "g1" },
  } as unknown as ChatInputCommandInteraction;

  test("an uncached guild is reported as the bot not being a member", () => {
    const error = checkBotIsMember(notAMember);
    expect(error).toContain("not a member of this server");
    // The message has to be actionable on its own.
    expect(error).toContain("Add to Server");
    expect(error).toContain("scope=bot");
    expect(error).toContain("member list");
  });

  test("a joined guild passes", () => {
    expect(checkBotIsMember(joined)).toBe("");
  });

  test("outside a guild there is nothing to check", () => {
    const dm = { inGuild: () => false, guild: null } as unknown as ChatInputCommandInteraction;
    expect(checkBotIsMember(dm)).toBe("");
  });
});

describe("edge cases", () => {
  test("a server with no admin role falls back to Manage Server", () => {
    const error = checkManagePermission(rawInteraction(0n, []), guild({ adminRoleId: undefined }));
    expect(error).toContain("Manage Server");
    expect(checkManagePermission(rawInteraction(PermissionFlagsBits.ManageGuild, []), guild({ adminRoleId: undefined }))).toBe("");
  });

  test("outside a guild it is refused", () => {
    const dm = { inGuild: () => false } as unknown as ChatInputCommandInteraction;
    expect(checkManagePermission(dm, guild())).toContain("inside a server");
  });

  test("a missing member does not throw", () => {
    const odd = {
      inGuild: () => true,
      memberPermissions: null,
      member: null,
    } as unknown as ChatInputCommandInteraction;
    expect(() => checkManagePermission(odd, guild())).not.toThrow();
    expect(checkManagePermission(odd, guild())).toContain(ADMIN_ROLE);
  });
});
