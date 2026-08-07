# Kate's Whip

Discord bot that reminds a Kingshot alliance before shared events start — Bear Hunt,
Swordland Showdown, Castle Battle and the rest. Set a schedule once, and the whole
alliance gets pinged 10 and 5 minutes before, plus at kickoff.

Times are configured in **UTC (Kingshot server time)**. Discord renders every
timestamp in each member's own local time, so nobody has to convert anything.

## Stack

TypeScript on Bun, discord.js v14, Prisma 7 over SQLite (via the libSQL driver
adapter — better-sqlite3's native bindings crash the Bun runtime), luxon for
timezone maths.

## Requirements

- [Bun](https://bun.sh) 1.2+
- A Discord bot token with the `applications.commands` and `bot` scopes

## Setup

```bash
bun install               # also runs `prisma generate`
cp .env.example .env      # then paste your DISCORD_TOKEN
bun run db:deploy         # create the SQLite database
bun run dev
```

Invite the bot with the **Send Messages**, **Embed Links** and **Mention Everyone**
permissions (the last one only if you want `@everyone` pings).

## Usage

Configure the server once:

```
/setup channel:#alliance admin_role:@R4
```

Then add events. `time` is UTC unless you pass `timezone`:

```
/event add preset:Bear Hunt 1  time:20:00  days:every2  mention:@Alliance
/event add preset:Bear Hunt 2  time:12:00  days:every2  anchor:2026-08-08
/event add preset:Swordland Showdown  time:13:00  days:sun  remind:60,10,5
/event add preset:Castle Battle  time:19:00  days:sat  mention_everyone:true
```

### Schedule options

| Option | Meaning | Examples |
|---|---|---|
| `time` | Start time, 24h, UTC by default | `20:00`, `8pm`, `0930` |
| `days` | Recurrence | `mon,thu` · `daily` · `every2` |
| `anchor` | For `everyN`, a date the cycle lands on | `2026-08-08` |
| `remind` | Minutes before start | `10,5` (default), `60,15,5` |
| `timezone` | Override UTC | `Asia/Seoul` |
| `mention` | Role to ping | `@Alliance` |
| `announce_at_start` | Also ping at kickoff | default `true` |

Bear Hunt runs on a two-day cycle, so use `days:every2` and give each trap a
different `anchor` one day apart — the two will never land on the same day.

### Commands

| Command | What it does |
|---|---|
| `/event add` | Schedule a new event reminder |
| `/event list` | Every event with its next start time |
| `/event next` | What's coming up, in order |
| `/event edit` | Change time, days, channel, mentions… |
| `/event toggle` | Pause or resume an event |
| `/event remove` | Delete an event |
| `/event test` | Preview a reminder — nobody gets pinged |
| `/event presets` | The alliance event catalog |
| `/setup` | Default channel, admin role, timezone, language |
| `/giftcodes` | Active Kingshot gift codes from kingshot.net |
| `/help` | Usage summary |

Managing events requires the **Manage Server** permission or the admin role —
**ZXC staff** by default, changeable with `/setup admin_role:`. Read-only
commands are open to everyone.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | — | Bot token (required) |
| `DATABASE_URL` | `file:./data/kates-whip.db` | SQLite database |
| `TICK_SECONDS` | `30` | How often reminders are evaluated |
| `DEFAULT_TIMEZONE` | `UTC` | Timezone for new servers and events |
| `DEFAULT_ADMIN_ROLE_ID` | — | Role seeded as the event-managing role on join |
| `DEFAULT_LEAD_MINUTES` | `10,5` | Default reminder lead times |

`DEFAULT_ADMIN_ROLE_ID` is set to `1470006260173897738` (**ZXC staff**) in the
compose file and the Kubernetes manifest, so the bot is manageable the moment it
joins. `/setup admin_role:` overrides it per server.

## Data model

Three tables, defined in [`prisma/schema.prisma`](prisma/schema.prisma):

- `guilds` — per-server channel, admin role, timezone, language
- `events` — one row per scheduled event
- `fired_reminders` — one row per reminder already sent, so restarts never
  double-ping

The whole dataset is mirrored in memory for synchronous reads; every write goes
through Prisma before returning, so cache and database never drift.

## Development

```bash
bun run dev          # watch mode
bun test             # 54 tests: schedule maths, dispatch, persistence, command defs
bun run typecheck    # tsc --noEmit
bun run db:migrate   # create a migration after editing schema.prisma
bun run db:studio    # browse the database
```

## Deployment

```bash
docker compose up -d --build
```

The container entrypoint runs `prisma migrate deploy` before starting, so the
database is brought up to schema on every deploy.

For Kubernetes, see [k8s/README.md](k8s/README.md). Keep `replicas: 1` — a second
pod would send every reminder twice.

## How reminders fire

The scheduler ticks every `TICK_SECONDS` and computes each event's next start
times. A reminder is sent when the tick lands within 3 minutes after its due
moment, and every send is recorded in `fired_reminders` keyed by
`occurrence + lead` — written *before* the message goes out. That means a
restart never double-pings, and a bot that was offline for an hour won't spam
stale reminders when it comes back. Ledger rows older than 14 days are pruned.

Event data comes from the [Kingshot wiki](https://kingshotwiki.com/events/).
Exact start times differ per kingdom and alliance, so presets carry only the
recurrence pattern — you set the actual time.
