import {
  REALTIME_REACTION_DURATION_MS,
  REALTIME_REACTION_LANES,
  parseRealtimeReaction,
  scheduleRealtimeReaction
} from "../realtime-reactions.ts";

export const CAMPAIGN_REACTION_EVENT = "emoji";
export const CAMPAIGN_REACTION_EMOJIS = ["❤️", "👏", "😂"] as const;
export const CAMPAIGN_REACTION_DURATION_MS = REALTIME_REACTION_DURATION_MS;
export const CAMPAIGN_REACTION_LANES = REALTIME_REACTION_LANES;

export type CampaignReactionEmoji = (typeof CAMPAIGN_REACTION_EMOJIS)[number];
export type CampaignReactionPayload = { id: string; emoji: CampaignReactionEmoji };

export function campaignReactionTopic(campaignId: string) {
  return `campaign-reactions:${campaignId}`;
}

export function parseCampaignReaction(value: unknown): CampaignReactionPayload | null {
  return parseRealtimeReaction(value, CAMPAIGN_REACTION_EMOJIS);
}

export function scheduleCampaignReaction(readyAt: readonly number[], now: number) {
  return scheduleRealtimeReaction(readyAt, now);
}
