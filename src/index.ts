import { createClient } from "./bot.ts";
import { DATABASE_URL, DEFAULT_TIMEZONE, DISCORD_TOKEN, TICK_SECONDS } from "./config.ts";
import { disconnectDb } from "./db.ts";
import { loadStore } from "./store.ts";

async function main(): Promise<void> {
  console.log("🪢 Starting Kate's Whip...");
  console.log(`🗄️  Database: ${DATABASE_URL}`);
  console.log(`⏱️  Tick interval: ${TICK_SECONDS}s`);
  console.log(`🌍 Default timezone: ${DEFAULT_TIMEZONE}`);

  if (!DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN is not set");
    process.exit(1);
  }

  // Fail fast on a broken database rather than after connecting to Discord.
  await loadStore();

  const client = createClient();

  const shutdown = (signal: string) => {
    console.log(`\n👋 ${signal} received, shutting down`);
    void client
      .destroy()
      .finally(() => disconnectDb())
      .finally(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await client.login(DISCORD_TOKEN);
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
