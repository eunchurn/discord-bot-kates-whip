import { describe, expect, test } from "bun:test";
import { DiscordAPIError } from "discord.js";

import { classifySendError } from "./dispatch-errors.ts";

const CHANNEL = "1533242216804388996";

function apiError(code: number, message = "boom"): DiscordAPIError {
  return new DiscordAPIError(
    { code, message },
    code,
    403,
    "GET",
    `https://discord.com/api/v10/channels/${CHANNEL}`,
    {},
  );
}

describe("permanent failures are not retried", () => {
  test("Missing Access (50001) — the bot is not in the server", () => {
    const outcome = classifySendError(apiError(50001, "Missing Access"), CHANNEL);
    expect(outcome.kind).toBe("giveUp");
    expect(outcome.kind !== "sent" && outcome.message).toContain("member of the server");
    expect(outcome.kind !== "sent" && outcome.message).toContain(CHANNEL);
  });

  test("Missing Permissions (50013) names the permissions needed", () => {
    const outcome = classifySendError(apiError(50013, "Missing Permissions"), CHANNEL);
    expect(outcome.kind).toBe("giveUp");
    expect(outcome.kind !== "sent" && outcome.message).toContain("Send Messages");
  });

  test("Unknown Channel (10003)", () => {
    expect(classifySendError(apiError(10003), CHANNEL).kind).toBe("giveUp");
  });
});

describe("transient failures are retried", () => {
  test("an unrecognised Discord code", () => {
    const outcome = classifySendError(apiError(500000, "server on fire"), CHANNEL);
    expect(outcome.kind).toBe("retry");
    expect(outcome.kind !== "sent" && outcome.message).toContain("server on fire");
  });

  test("a network error", () => {
    const outcome = classifySendError(new Error("fetch failed"), CHANNEL);
    expect(outcome.kind).toBe("retry");
    expect(outcome.kind !== "sent" && outcome.message).toContain("fetch failed");
  });

  test("a non-Error throw still yields a message", () => {
    const outcome = classifySendError("weird", CHANNEL);
    expect(outcome.kind).toBe("retry");
    expect(outcome.kind !== "sent" && outcome.message).toContain("weird");
  });
});

describe("messages stay actionable", () => {
  test("every classification names the channel", () => {
    for (const error of [apiError(50001), apiError(50013), apiError(9999), new Error("x")]) {
      const outcome = classifySendError(error, CHANNEL);
      expect(outcome.kind !== "sent" && outcome.message).toContain(CHANNEL);
    }
  });
});
