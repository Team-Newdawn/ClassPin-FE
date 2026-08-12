import type { FeedbackPin } from "./types";

type PinReactionCount = Pick<FeedbackPin, "id" | "reactionCount">;

export const withPinReaction = (pin: FeedbackPin, reactedByMe: boolean): FeedbackPin => pin.reactedByMe === reactedByMe ? pin : {
  ...pin,
  reactedByMe,
  reactionCount: Math.max(0, pin.reactionCount + (reactedByMe ? 1 : -1)),
};

export const receivedEmpathyCount = (
  previousCounts: ReadonlyMap<string, number>,
  pins: readonly PinReactionCount[],
  ownPinIds: ReadonlySet<string>,
) => pins.reduce((total, pin) => ownPinIds.has(pin.id)
  ? total + Math.max(0, pin.reactionCount - (previousCounts.get(pin.id) ?? 0))
  : total, 0);

export const initialEmpathyCounts = (
  initialPins: readonly PinReactionCount[],
  storedPins: readonly PinReactionCount[],
  publicPins: readonly PinReactionCount[],
) => {
  const storedPinIds = new Set(storedPins.map((pin) => pin.id));
  const counts = new Map(initialPins.map((pin) => [pin.id, pin.reactionCount]));
  publicPins.forEach((pin) => { if (!storedPinIds.has(pin.id)) counts.set(pin.id, pin.reactionCount); });
  return counts;
};
