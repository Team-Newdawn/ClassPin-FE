"use client";

import { useEffect, useRef, useState } from "react";
import { formatElapsed } from "@/app/_model/class/session";
import { LECTURE_AUDIENCE_EVENT, lectureAudienceTopic } from "@/app/_model/lecture-reactions";
import { publishRealtimeReaction, subscribeToRealtimeReactions } from "@/app/_service/realtime-reaction-service";

const HEARTBEAT_MS = 60_000;
const ACTIVE_WINDOW_MS = 150_000;
const NO_AUDIENCE = { count: 0, total: 0, peak: 0 };
const SAMPLE_MS = 60_000;
const FLUSH_MS = 5 * 60_000;

export type TimelineSample = { at: string; audience: number; slide: number };
export type SlideChange = { at: string; slide: number };
export type LiveTimeline = { samples: TimelineSample[]; slideChanges: SlideChange[] };
const emptyTimeline = (): LiveTimeline => ({ samples: [], slideChanges: [] });

/** DSH-010/012: 표본은 1,440개(24시간), 전환은 5,000개까지만 쌓는다. 같은 슬라이드가 이어지면 전환이 아니다. */
export function addTimelineSample(timeline: LiveTimeline, sample: TimelineSample): LiveTimeline {
  return timeline.samples.length < 1440 ? { ...timeline, samples: [...timeline.samples, sample] } : timeline;
}
export function addSlideChange(timeline: LiveTimeline, change: SlideChange): LiveTimeline {
  return timeline.slideChanges.length < 5000 && timeline.slideChanges.at(-1)?.slide !== change.slide
    ? { ...timeline, slideChanges: [...timeline.slideChanges, change] } : timeline;
}

/**
 * 참여 중인 탭이 1분마다 강사 전용 토픽에 신호를 보낸다. Realtime Presence 는 입장·퇴장마다 모든 참여자에게
 * 변경을 보내 참여자 N명이면 N² 메시지가 되므로 쓰지 않는다. 화면이 꺼진 탭은 보내지 않는다.
 */
export function useAudienceHeartbeat(lectureId: string | null) {
  useEffect(() => {
    if (!lectureId) return;
    let id = crypto.randomUUID();
    let left = false;
    const send = () => {
      if (document.visibilityState === "hidden") return;
      if (left) id = crypto.randomUUID();
      left = false;
      void publishRealtimeReaction(lectureAudienceTopic(lectureId), LECTURE_AUDIENCE_EVENT, { id })
        .catch((error) => console.error("Audience heartbeat failed", error));
    };
    const leave = () => {
      if (left) return;
      left = true;
      void publishRealtimeReaction(lectureAudienceTopic(lectureId), LECTURE_AUDIENCE_EVENT, { id, left: true }, true)
        .catch((error) => console.error("Audience departure failed", error));
    };
    send();
    const timer = setInterval(send, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", send);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", send);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", send);
      leave();
    };
  }, [lectureId]);
}

/**
 * 최근 2.5분 안에 신호를 보낸 탭 수(count), 이번 LIVE 동안 본 탭 수(total), 최대 동시 탭 수(peak).
 * 들어온 사람은 바로 늘고, 나간 사람은 최대 2.5분 뒤에 빠진다.
 * ponytail: 탭 단위 근사치이고 위조 신호를 막지 않는다. 정확한 출석이 필요해지면 BE 입장 기록으로 센다.
 */
export function useLiveAudienceCount(lectureId: string | null, live: boolean) {
  const [audience, setAudience] = useState(NO_AUDIENCE);
  useEffect(() => {
    if (!lectureId || !live) return;
    let active = true;
    let close: (() => void) | undefined;
    const lastSeen = new Map<string, number>();
    const departed = new Set<string>();
    const seen = new Set<string>();
    let peak = 0;
    const recount = () => {
      const now = Date.now();
      lastSeen.forEach((seenAt, id) => { if (now - seenAt > ACTIVE_WINDOW_MS) lastSeen.delete(id); });
      const count = lastSeen.size, total = seen.size;
      peak = Math.max(peak, count);
      // 신호마다 불리므로 값이 같으면 이전 객체를 돌려 다시 그리지 않는다.
      if (active) setAudience((prev) => prev.count === count && prev.total === total && prev.peak === peak ? prev : { count, total, peak });
    };
    void subscribeToRealtimeReactions(lectureAudienceTopic(lectureId), LECTURE_AUDIENCE_EVENT, (payload) => {
      const message = payload as { id?: unknown; left?: unknown } | null;
      const id = message?.id;
      if (typeof id !== "string" || !id || id.length > 64) return;
      if (message?.left === true) {
        departed.add(id);
        lastSeen.delete(id);
      } else if (!departed.has(id)) {
        lastSeen.set(id, Date.now());
        seen.add(id);
      }
      recount();
    }, (error) => console.error("Audience count channel failed", error)).then((stop) => {
      if (!active) return stop();
      close = stop;
      recount(); // 다시 LIVE를 열면 지난 회차 값을 지운다.
    });
    const timer = setInterval(recount, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
      close?.();
    };
  }, [lectureId, live]);
  return live ? audience : NO_AUDIENCE;
}

/** LIVE 경과 시간(mm:ss 또는 h:mm:ss). LIVE가 아니거나 시작 시각을 모르면 null. paused 동안은 마지막 값에 멈춘다. */
export function useLiveElapsed(startedAt: string | null | undefined, live: boolean, paused = false) {
  const [now, setNow] = useState(() => Date.now());
  const clock = useRef({ now, pausedMs: 0 });
  useEffect(() => {
    clock.current = { now: Date.now(), pausedMs: 0 };
  }, [startedAt]);
  useEffect(() => {
    if (!live) return;
    if (paused) return () => { clock.current.pausedMs = Date.now() - clock.current.now; };
    const timer = setInterval(() => {
      clock.current.now = Date.now() - clock.current.pausedMs;
      setNow(clock.current.now);
    }, 1_000);
    return () => clearInterval(timer);
  }, [live, paused, startedAt]);
  return live && startedAt ? formatElapsed(now - Date.parse(startedAt)) : null;
}

/**
 * DSH-010/011: LIVE 동안 1분마다 {접속 탭 수, 화면 슬라이드}를, 슬라이드가 바뀔 때마다 전환을 쌓고 5분마다 flush 한다.
 * LIVE 회차(startedAt)마다 새로 시작한다. paused 동안은 보내지 않지만 계속 쌓으며, 종료 후에도 ref 에 남아 마지막 전송에 쓴다.
 */
export function useLiveTimeline(live: boolean, startedAt: string | null | undefined, slide: number, audience: number,
  flush: (timeline: LiveTimeline) => void, paused = false) {
  const timeline = useRef(emptyTimeline());
  const latest = useRef({ slide, audience, flush });
  useEffect(() => { latest.current = { slide, audience, flush }; });
  useEffect(() => {
    if (!live) return;
    timeline.current = emptyTimeline();
    const timer = setInterval(() => {
      timeline.current = addTimelineSample(timeline.current, { at: new Date().toISOString(), audience: latest.current.audience, slide: latest.current.slide });
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [live, startedAt]);
  useEffect(() => {
    if (live) timeline.current = addSlideChange(timeline.current, { at: new Date().toISOString(), slide });
  }, [live, startedAt, slide]);
  useEffect(() => {
    if (!live || paused) return;
    const timer = setInterval(() => latest.current.flush(timeline.current), FLUSH_MS);
    return () => clearInterval(timer);
  }, [live, paused, startedAt]);
  return timeline;
}
