import { ensureAnonymousUser, getAudienceSupabaseClient } from "@/app/_infrastructure/supabase/client";
import type { RealtimeReactionPayload } from "@/app/_model/realtime-reactions";

export async function subscribeToRealtimeReactions(
  topic: string,
  event: string,
  onPayload: (payload: unknown) => void,
  onError: (error: unknown) => void
): Promise<() => void> {
  const client = getAudienceSupabaseClient();
  if (!client) {
    const channel = new BroadcastChannel(topic);
    channel.onmessage = ({ data }) => { if (data?.event === event) onPayload(data.payload); };
    return () => channel.close();
  }

  await ensureAnonymousUser();
  const channel = client
    .channel(topic)
    .on("broadcast", { event }, ({ payload }) => onPayload(payload))
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError(error ?? status);
    });
  return () => { void client.removeChannel(channel); };
}

export async function publishRealtimeReaction<Emoji extends string>(
  topic: string,
  event: string,
  reaction: RealtimeReactionPayload<Emoji>
) {
  await ensureAnonymousUser();
  const client = getAudienceSupabaseClient();
  if (!client) {
    const channel = new BroadcastChannel(topic);
    channel.postMessage({ event, payload: reaction });
    channel.close();
    return;
  }

  const channel = client.channel(topic);
  try {
    await channel.httpSend(event, reaction);
  } finally {
    await client.removeChannel(channel);
  }
}
