/** How an event repeats. */
export type ScheduleKind =
  | "weekly"
  | "daily"
  | "interval"
  | "once"
  | "monthlyDay"
  | "monthlyWeekday";

export interface EventSchedule {
  kind: ScheduleKind;
  /** "HH:mm" in the schedule's own timezone. */
  time: string;
  /** IANA timezone, e.g. "Asia/Seoul". */
  timezone: string;
  /** Luxon weekday numbers, 1 = Monday … 7 = Sunday. Only for "weekly". */
  weekdays?: number[];
  /** Repeat every N days. Only for "interval" — a fortnight is 14. */
  intervalDays?: number;
  /** "YYYY-MM-DD" — the cycle start for "interval", the date for "once". */
  anchorDate?: string;
  /**
   * "monthlyDay": day of the month, 1–31. Months too short for it fall back to
   * their last day, so 31 still fires in February.
   */
  dayOfMonth?: number;
  /** "monthlyWeekday": 1st–5th occurrence in the month, or -1 for the last. */
  nthWeek?: number;
  /** "monthlyWeekday": 1 = Monday … 7 = Sunday. */
  weekday?: number;
}

export interface EventConfig {
  id: string;
  name: string;
  /** Key from the preset catalog, or "custom". */
  presetKey: string;
  emoji: string;
  note?: string;
  channelId: string;
  /** Role ids to ping. The literal "everyone" means @everyone. */
  mentions: string[];
  /** Minutes before the start to fire a reminder, sorted descending. */
  leadMinutes: number[];
  /** Also announce the moment the event starts. */
  announceAtStart: boolean;
  schedule: EventSchedule;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  /** Dedupe ledger: "<occurrenceISO>|<lead>" -> ISO timestamp it was sent. */
  fired: Record<string, string>;
}

export interface GuildConfig {
  guildId: string;
  timezone: string;
  /** Fallback announcement channel when an event does not set its own. */
  defaultChannelId?: string;
  /** Role allowed to manage events, in addition to Manage Server. */
  adminRoleId?: string;
  /** Language used for the broadcast reminders. */
  locale: "ko" | "en";
  events: EventConfig[];
}

export interface BotData {
  version: number;
  guilds: Record<string, GuildConfig>;
}
