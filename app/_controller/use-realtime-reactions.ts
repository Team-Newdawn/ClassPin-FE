"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REALTIME_REACTION_DURATION_MS,
  REALTIME_REACTION_LANES,
  parseRealtimeReaction,
  scheduleRealtimeReaction,
  type RealtimeReactionPayload
} from "@/app/_model/realtime-reactions";
import { subscribeToRealtimeReactions } from "@/app/_service/realtime-reaction-service";

const MAX_VISIBLE_REACTIONS = 64;
const MAX_RECENT_REACTION_IDS = 128;

type LiveReaction<Emoji extends string> = RealtimeReactionPayload<Emoji> & {
  scopeId: string;
  left: number;
  delay: number;
};

export function useRealtimeReactions<Emoji extends string>({
  scopeId,
  topic,
  event,
  allowedEmojis,
  errorLabel
}: {
  scopeId: string | null;
  topic: string | null;
  event: string;
  allowedEmojis: readonly Emoji[];
  errorLabel: string;
}) {
  const [reactions, setReactions] = useState<LiveReaction<Emoji>[]>([]);
  const laneReadyAtRef = useRef<number[]>(REALTIME_REACTION_LANES.map(() => 0));
  const timersRef = useRef(new Set<number>());
  const recentIdsRef = useRef(new Set<string>());

  const addReaction = useCallback((reaction: RealtimeReactionPayload<Emoji>) => {
    if (!scopeId || recentIdsRef.current.has(reaction.id)) return;
    recentIdsRef.current.add(reaction.id);
    if (recentIdsRef.current.size > MAX_RECENT_REACTION_IDS) {
      const oldestId = recentIdsRef.current.values().next().value;
      if (oldestId) recentIdsRef.current.delete(oldestId);
    }

    const scheduled = scheduleRealtimeReaction(laneReadyAtRef.current, performance.now());
    laneReadyAtRef.current = scheduled.nextReadyAt;
    const liveReaction: LiveReaction<Emoji> = {
      ...reaction,
      scopeId,
      left: REALTIME_REACTION_LANES[scheduled.lane],
      delay: scheduled.delay
    };
    setReactions((current) => [
      ...current.filter((item) => item.scopeId === scopeId).slice(-(MAX_VISIBLE_REACTIONS - 1)),
      liveReaction
    ]);

    const timer = window.setTimeout(() => {
      setReactions((current) => current.filter((item) => item.id !== liveReaction.id));
      timersRef.current.delete(timer);
    }, REALTIME_REACTION_DURATION_MS + liveReaction.delay);
    timersRef.current.add(timer);
  }, [scopeId]);

  useEffect(() => {
    if (!scopeId || !topic) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const timers = timersRef.current;
    laneReadyAtRef.current = REALTIME_REACTION_LANES.map(() => 0);
    recentIdsRef.current.clear();

    void subscribeToRealtimeReactions(
      topic,
      event,
      (payload) => {
        if (!active) return;
        const reaction = parseRealtimeReaction(payload, allowedEmojis);
        if (reaction) addReaction(reaction);
      },
      (error) => console.error(`${errorLabel} channel failed`, error)
    ).then((close) => {
      if (active) unsubscribe = close;
      else close();
    }).catch((error) => console.error(`${errorLabel} subscription failed`, error));
    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      unsubscribe?.();
    };
  }, [addReaction, allowedEmojis, errorLabel, event, scopeId, topic]);

  return {
    reactions: reactions.filter((reaction) => reaction.scopeId === scopeId),
    addReaction
  };
}
