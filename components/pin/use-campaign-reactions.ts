"use client";

import { useRealtimeReactions } from "@/components/use-realtime-reactions";
import {
  CAMPAIGN_REACTION_EMOJIS,
  CAMPAIGN_REACTION_EVENT,
  campaignReactionTopic
} from "@/lib/pin/reactions";

export function useCampaignReactions(campaignId: string | null) {
  return useRealtimeReactions({
    scopeId: campaignId,
    topic: campaignId ? campaignReactionTopic(campaignId) : null,
    event: CAMPAIGN_REACTION_EVENT,
    allowedEmojis: CAMPAIGN_REACTION_EMOJIS,
    errorLabel: "Campaign reaction"
  });
}
