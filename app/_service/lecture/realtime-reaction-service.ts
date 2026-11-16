import { ensureAnonymousUser, getAudienceSupabaseClient } from "@/app/_infrastructure/supabase/client";

export async function subscribeToRealtimeReactions(
  topic: string,
  event: string,
  onPayload: (payload: unknown) => void,
  onError: (error: unknown) => void,
  onSignal?: { event: string; handler: () => void }
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
    .on("broadcast", { event }, ({ payload }) => onPayload(payload));
  if (onSignal) channel.on("broadcast", { event: onSignal.event }, () => onSignal.handler());
  channel.subscribe((status, error) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError(error ?? status);
  });
  return () => { void client.removeChannel(channel); };
}

export async function publishRealtimeReaction(topic: string, event: string, payload: Record<string, unknown>, keepalive = false) {
  const client = getAudienceSupabaseClient();
  if (!client) {
    const channel = new BroadcastChannel(topic);
    channel.postMessage({ event, payload });
    channel.close();
    return;
  }
  if (keepalive) {
    // 공개 broadcast는 publishable key로 보낸다. 종료 중에는 인증 Promise를 기다리지 않는다.
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!response.ok) throw new Error(`Realtime broadcast failed (${response.status})`);
    return;
  }
  await ensureAnonymousUser();

  // 같은 토픽을 이미 구독 중이면 그 채널로 보낸다. client.channel() 은 구독 중인 채널을
  // 그대로 돌려주므로, 새로 만든 셈 치고 지우면 수신 구독까지 끊긴다.
  const subscribed = client.getChannels().find((channel) => channel.subTopic === topic);
  if (subscribed) {
    await subscribed.httpSend(event, payload);
    return;
  }
  const channel = client.channel(topic);
  try {
    await channel.httpSend(event, payload);
  } finally {
    await client.removeChannel(channel);
  }
}
