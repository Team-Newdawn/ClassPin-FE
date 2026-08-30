"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WheelEventHandler } from "react";

const GESTURE_RESET_MS = 180;
const NAVIGATION_THRESHOLD_PX = 48;

/**
 * 가로 휠/트랙패드 제스처를 한 번에 한 슬라이드 이동으로 바꾼다.
 * 관성 스크롤로 여러 장이 연달아 넘어가지 않도록 입력이 잠잠해질 때까지 잠근다.
 */
export function useHorizontalSlideWheel({
  currentIndex,
  slideCount,
  onIndexChange
}: {
  currentIndex: number;
  slideCount: number;
  onIndexChange: (index: number) => void;
}): WheelEventHandler<HTMLElement> {
  const accumulatedDelta = useRef(0);
  const handledGesture = useRef(false);
  const resetTimer = useRef<number | null>(null);

  const resetGesture = useCallback(() => {
    accumulatedDelta.current = 0;
    handledGesture.current = false;
    resetTimer.current = null;
  }, []);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  return useCallback((event) => {
    if (slideCount < 1) return;

    const isShiftWheel = event.shiftKey && event.deltaX === 0;
    const horizontalDelta = isShiftWheel ? event.deltaY : event.deltaX;

    // 일반적인 세로 스크롤이나 미세한 대각선 흔들림은 슬라이드 이동으로 보지 않는다.
    if (horizontalDelta === 0 || (!isShiftWheel && Math.abs(event.deltaX) <= Math.abs(event.deltaY))) return;

    if (event.cancelable) event.preventDefault();

    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(resetGesture, GESTURE_RESET_MS);

    if (handledGesture.current) return;

    const deltaScale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? window.innerWidth
        : 1;
    const normalizedDelta = horizontalDelta * deltaScale;

    if (accumulatedDelta.current !== 0 && Math.sign(accumulatedDelta.current) !== Math.sign(normalizedDelta)) {
      accumulatedDelta.current = 0;
    }
    accumulatedDelta.current += normalizedDelta;

    if (Math.abs(accumulatedDelta.current) < NAVIGATION_THRESHOLD_PX) return;

    handledGesture.current = true;
    const nextIndex = Math.min(
      slideCount - 1,
      Math.max(0, currentIndex + (accumulatedDelta.current > 0 ? 1 : -1))
    );
    if (nextIndex !== currentIndex) onIndexChange(nextIndex);
  }, [currentIndex, onIndexChange, resetGesture, slideCount]);
}
