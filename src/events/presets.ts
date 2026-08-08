/**
 * Alliance event catalog, mirroring the "Alliance Events" section of
 * https://kingshotwiki.com/events/
 *
 * The wiki documents *what* each event is and how often it recurs, but not the
 * wall-clock time — those are picked per kingdom/alliance (R4/R5 set the Bear
 * Trap hour, Swordland time slots are voted on). So a preset only carries the
 * recurrence hint and flavour; the actual day/time comes from `/event add`.
 */
export interface EventPreset {
  key: string;
  label: string;
  emoji: string;
  /** Value to pass to `days` if the user does not override it. */
  defaultDays?: string;
  /** Recurrence as described by the wiki, shown in `/event presets`. */
  cadence: string;
  note: string;
  wikiUrl?: string;
}

export const PRESETS: EventPreset[] = [
  {
    key: "bear-hunt-1",
    label: "Bear Hunt 1",
    emoji: "🐻",
    defaultDays: "every2",
    cadence: "Every 2 days",
    note: "First bear trap. Joining this one locks you out of Bear Hunt 2.",
    wikiUrl: "https://kingshotwiki.com/events/bear-hunt/",
  },
  {
    key: "bear-hunt-2",
    label: "Bear Hunt 2",
    emoji: "🐻",
    defaultDays: "every2",
    cadence: "Every 2 days (offset from Bear Hunt 1)",
    note: "Second bear trap, two days after the first — for members on other hours.",
    wikiUrl: "https://kingshotwiki.com/events/bear-hunt/",
  },
  {
    key: "swordland-showdown",
    label: "Swordland Showdown",
    emoji: "⚔️",
    defaultDays: "every2w:sun",
    cadence: "Bi-weekly, on Sunday",
    note: "Legion battles. Sign-up closes 2 days before, so remind early too.",
    wikiUrl: "https://kingshotwiki.com/events/swordland-showdown/",
  },
  {
    key: "alliance-championship",
    label: "Alliance Championship",
    emoji: "🏆",
    cadence: "Seasonal",
    note: "Cross-kingdom alliance tournament.",
    wikiUrl: "https://kingshotwiki.com/events/alliance-championship/",
  },
  {
    key: "alliance-brawl",
    label: "Alliance Brawl",
    emoji: "🥊",
    cadence: "Weekly",
    note: "Alliance-vs-alliance brawl. Bring rally troops.",
    wikiUrl: "https://kingshotwiki.com/events/alliance-brawl/",
  },
  {
    key: "tri-alliance-clash",
    label: "Tri-Alliance Clash",
    emoji: "🔺",
    defaultDays: "monthly",
    cadence: "Monthly",
    note: "Three-way alliance fight over contested points.",
    wikiUrl: "https://kingshotwiki.com/events/tri-alliance-clash/",
  },
  {
    key: "kingdom-of-power",
    label: "Kingdom of Power",
    emoji: "👑",
    cadence: "Recurring",
    note: "Kingdom-wide power struggle.",
    wikiUrl: "https://kingshotwiki.com/events/kingdom-of-power/",
  },
  {
    key: "castle-battle",
    label: "Castle Battle",
    emoji: "🏰",
    cadence: "Weekly",
    note: "Fight for the King's Castle. Full alliance turnout matters.",
    wikiUrl: "https://kingshotwiki.com/events/castle-battle/",
  },
  {
    key: "alliance-mobilization",
    label: "Alliance Mobilization",
    emoji: "📦",
    cadence: "Recurring, multi-day",
    note: "Complete mobilization quests together for alliance points.",
    wikiUrl: "https://kingshotwiki.com/events/alliance-mobilization/",
  },
  {
    key: "merchant-empire",
    label: "Merchant Empire",
    emoji: "💰",
    cadence: "Recurring",
    note: "Trade route event run as an alliance.",
    wikiUrl: "https://kingshotwiki.com/events/merchant-empire-event/",
  },
  {
    key: "viking-vengeance",
    label: "Viking Vengeance",
    emoji: "🪓",
    cadence: "Recurring",
    note: "Alliance raid event against viking waves.",
    wikiUrl: "https://kingshotwiki.com/events/viking-vengeance/",
  },
  {
    key: "flamedragon-tyrant",
    label: "Flamedragon Tyrant",
    emoji: "🐉",
    cadence: "Recurring",
    note: "World boss style rally. Coordinate rally leaders in advance.",
    wikiUrl: "https://kingshotwiki.com/events/flamedragon-tyrant/",
  },
  {
    key: "cesares-fury",
    label: "Cesare's Fury",
    emoji: "🦁",
    cadence: "Recurring",
    note: "Alliance boss event.",
    wikiUrl: "https://kingshotwiki.com/events/cesares-fury/",
  },
  {
    key: "custom",
    label: "Custom event",
    emoji: "⭐",
    cadence: "Whatever you configure",
    note: "Anything else — alliance meetings, rally trains, migration windows.",
  },
];

export function findPreset(key: string): EventPreset | undefined {
  return PRESETS.find((preset) => preset.key === key);
}

/** Slash-command choices (Discord allows at most 25). */
export const PRESET_CHOICES = PRESETS.map((preset) => ({
  name: `${preset.emoji} ${preset.label}`,
  value: preset.key,
}));
