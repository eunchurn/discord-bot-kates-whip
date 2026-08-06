import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

import { GIFT_CODES_API_URL } from "../config.ts";
import type { Command } from "./types.ts";

const PER_PAGE = 10;
const COLLECTOR_MS = 3 * 60 * 1000;

interface GiftCode {
  code?: string;
  expiresAt?: string | null;
}

function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "♾️ No expiry";
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return expiresAt;
  const seconds = Math.floor(parsed / 1000);
  return parsed < Date.now() ? `⛔ Expired <t:${seconds}:R>` : `⏳ Expires <t:${seconds}:R>`;
}

function buildEmbed(codes: GiftCode[], page: number): EmbedBuilder {
  const start = page * PER_PAGE;
  const end = Math.min(start + PER_PAGE, codes.length);
  const maxPage = Math.max(0, Math.ceil(codes.length / PER_PAGE) - 1);

  const embed = new EmbedBuilder()
    .setTitle("🎁 Kingshot Gift Codes")
    .setDescription(`Showing ${start + 1}-${end} of ${codes.length} active code(s)`)
    .setColor(0x2ecc71)
    .setFooter({ text: `Page ${page + 1}/${maxPage + 1} • Source: kingshot.net` });

  for (const item of codes.slice(start, end)) {
    embed.addFields({
      name: `\`${item.code ?? "Unknown"}\``,
      value: formatExpiry(item.expiresAt),
      inline: false,
    });
  }

  return embed;
}

function buildRow(page: number, maxPage: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("giftcodes:prev")
      .setLabel("◀️ Previous")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("giftcodes:next")
      .setLabel("Next ▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= maxPage),
  );
}

async function fetchGiftCodes(): Promise<GiftCode[]> {
  const response = await fetch(GIFT_CODES_API_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = (await response.json()) as {
    status?: string;
    message?: string;
    data?: { giftCodes?: GiftCode[] };
  };
  if (payload.status !== "success") {
    throw new Error(payload.message ?? "Unknown API error");
  }
  return payload.data?.giftCodes ?? [];
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  let codes: GiftCode[];
  try {
    codes = await fetchGiftCodes();
  } catch (error) {
    await interaction.editReply(`❌ Failed to fetch gift codes: ${String(error)}`);
    console.error("❌ /giftcodes failed:", error);
    return;
  }

  if (codes.length === 0) {
    await interaction.editReply("❌ No gift codes available right now.");
    return;
  }

  let page = 0;
  const maxPage = Math.max(0, Math.ceil(codes.length / PER_PAGE) - 1);

  const message = await interaction.editReply({
    embeds: [buildEmbed(codes, page)],
    components: maxPage > 0 ? [buildRow(page, maxPage)] : [],
  });

  if (maxPage === 0) return;

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_MS,
  });

  collector.on("collect", async (button: ButtonInteraction) => {
    if (button.user.id !== interaction.user.id) {
      await button.reply({
        content: "Run `/giftcodes` yourself to page through the list.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    page = button.customId === "giftcodes:next" ? Math.min(maxPage, page + 1) : Math.max(0, page - 1);
    await button.update({ embeds: [buildEmbed(codes, page)], components: [buildRow(page, maxPage)] });
  });

  collector.on("end", async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch {
      // Message may already be gone — nothing to clean up.
    }
  });
}

export const giftCodesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("giftcodes")
    .setDescription("List currently available Kingshot gift codes from kingshot.net"),
  execute,
};
