export const REALTIME_REACTION_DURATION_MS = 1_800;
export const REALTIME_REACTION_LANES = [8, 92, 32, 68, 50, 20, 80, 44] as const;

export type RealtimeReactionPayload<Emoji extends string = string> = { id: string; emoji: Emoji };

export function parseRealtimeReaction<Emoji extends string>(
  value: unknown,
  allowedEmojis: readonly Emoji[]
): RealtimeReactionPayload<Emoji> | null {
  if (!value || typeof value !== "object") return null;
  const { id, emoji } = value as { id?: unknown; emoji?: unknown };
  if (typeof id !== "string" || !id || id.length > 64) return null;
  if (!allowedEmojis.includes(emoji as Emoji)) return null;
  return { id, emoji: emoji as Emoji };
}

export function scheduleRealtimeReaction(readyAt: readonly number[], now: number) {
  let lane = 0;
  for (let index = 1; index < readyAt.length; index += 1) {
    if (readyAt[index] < readyAt[lane]) lane = index;
  }
  const delay = Math.max(0, (readyAt[lane] ?? now) - now);
  const nextReadyAt = [...readyAt];
  nextReadyAt[lane] = Math.max(now, readyAt[lane] ?? now) + 350;
  return { lane, delay, nextReadyAt };
}
