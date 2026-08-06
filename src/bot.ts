import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type Interaction,
} from "discord.js";

import { commandsByName, commands } from "./commands/index.ts";
import { startScheduler } from "./events/scheduler.ts";
import { ensureGuild } from "./store.ts";

async function registerCommands(client: Client<true>): Promise<void> {
  const payload = commands.map((command) => command.data.toJSON());

  try {
    await client.application.commands.set(payload);
    console.log(`🌐 Registered ${payload.length} global command(s)`);
  } catch (error) {
    console.warn("⚠️  Global command registration failed:", error);
  }

  // Per-guild registration propagates instantly, so a fresh deploy is usable
  // right away instead of waiting up to an hour for the global rollout.
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.commands.set(payload);
      console.log(`✅ Registered commands in '${guild.name}' (${guild.id})`);
    } catch (error) {
      console.warn(`⚠️  Failed to register in '${guild.name}':`, error);
    }
  }
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isAutocomplete()) {
    const command = commandsByName.get(interaction.commandName);
    try {
      await command?.autocomplete?.(interaction);
    } catch (error) {
      console.error(`❌ Autocomplete for /${interaction.commandName} failed:`, error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandsByName.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ /${interaction.commandName} failed:`, error);
    const payload = {
      content: "❌ Something went wrong running that command.",
      flags: MessageFlags.Ephemeral,
    } as const;
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch {
      // Interaction token already expired — nothing more we can do.
    }
  }
}

export function createClient(): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (ready) => {
    console.log(`✅ Logged in as ${ready.user.tag}`);

    for (const guild of ready.guilds.cache.values()) await ensureGuild(guild.id);

    await registerCommands(ready);
    startScheduler(ready);
  });

  client.on(Events.GuildCreate, async (guild) => {
    await ensureGuild(guild.id);
    try {
      await guild.commands.set(commands.map((command) => command.data.toJSON()));
      console.log(`👋 Joined '${guild.name}' and registered commands`);
    } catch (error) {
      console.warn(`⚠️  Failed to register commands in '${guild.name}':`, error);
    }
  });

  client.on(Events.InteractionCreate, handleInteraction);
  client.on(Events.Error, (error) => console.error("❌ Client error:", error));

  return client;
}
