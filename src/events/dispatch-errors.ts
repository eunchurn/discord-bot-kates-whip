import { DiscordAPIError } from "discord.js";

/**
 * Discord error codes that cannot resolve on their own. Retrying these just
 * repeats the same failure every tick until the catch-up window closes, so the
 * reminder is dropped and logged once with something the operator can act on.
 */
const PERMANENT: Record<number, string> = {
  10003: "the channel no longer exists",
  50001: "the bot cannot see that channel — is it actually a member of the server?",
  50013: "the bot lacks permission there — it needs View Channel, Send Messages and Embed Links",
  50007: "the recipient does not accept messages from this bot",
  160002: "the channel type does not accept messages",
};

export type SendOutcome =
  | { kind: "sent" }
  /** Worth another attempt on the next tick. */
  | { kind: "retry"; message: string }
  /** Hopeless until a human changes something; do not retry. */
  | { kind: "giveUp"; message: string };

/**
 * Classify a failed send. Permission and missing-channel errors are permanent;
 * anything else (network blips, 5xx, rate limits) gets another go.
 */
export function classifySendError(error: unknown, channelId: string): SendOutcome {
  if (error instanceof DiscordAPIError) {
    const code = Number(error.code);
    const reason = PERMANENT[code];
    if (reason) {
      return {
        kind: "giveUp",
        message: `cannot post in channel ${channelId}: ${reason} (Discord code ${code})`,
      };
    }
    return {
      kind: "retry",
      message: `Discord API error ${code} on channel ${channelId}: ${error.message}`,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { kind: "retry", message: `${message} (channel ${channelId})` };
}
