import { describe, expect, test } from "bun:test";

import { PRESET_CHOICES } from "../events/presets.ts";
import { commands, commandsByName } from "./index.ts";

/**
 * Discord validates command definitions on registration, which happens only
 * after a successful login. Building the payload here catches malformed
 * options at test time instead of at deploy time.
 */
const payloads = commands.map((command) => command.data.toJSON());

interface Option {
  name: string;
  description: string;
  required?: boolean;
  type: number;
  options?: Option[];
}

const SUBCOMMAND = 1;

function walk(options: Option[] = []): Option[] {
  return options.flatMap((option) => [option, ...walk(option.options)]);
}

describe("command definitions", () => {
  test("every command builds a valid payload", () => {
    expect(payloads).toHaveLength(commands.length);
    for (const payload of payloads) {
      expect(payload.name).toMatch(/^[\w-]{1,32}$/);
      expect(payload.description!.length).toBeGreaterThan(0);
      expect(payload.description!.length).toBeLessThanOrEqual(100);
    }
  });

  test("the expected commands are registered", () => {
    expect([...commandsByName.keys()].sort()).toEqual(["event", "giftcodes", "help", "setup"]);
  });

  test("no option description exceeds Discord's 100 character limit", () => {
    for (const payload of payloads) {
      for (const option of walk(payload.options as Option[] | undefined)) {
        expect(option.description.length).toBeLessThanOrEqual(100);
        expect(option.name).toMatch(/^[\w-]{1,32}$/);
      }
    }
  });

  test("required options come before optional ones", () => {
    for (const payload of payloads) {
      const groups = [
        payload.options as Option[] | undefined,
        ...walk(payload.options as Option[] | undefined)
          .filter((option) => option.type === SUBCOMMAND)
          .map((option) => option.options),
      ];

      for (const group of groups) {
        if (!group) continue;
        const flags = group.filter((o) => o.type !== SUBCOMMAND).map((o) => o.required === true);
        const firstOptional = flags.indexOf(false);
        if (firstOptional === -1) continue;
        expect(flags.slice(firstOptional).some(Boolean)).toBe(false);
      }
    }
  });

  test("/event exposes the whole management surface", () => {
    const event = payloads.find((payload) => payload.name === "event");
    const subcommands = (event?.options as Option[])
      .filter((option) => option.type === SUBCOMMAND)
      .map((option) => option.name);

    expect(subcommands.sort()).toEqual([
      "add",
      "edit",
      "list",
      "next",
      "presets",
      "remove",
      "test",
      "toggle",
    ]);
  });

  test("/event add takes the time and lead-time options", () => {
    const event = payloads.find((payload) => payload.name === "event");
    const add = (event?.options as Option[]).find((option) => option.name === "add");
    const names = (add?.options ?? []).map((option) => option.name);

    expect(names).toContain("time");
    expect(names).toContain("days");
    expect(names).toContain("remind");
    expect(names).toContain("timezone");

    // `preset` and `time` are the only things a user must supply.
    const required = (add?.options ?? []).filter((option) => option.required).map((o) => o.name);
    expect(required).toEqual(["preset", "time"]);
  });

  test("preset choices stay within Discord's limit of 25", () => {
    expect(PRESET_CHOICES.length).toBeLessThanOrEqual(25);
    expect(PRESET_CHOICES.map((choice) => choice.value)).toContain("bear-hunt-1");
    expect(PRESET_CHOICES.map((choice) => choice.value)).toContain("swordland-showdown");
  });
});
