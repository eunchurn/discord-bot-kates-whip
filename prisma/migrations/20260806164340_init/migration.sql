-- CreateTable
CREATE TABLE "guilds" (
    "guild_id" TEXT NOT NULL PRIMARY KEY,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "default_channel_id" TEXT,
    "admin_role_id" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ko'
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preset_key" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "note" TEXT,
    "channel_id" TEXT NOT NULL,
    "mentions" TEXT NOT NULL,
    "lead_minutes" TEXT NOT NULL,
    "announce_at_start" BOOLEAN NOT NULL,
    "schedule" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "events_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("guild_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fired_reminders" (
    "event_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fired_at" DATETIME NOT NULL,

    PRIMARY KEY ("event_id", "key"),
    CONSTRAINT "fired_reminders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "events_guild_id_idx" ON "events"("guild_id");

-- CreateIndex
CREATE INDEX "fired_reminders_fired_at_idx" ON "fired_reminders"("fired_at");
