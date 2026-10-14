"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/app/_model/class/session";
import { LECTURE_AUDIENCE_EVENT, lectureAudienceTopic } from "@/app/_model/lecture-reactions";
import { publishRealtimeReaction, subscribeToRealtimeReactions } from "@/app/_service/realtime-reaction-service";

const HEARTBEAT_MS = 60_000;
const ACTIVE_WINDOW_MS = 150_000;

/**
 * 참여 중인 탭이 1분마다 강사 전용 토픽에 신호를 보낸다. Realtime Presence 는 입장·퇴장마다 모든 참여자에게
 * 변경을 보내 참여자 N명이면 N² 메시지가 되므로 쓰지 않는다. 화면이 꺼진 탭은 보내지 않는다.
 */
export function useAudienceHeartbeat(lectureId: string | null) {
  useEffect(() => {
    if (!lectureId) return;
    const id = crypto.randomUUID();
    const send = () => {
      if (document.visibilityState === "hidden") return;
      void publishRealtimeReaction(lectureAudienceTopic(lectureId), LECTURE_AUDIENCE_EVENT, { id })
        .catch((error) => console.error("Audience heartbeat failed", error));
    };
    send();
    const timer = setInterval(send, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, [lectureId]);
}

/**
 * 최근 2.5분 안에 신호를 보낸 탭 수. 들어온 사람은 바로 늘고, 나간 사람은 최대 2.5분 뒤에 빠진다.
 * ponytail: 탭 단위 근사치이고 위조 신호를 막지 않는다. 정확한 출석이 필요해지면 BE 입장 기록으로 센다.
 */
export function useLiveAudienceCount(lectureId: string | null, live: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!lectureId || !live) return;
    let active = true;
    let close: (() => void) | undefined;
    const lastSeen = new Map<string, number>();
    const recount = () => {
      const now = Date.now();
      lastSeen.forEach((seenAt, id) => { if (now - seenAt > ACTIVE_WINDOW_MS) lastSeen.delete(id); });
      if (active) setCount(lastSeen.size);
    };
    void subscribeToRealtimeReactions(lectureAudienceTopic(lectureId), LECTURE_AUDIENCE_EVENT, (payload) => {
      const id = (payload as { id?: unknown } | null)?.id;
      if (typeof id !== "string" || id.length > 64) return;
      lastSeen.set(id, Date.now());
      recount();
    }, (error) => console.error("Audience count channel failed", error)).then((stop) => {
      if (active) close = stop;
      else stop();
    });
    const timer = setInterval(recount, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
      close?.();
    };
  }, [lectureId, live]);
  return live ? count : 0;
}

/** LIVE 경과 시간(mm:ss 또는 h:mm:ss). LIVE가 아니거나 시작 시각을 모르면 null. paused 동안은 마지막 값에 멈춘다. */
export function useLiveElapsed(startedAt: string | null | undefined, live: boolean, paused = false) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live || paused) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live, paused]);
  return live && startedAt ? formatElapsed(now - Date.parse(startedAt)) : null;
}
