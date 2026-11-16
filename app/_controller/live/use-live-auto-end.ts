"use client";

import { useEffect, useRef } from "react";

const AUTO_END_MS = 60 * 60_000;
/** 화면을 옮겨도 남도록 모듈에 둔다. 탭을 닫으면 함께 사라진다. */
const leaving = new Map<string, AbortController>();

/**
 * LIVE 플레이어를 떠나면 60분 뒤 강의를 종료한다. 같은 강의의 플레이어나 발표 창이 다른 탭에 열려 있으면
 * 모두 닫힌 뒤부터 다시 센다. 같은 탭에서 돌아오면 취소한다.
 * ponytail: 브라우저 타이머라 탭을 닫으면 LIVE가 남는다. 서버 기준 만료가 생기면 그쪽으로 옮긴다.
 */
export function useLiveAutoEnd(sessionId: string, live: boolean, setStatus: (sessionId: string, status: "ended") => Promise<void>) {
  const latest = useRef({ live, setStatus });
  useEffect(() => { latest.current = { live, setStatus }; });
  useEffect(() => {
    leaving.get(sessionId)?.abort();
    leaving.delete(sessionId);
    const open = new AbortController();
    navigator.locks.request(`player:${sessionId}`, { mode: "shared", signal: open.signal }, () =>
      new Promise<void>((resolve) => open.signal.addEventListener("abort", () => resolve()))
    ).catch(() => { /* 잡기 전에 떠나면 AbortError로 끝난다. */ });
    return () => {
      open.abort();
      if (!latest.current.live) return;
      const save = latest.current.setStatus;
      const leave = new AbortController();
      leaving.set(sessionId, leave);
      const names = [`player:${sessionId}`, `presentation:${sessionId}`];
      const countDown = () => {
        const timer = setTimeout(async () => {
          try {
            const held = (await navigator.locks.query()).held ?? [];
            const busy = names.filter((name) => held.some((lock) => lock.name === name));
            if (!busy.length) return await save(sessionId, "ended");
            await Promise.all(busy.map((name) => navigator.locks.request(name, { signal: leave.signal }, () => {})));
            countDown();
          } catch (error) {
            if (!leave.signal.aborted) console.error("LIVE auto end failed", error);
          }
        }, AUTO_END_MS);
        leave.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      };
      countDown();
    };
  }, [sessionId]);
}
