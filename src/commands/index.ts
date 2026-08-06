import { eventCommand } from "./event.ts";
import { giftCodesCommand } from "./giftcodes.ts";
import { helpCommand } from "./help.ts";
import { setupCommand } from "./setup.ts";
import type { Command } from "./types.ts";

export const commands: Command[] = [
  setupCommand,
  eventCommand,
  giftCodesCommand,
  helpCommand,
];

export const commandsByName = new Map<string, Command>(
  commands.map((command) => [command.data.name, command]),
);

export type { Command };
