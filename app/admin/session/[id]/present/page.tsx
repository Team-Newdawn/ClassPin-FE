"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "@/components/icons";
import { SlideCanvas } from "@/components/slide-canvas";
import { useSessions } from "@/components/session-store";

const CONTROLS_HIDE_DELAY = 2600;

export default function SessionPresentation() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { sessions, ready, setCurrentSlide } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const sessionTitle = session?.title;
  const currentSlide = session?.currentSlide;
  const stageRef = useRef<HTMLElement>(null);
  const currentIndexRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
  }, []);

  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (currentSlide == null) return;
    currentIndexRef.current = currentSlide;
  }, [currentSlide]);

  useEffect(() => {
    if (!sessionTitle) return;
    const previousTitle = document.title;
    document.title = `${sessionTitle} — 슬라이드쇼`;
    return () => { document.title = previousTitle; };
  }, [sessionTitle]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      revealControls();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [revealControls]);

  const goToSlide = useCallback((requestedIndex: number) => {
    if (!session || session.slides.length === 0) return;
    const nextIndex = Math.min(Math.max(0, requestedIndex), session.slides.length - 1);
    if (nextIndex === currentIndexRef.current) return;
    currentIndexRef.current = nextIndex;
    setActionError(null);
    revealControls();
    void setCurrentSlide(session.id, nextIndex).catch((error) => {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`슬라이드 상태를 저장하지 못했습니다: ${detail}`, error);
      setActionError("슬라이드 동기화가 지연되고 있어요.");
      revealControls();
    });
  }, [revealControls, session, setCurrentSlide]);

  const toggleFullscreen = useCallback(async () => {
    setActionError(null);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageRef.current?.requestFullscreen();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`전체화면을 시작하지 못했습니다: ${detail}`, error);
      setActionError("전체화면을 시작하지 못했어요. 브라우저의 전체화면 권한을 확인해 주세요.");
      revealControls();
    }
  }, [revealControls]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!session) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button") && (event.key === " " || event.key === "Enter")) return;
      const current = currentIndexRef.current;
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        goToSlide(current + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToSlide(current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goToSlide(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goToSlide(session.slides.length - 1);
      } else if (event.key.toLowerCase() === "f") {
        if (event.repeat) return;
        event.preventDefault();
        revealControls();
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToSlide, revealControls, session, toggleFullscreen]);

  if (!ready) return <main className="presentation-shell presentation-message"><span className="spinner" /></main>;
  if (!session) return <main className="presentation-shell presentation-message"><h1>세션을 찾을 수 없어요</h1><button className="presentation-text-button" onClick={() => router.push("/")}>홈으로 돌아가기</button></main>;
  if (session.slides.length === 0) return <main className="presentation-shell presentation-message"><h1>표시할 슬라이드가 없어요</h1><button className="presentation-text-button" onClick={() => router.push(`/admin/session/${session.id}`)}>관리 화면으로</button></main>;

  const slide = session.slides[session.currentSlide];
  const closePresentation = () => {
    if (window.opener) window.close();
    else router.push(`/admin/session/${session.id}`);
  };

  return (
    <main
      ref={stageRef}
      className={`presentation-shell ${controlsVisible ? "controls-visible" : ""}`}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      <div className="presentation-slide" aria-label={`${session.title} ${session.currentSlide + 1}번 슬라이드`}>
        <SlideCanvas slide={slide} />
      </div>

      <header className="presentation-topbar">
        <div className="presentation-title"><span className={`status-dot ${session.status}`} /><b>{session.title}</b></div>
        <div className="presentation-top-actions">
          <button onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "전체화면 종료" : "전체화면 시작"} title={isFullscreen ? "전체화면 종료 (F)" : "전체화면 시작 (F)"}>
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </button>
          <button onClick={closePresentation} aria-label="슬라이드쇼 창 닫기" title="슬라이드쇼 창 닫기"><X /></button>
        </div>
      </header>

      <button className="presentation-side-control previous" disabled={session.currentSlide === 0} onClick={() => goToSlide(currentIndexRef.current - 1)} aria-label="이전 슬라이드"><ChevronLeft /></button>
      <button className="presentation-side-control next" disabled={session.currentSlide === session.slides.length - 1} onClick={() => goToSlide(currentIndexRef.current + 1)} aria-label="다음 슬라이드"><ChevronRight /></button>

      <footer className="presentation-footer">
        {actionError && <span className="presentation-error" role="alert">{actionError}</span>}
        <span className="presentation-page" aria-live="polite">{session.currentSlide + 1} / {session.slides.length}</span>
        <span className="presentation-hint">← → 또는 Space로 이동 · F 전체화면</span>
      </footer>
    </main>
  );
}
