"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "@/components/icons";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { QuestionDetailDialog } from "@/components/question-detail-dialog";
import { SlideCanvas } from "@/components/slide-canvas";
import { useSessions } from "@/components/session-store";

const CONTROLS_HIDE_DELAY = 2600;

export default function SessionPresentation() {
  const { t, locale } = useLanguage();
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
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);

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
    document.title = `${sessionTitle} — ${t("presentation.title")}`;
    return () => { document.title = previousTitle; };
  }, [locale, sessionTitle, t]);

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
      console.error(`Slide state save failed: ${detail}`, error);
      setActionError(t("presentation.syncDelay"));
      revealControls();
    });
  }, [revealControls, session, setCurrentSlide, t]);

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
      console.error(`Fullscreen start failed: ${detail}`, error);
      setActionError(t("presentation.fullscreenError"));
      revealControls();
    }
  }, [revealControls, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!session || detailQuestionId) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button") && (event.key === " " || event.key === "Enter")) return;
      const isNavigationKey = ["ArrowRight", "PageDown", " ", "ArrowLeft", "PageUp", "Home", "End"].includes(event.key);
      if (event.repeat && isNavigationKey) {
        event.preventDefault();
        return;
      }
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
  }, [detailQuestionId, goToSlide, revealControls, session, toggleFullscreen]);

  if (!ready) return <main className="presentation-shell presentation-message"><span className="spinner" /></main>;
  if (!session) return <main className="presentation-shell presentation-message"><h1>{t("session.notFound")}</h1><button className="presentation-text-button" onClick={() => router.push("/")}>{t("common.homeBack")}</button></main>;
  if (session.slides.length === 0) return <main className="presentation-shell presentation-message"><h1>{t("presentation.noSlides")}</h1><button className="presentation-text-button" onClick={() => router.push(`/admin/session/${session.id}`)}>{t("presentation.backToAdmin")}</button></main>;

  const slide = session.slides[session.currentSlide];
  const slideQuestions = session.questions.filter((question) => question.slideIndex === session.currentSlide);
  const detailQuestion = session.questions.find((question) => question.id === detailQuestionId);
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/join/${session.code}`;
  const openQuestionDetail = (questionId: string) => {
    setSelectedQuestionId(questionId);
    setDetailQuestionId(questionId);
    revealControls();
  };
  const closePresentation = () => {
    if (window.opener) window.close();
    else router.push(`/admin/session/${session.id}`);
  };

  return (
    <main
      ref={stageRef}
      className={`presentation-shell qr-${session.presentationQrPosition} ${controlsVisible ? "controls-visible" : ""}`}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      <div className="presentation-slide" aria-label={`${session.title} · ${t("common.slideNumber", { number: session.currentSlide + 1 })}`}>
        <SlideCanvas
          slide={slide}
          questions={slideQuestions}
          selectedId={selectedQuestionId}
          onSelectPin={openQuestionDetail}
          showPins={session.showQuestionPins}
        />
      </div>

      <aside
        className={`presentation-join-qr ${session.presentationQrPosition}`}
        role="img"
        aria-label={`${t("presentation.joinQrAria")} · ${session.code}`}
      >
        <QRCodeSVG value={joinUrl} size={108} bgColor="#ffffff" fgColor="#101827" level="M" />
        <div><span>{t("presentation.scanToJoin")}</span><b>{session.code}</b></div>
      </aside>

      <header className="presentation-topbar">
        <div className="presentation-title"><span className={`status-dot ${session.status}`} /><b>{session.title}</b></div>
        <div className="presentation-top-actions">
          <LanguageSwitcher />
          <button onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? t("presentation.exitFullscreen") : t("presentation.startFullscreen")} title={`${isFullscreen ? t("presentation.exitFullscreen") : t("presentation.startFullscreen")} (F)`}>
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </button>
          <button onClick={closePresentation} aria-label={t("presentation.close")} title={t("presentation.close")}><X /></button>
        </div>
      </header>

      <button className="presentation-side-control previous" disabled={session.currentSlide === 0} onClick={() => goToSlide(currentIndexRef.current - 1)} aria-label={t("session.previousSlide")}><ChevronLeft /></button>
      <button className="presentation-side-control next" disabled={session.currentSlide === session.slides.length - 1} onClick={() => goToSlide(currentIndexRef.current + 1)} aria-label={t("session.nextSlide")}><ChevronRight /></button>

      <footer className="presentation-footer">
        {actionError && <span className="presentation-error" role="alert">{actionError}</span>}
        <span className="presentation-page" aria-live="polite">{session.currentSlide + 1} / {session.slides.length}</span>
        <span className="presentation-hint">{t("presentation.hint")}</span>
      </footer>

      {detailQuestion && <QuestionDetailDialog question={detailQuestion} onClose={() => setDetailQuestionId(null)} />}
    </main>
  );
}
