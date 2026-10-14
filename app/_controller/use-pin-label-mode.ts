"use client";

import { useCallback, useSyncExternalStore } from "react";

const keyFor = (sessionId: string) => `pin-class-pin-labels:${sessionId}`;
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener("pin-label-mode", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("pin-label-mode", onChange);
  };
};

/**
 * 강의 관리 페이지의 `핀만 / 핀 + 질문` 선택을 같은 브라우저의 슬라이드쇼 창과 맞춘다.
 * ponytail: localStorage라 같은 브라우저 안에서만 맞춰진다. 다른 기기에서 발표 화면을 열어야 하면 강의 설정 칼럼과 PATCH로 옮긴다.
 */
export function usePinLabelMode(sessionId: string | undefined) {
  const showLabels = useSyncExternalStore(
    subscribe,
    () => Boolean(sessionId) && window.localStorage.getItem(keyFor(sessionId!)) === "1",
    () => false,
  );
  const setShowLabels = useCallback((value: boolean) => {
    if (!sessionId) return;
    window.localStorage.setItem(keyFor(sessionId), value ? "1" : "0");
    window.dispatchEvent(new Event("pin-label-mode"));
  }, [sessionId]);
  return [showLabels, setShowLabels] as const;
}
