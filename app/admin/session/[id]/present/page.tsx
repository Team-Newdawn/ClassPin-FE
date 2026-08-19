"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "@/components/icons";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { QuestionDetailDialog } from "@/components/question-detail-dialog";
import { SlideCanvas } from "@/components/slide-canvas";
import { useSessions } from "@/components/session-store";
import { useLectureReactions } from "@/components/use-lecture-reactions";
import { advancePinPlayback, crossedPinMilestone } from "@/lib/pin/presentation-rotation";
import type { Question } from "@/lib/types";

const CONTROLS_HIDE_DELAY = 2600;
const PIN_REVEAL_DELAY = 1000;
const LIVE_PIN_HIGHLIGHT_DELAY = 1000;
const PIN_MILESTONE_DISPLAY_DELAY = 3000;
const EMPTY_PLAYBACK = { slideIndex: null as number | null, shownPinIds: [] as string[], activePinId: null as string | null };
type PositionedQuestion = Question & { x: number; y: number };

export default function SessionPresentation() {
  const { t, locale } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { sessions, ready, setCurrentSlide } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const sessionId = session?.id ?? null;
  const presentationInteractions = session?.presentationInteractions ?? false;
  const showQuestionPins = session?.showQuestionPins ?? false;
  const { reactions: liveReactions } = useLectureReactions(presentationInteractions ? sessionId : null);
  const sessionTitle = session?.title;
  const currentSlide = session?.currentSlide;
  const positionedQuestions = useMemo(() => (session?.questions ?? []).filter((question): question is PositionedQuestion => question.x !== null && question.y !== null), [session?.questions]);
  const positionedQuestionIds = useMemo(() => positionedQuestions.map((question) => question.id), [positionedQuestions]);
  const positionedQuestionKey = positionedQuestionIds.join("|");
  const pageQuestions = useMemo(() => positionedQuestions.filter((question) => question.slideIndex === currentSlide), [currentSlide, positionedQuestions]);
  const stageRef = useRef<HTMLElement>(null);
  const currentIndexRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageQuestionsRef = useRef<PositionedQuestion[]>([]);
  const previousQuestionIdsRef = useRef<string[]>([]);
  const questionSessionIdRef = useRef<string | null>(null);
  const milestoneSessionIdRef = useRef<string | null>(null);
  const highestQuestionCountRef = useRef<number | null>(null);
  const milestoneTimerRef = useRef<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [liveQuestionId, setLiveQuestionId] = useState<string | null>(null);
  const [storedPlayback, setStoredPlayback] = useState(EMPTY_PLAYBACK);
  const [pinMilestone, setPinMilestone] = useState<number | null>(null);

  const playback = useMemo(() => {
    if (!presentationInteractions || !showQuestionPins) return EMPTY_PLAYBACK;
    const validIds = new Set(pageQuestions.map((question) => question.id));
    const shownPinIds = storedPlayback.slideIndex === currentSlide
      ? storedPlayback.shownPinIds.filter((id) => validIds.has(id))
      : [];
    if (shownPinIds.length) return {
      shownPinIds,
      activePinId: shownPinIds.includes(storedPlayback.activePinId ?? "") ? storedPlayback.activePinId : shownPinIds.at(-1) ?? null
    };
    const firstPinId = pageQuestions[0]?.id ?? null;
    return { shownPinIds: firstPinId ? [firstPinId] : [], activePinId: firstPinId };
  }, [currentSlide, pageQuestions, presentationInteractions, showQuestionPins, storedPlayback]);
  const visibleQuestionIds = useMemo(() => liveQuestionId && !playback.shownPinIds.includes(liveQuestionId)
    ? [...playback.shownPinIds, liveQuestionId]
    : playback.shownPinIds, [liveQuestionId, playback.shownPinIds]);

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
    pageQuestionsRef.current = pageQuestions;
  }, [pageQuestions]);

  // 첫 스냅샷은 새 PIN으로 보지 않는다. 이후 현재 슬라이드에 들어온 PIN만 즉시 빨강으로 강조한다.
  useEffect(() => {
    if (!session) return;
    const previousIds = previousQuestionIdsRef.current;
    previousQuestionIdsRef.current = positionedQuestionIds;
    const firstSnapshot = questionSessionIdRef.current !== session.id;
    questionSessionIdRef.current = session.id;
    if (firstSnapshot || !session.presentationInteractions || !session.showQuestionPins) return;
    const incoming = positionedQuestions.find((question) => !previousIds.includes(question.id) && question.slideIndex === session.currentSlide);
    if (!incoming) return;
    setLiveQuestionId(incoming.id);
    setStoredPlayback((current) => ({
      slideIndex: incoming.slideIndex,
      shownPinIds: current.slideIndex === incoming.slideIndex && current.shownPinIds.includes(incoming.id)
        ? current.shownPinIds
        : current.slideIndex === incoming.slideIndex ? [...current.shownPinIds, incoming.id] : [incoming.id],
      activePinId: incoming.id
    }));
    // id 집합이 같으면 질문 본문·답변·공감 변경만으로 강조를 재생하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionedQuestionKey, session?.id, session?.presentationInteractions, session?.showQuestionPins]);

  useEffect(() => {
    if (!liveQuestionId) return;
    const timeout = window.setTimeout(() => setLiveQuestionId(null), LIVE_PIN_HIGHLIGHT_DELAY);
    return () => window.clearTimeout(timeout);
  }, [liveQuestionId]);

  const rotateQuestions = useCallback(() => {
    setStoredPlayback((current) => ({
      slideIndex: currentSlide ?? null,
      ...advancePinPlayback(pageQuestionsRef.current, current.slideIndex === currentSlide ? current.shownPinIds : [])
    }));
  }, [currentSlide]);

  useEffect(() => {
    if (!session?.presentationInteractions || !session.showQuestionPins || pageQuestions.length < 2) return;
    const interval = window.setInterval(rotateQuestions, PIN_REVEAL_DELAY);
    return () => window.clearInterval(interval);
  }, [pageQuestions.length, rotateQuestions, session?.presentationInteractions, session?.showQuestionPins]);

  useEffect(() => {
    if (!sessionId) return;
    if (!presentationInteractions) {
      highestQuestionCountRef.current = positionedQuestions.length;
      return;
    }
    if (milestoneSessionIdRef.current !== sessionId) {
      milestoneSessionIdRef.current = sessionId;
      highestQuestionCountRef.current = positionedQuestions.length;
      return;
    }
    const highestCount = highestQuestionCountRef.current;
    if (highestCount === null) return;
    highestQuestionCountRef.current = Math.max(highestCount, positionedQuestions.length);
    const milestone = crossedPinMilestone(highestCount, positionedQuestions.length);
    if (milestone === null) return;
    setPinMilestone(milestone);
    if (milestoneTimerRef.current) window.clearTimeout(milestoneTimerRef.current);
    milestoneTimerRef.current = window.setTimeout(() => {
      setPinMilestone((current) => current === milestone ? null : current);
      milestoneTimerRef.current = null;
    }, PIN_MILESTONE_DISPLAY_DELAY);
  }, [positionedQuestions.length, presentationInteractions, sessionId]);

  useEffect(() => () => {
    if (milestoneTimerRef.current) window.clearTimeout(milestoneTimerRef.current);
  }, []);

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
  const detailQuestion = session.questions.find((question) => question.id === detailQuestionId && question.slideIndex === session.currentSlide);
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
      className={`presentation-shell pin-presentation-shell ${session.presentationInteractions && session.showPresentationQr ? `qr-${session.presentationQrPosition}` : ""} ${controlsVisible ? "controls-visible" : ""}`}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      <div className="presentation-slide pin-presentation-slide pin-presentation-canvas" aria-label={`${session.title} · ${t("common.slideNumber", { number: session.currentSlide + 1 })}`}>
        <SlideCanvas
          slide={slide}
          questions={pageQuestions}
          questionCategories={session.questionCategories}
          visibleQuestionIds={visibleQuestionIds}
          selectedId={pageQuestions.some((question) => question.id === selectedQuestionId) ? selectedQuestionId : playback.activePinId}
          liveQuestionId={liveQuestionId}
          onSelectPin={openQuestionDetail}
          showPins={session.presentationInteractions && session.showQuestionPins}
          showQuestionLabels={session.presentationInteractions && session.showQuestionPins}
          labelContent="body"
        />
      </div>

      {session.presentationInteractions && session.showPresentationQr && <aside
        className={`presentation-join-qr ${session.presentationQrPosition}`}
        role="img"
        aria-label={`${t("presentation.joinQrAria")} · ${session.code}`}
      >
        <QRCodeSVG value={joinUrl} size={108} bgColor="#ffffff" fgColor="#101827" level="M" />
        <div><span>{t("presentation.scanToJoin")}</span><b>{session.code}</b></div>
      </aside>}

      {session.presentationInteractions && <>
        <div className="pin-presentation-reactions" aria-hidden="true">
          {liveReactions.map((reaction) => <span
            key={reaction.id}
            className="slide-emoji-reaction campaign-live-reaction"
            style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}
          >{reaction.emoji}</span>)}
        </div>
        {pinMilestone !== null && <output className="pin-presentation-milestone" role="status" aria-live="polite" aria-atomic="true">{pinMilestone}!</output>}
        <output className="pin-presentation-status top-right" aria-label={t("presentation.pinTotal", { count: positionedQuestions.length })}><span>PIN</span><b>{String(positionedQuestions.length).padStart(2, "0")}</b></output>
      </>}

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

      {session.presentationInteractions && detailQuestion && <QuestionDetailDialog question={detailQuestion} questionCategories={session.questionCategories} onClose={() => setDetailQuestionId(null)} />}
    </main>
  );
}
