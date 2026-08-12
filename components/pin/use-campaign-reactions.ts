"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CAMPAIGN_REACTION_DURATION_MS,
  CAMPAIGN_REACTION_EVENT,
  CAMPAIGN_REACTION_LANES,
  campaignReactionTopic,
  parseCampaignReaction,
  scheduleCampaignReaction,
  type CampaignReactionPayload
} from "@/lib/pin/reactions";
import { ensureAnonymousUser, getAudienceSupabaseClient } from "@/lib/supabase/client";

const MAX_VISIBLE_REACTIONS = 64;
const MAX_RECENT_REACTION_IDS = 128;

type LiveCampaignReaction = CampaignReactionPayload & {
  campaignId: string;
  left: number;
  delay: number;
};

export function useCampaignReactions(campaignId: string | null) {
  const [reactions, setReactions] = useState<LiveCampaignReaction[]>([]);
  const laneReadyAtRef = useRef<number[]>(CAMPAIGN_REACTION_LANES.map(() => 0));
  const timersRef = useRef(new Set<number>());
  const recentIdsRef = useRef(new Set<string>());

  const addReaction = useCallback((reaction: CampaignReactionPayload) => {
    if (!campaignId || recentIdsRef.current.has(reaction.id)) return;
    recentIdsRef.current.add(reaction.id);
    if (recentIdsRef.current.size > MAX_RECENT_REACTION_IDS) {
      const oldestId = recentIdsRef.current.values().next().value;
      if (oldestId) recentIdsRef.current.delete(oldestId);
    }

    const scheduled = scheduleCampaignReaction(laneReadyAtRef.current, performance.now());
    laneReadyAtRef.current = scheduled.nextReadyAt;
    const liveReaction = {
      ...reaction,
      campaignId,
      left: CAMPAIGN_REACTION_LANES[scheduled.lane],
      delay: scheduled.delay
    };
    setReactions((current) => [
      ...current.filter((item) => item.campaignId === campaignId).slice(-(MAX_VISIBLE_REACTIONS - 1)),
      liveReaction
    ]);

    const timer = window.setTimeout(() => {
      setReactions((current) => current.filter((item) => item.id !== liveReaction.id));
      timersRef.current.delete(timer);
    }, CAMPAIGN_REACTION_DURATION_MS + liveReaction.delay);
    timersRef.current.add(timer);
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    let active = true;
    let channel: RealtimeChannel | null = null;
    const timers = timersRef.current;
    laneReadyAtRef.current = CAMPAIGN_REACTION_LANES.map(() => 0);
    recentIdsRef.current.clear();

    const connect = async () => {
      await ensureAnonymousUser();
      if (!active) return;
      const client = getAudienceSupabaseClient();
      if (!client) return;
      channel = client
        .channel(campaignReactionTopic(campaignId))
        .on("broadcast", { event: CAMPAIGN_REACTION_EVENT }, ({ payload }) => {
          if (!active) return;
          const reaction = parseCampaignReaction(payload);
          if (reaction) addReaction(reaction);
        })
        .subscribe((status, error) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Campaign reaction channel failed", error ?? status);
          }
        });
    };

    void connect().catch((error) => console.error("Campaign reaction subscription failed", error));
    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      if (channel) void getAudienceSupabaseClient()?.removeChannel(channel);
    };
  }, [addReaction, campaignId]);

  return {
    reactions: reactions.filter((reaction) => reaction.campaignId === campaignId),
    addReaction
  };
}
