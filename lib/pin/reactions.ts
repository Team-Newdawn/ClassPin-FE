export const CAMPAIGN_REACTION_EVENT = "emoji";
export const CAMPAIGN_REACTION_EMOJIS = ["👍", "❤️", "👏", "😂"] as const;
export const CAMPAIGN_REACTION_DURATION_MS = 1_800;
export const CAMPAIGN_REACTION_LANES = [8, 92, 32, 68, 50, 20, 80, 44] as const;

export type CampaignReactionEmoji = (typeof CAMPAIGN_REACTION_EMOJIS)[number];
export type CampaignReactionPayload = { id: string; emoji: CampaignReactionEmoji };

export function campaignReactionTopic(campaignId: string) {
  return `campaign-reactions:${campaignId}`;
}

export function parseCampaignReaction(value: unknown): CampaignReactionPayload | null {
  if (!value || typeof value !== "object") return null;
  const { id, emoji } = value as { id?: unknown; emoji?: unknown };
  if (typeof id !== "string" || !id || id.length > 64) return null;
  if (!CAMPAIGN_REACTION_EMOJIS.includes(emoji as CampaignReactionEmoji)) return null;
  return { id, emoji: emoji as CampaignReactionEmoji };
}

export function scheduleCampaignReaction(readyAt: readonly number[], now: number) {
  let lane = 0;
  for (let index = 1; index < readyAt.length; index += 1) {
    if (readyAt[index] < readyAt[lane]) lane = index;
  }
  const delay = Math.max(0, (readyAt[lane] ?? now) - now);
  const nextReadyAt = [...readyAt];
  nextReadyAt[lane] = Math.max(now, readyAt[lane] ?? now) + 350;
  return { lane, delay, nextReadyAt };
}
