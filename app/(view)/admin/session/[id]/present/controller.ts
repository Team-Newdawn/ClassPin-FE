"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/_controller/auth-context";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { advancePinPlayback, canRotatePinPlayback, crossedPinMilestone, findNewestIncomingPin, nextPresentationSlide, resolvePinDisplayPositions, resolveVisiblePresentationLabelIds } from "@/app/_model/class/presentation-rotation";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import type { Question } from "@/app/_model/types";
import { classSessionPersistenceEnabled } from "@/app/_service/class-session-service";

const CONTROLS_HIDE_DELAY = 2600;
const PIN_REVEAL_DELAY = 1000;
const SLIDE_AUTOPLAY_DELAY = 3000;
const LIVE_PIN_HIGHLIGHT_DELAY = 1000;
const PIN_MILESTONE_DISPLAY_DELAY = 3000;
const EMPTY_PLAYBACK = { shownPinIds: [] as string[], activePinId: null as string | null };
type PositionedQuestion = Question & { x: number; y: number };
const EMPTY_POSITIONED_QUESTIONS: PositionedQuestion[] = [];

export function useSessionPresentationController() {
  const { t, locale } = useLanguage();
  const { isAdmin } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { sessions, ready: storeReady, loadSessionById, setActiveSession, setCurrentSlide } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const [lookupDone, setLookupDone] = useState(false);
  const ready = storeReady && (Boolean(session) || lookupDone);
  const canControl = !classSessionPersistenceEnabled || (isAdmin && !lookupDone);
  const sessionId = session?.id ?? null;
  const syncedSlide = session?.currentSlide;
  const [audienceView, setAudienceView] = useState({ sessionId, syncedSlide, currentSlide: syncedSlide ?? 0 });
  if (audienceView.sessionId !== sessionId || audienceView.syncedSlide !== syncedSlide) {
    setAudienceView({ sessionId, syncedSlide, currentSlide: syncedSlide ?? 0 });
  }
  const showQuestionPins = session?.showQuestionPins ?? false;
  const { reactions: liveReactions } = useLectureReactions(sessionId);
  const sessionTitle = session?.title;
  const currentSlide = canControl ? syncedSlide ?? 0 : audienceView.currentSlide;
  const slideCount = session?.slides.length ?? 0;
  const { positionedQuestions, questionsBySlide } = useMemo(() => {
    const questions = (session?.questions ?? []).filter((question): question is PositionedQuestion => question.x !== null && question.y !== null);
    return { positionedQuestions: questions, questionsBySlide: groupQuestionsBySlide(questions) };
  }, [session]);
  const positionedQuestionIds = useMemo(() => positionedQuestions.map((question) => question.id), [positionedQuestions]);
  const positionedQuestionKey = positionedQuestionIds.join("|");
  const pageQuestions = useMemo(
    () => questionsBySlide.get(currentSlide ?? -1) ?? EMPTY_POSITIONED_QUESTIONS,
    [currentSlide, questionsBySlide]
  );
  const stageRef = useRef<HTMLElement>(null);
  const presentationCanvasRef = useRef<HTMLDivElement>(null);
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
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [liveQuestionId, setLiveQuestionId] = useState<string | null>(null);
  const [pinPlayback, setPinPlayback] = useState({ sessionId, currentSlide, showQuestionPins, shownPinIds: [] as string[] });
  if (pinPlayback.sessionId !== sessionId || pinPlayback.currentSlide !== currentSlide || pinPlayback.showQuestionPins !== showQuestionPins) {
    setPinPlayback({ sessionId, currentSlide, showQuestionPins, shownPinIds: [] });
    if (pinPlayback.sessionId !== sessionId || pinPlayback.currentSlide !== currentSlide) setDetailQuestionId(null);
  }
  const [pinMilestone, setPinMilestone] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!storeReady || lookupDone || session) return;
    void loadSessionById(params.id).finally(() => setLookupDone(true));
  }, [loadSessionById, lookupDone, params.id, session, storeReady]);

  useEffect(() => {
    setActiveSession(params.id);
    return () => setActiveSession(null);
  }, [params.id, setActiveSession]);

  const playback = useMemo(() => {
    if (!showQuestionPins) return EMPTY_PLAYBACK;
    const validIds = new Set(pageQuestions.map((question) => question.id));
    const shownPinIds = pinPlayback.shownPinIds.filter((id) => validIds.has(id));
    if (shownPinIds.length) return { shownPinIds, activePinId: shownPinIds.at(-1) ?? null };
    const firstPinId = pageQuestions[0]?.id ?? null;
    return { shownPinIds: firstPinId ? [firstPinId] : [], activePinId: firstPinId };
  }, [pageQuestions, showQuestionPins, pinPlayback.shownPinIds]);
  const allPagePinsVisible = playback.shownPinIds.length >= pageQuestions.length;
  const visibleQuestionIds = useMemo(() => liveQuestionId && !playback.shownPinIds.includes(liveQuestionId)
    ? [...playback.shownPinIds, liveQuestionId]
    : playback.shownPinIds, [liveQuestionId, playback.shownPinIds]);
  const pinDisplayPositions = useMemo(() => {
    if (!canvasSize) return undefined;
    return resolvePinDisplayPositions(pageQuestions.filter((question) => question.anchorKind !== "box" && question.anchorKind !== "path"), canvasSize.width, canvasSize.height);
  }, [canvasSize, pageQuestions]);
  const activeQuestionId = liveQuestionId ?? (pageQuestions.some((question) => question.id === detailQuestionId) ? detailQuestionId : playback.activePinId);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
  }, []);

  const goToSlide = useCallback((requestedIndex: number) => {
    if (!sessionId || slideCount === 0) return;
    const nextIndex = Math.min(Math.max(0, requestedIndex), slideCount - 1);
    if (nextIndex === currentIndexRef.current) return;
    currentIndexRef.current = nextIndex;
    setActionError(null);
    revealControls();
    if (!canControl) {
      setAudienceView({ sessionId, syncedSlide, currentSlide: nextIndex });
      return;
    }
    void setCurrentSlide(sessionId, nextIndex).catch((error) => {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Slide state save failed: ${detail}`, error);
      setActionError(t("presentation.syncDelay"));
      revealControls();
    });
  }, [canControl, revealControls, sessionId, setCurrentSlide, slideCount, syncedSlide, t]);

  useEffect(() => {
    if (!showQuestionPins || slideCount < 2 || detailQuestionId || !allPagePinsVisible) return;
    const delay = pageQuestions.length ? PIN_REVEAL_DELAY : SLIDE_AUTOPLAY_DELAY;
    const timeout = window.setTimeout(() => goToSlide(nextPresentationSlide(currentIndexRef.current, slideCount)), delay);
    return () => window.clearTimeout(timeout);
  }, [allPagePinsVisible, currentSlide, detailQuestionId, goToSlide, pageQuestions.length, positionedQuestionKey, showQuestionPins, slideCount]);

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

  useLayoutEffect(() => {
    const canvas = presentationCanvasRef.current?.querySelector<HTMLElement>(".slide-canvas");
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setCanvasSize((current) => current?.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [sessionId]);

  useLayoutEffect(() => {
    const canvas = presentationCanvasRef.current?.querySelector<HTMLElement>(".slide-canvas");
    if (!canvas || !showQuestionPins) return;
    const labels = Array.from(canvas.querySelectorAll<HTMLElement>("[data-presentation-label-id]"));
    const pins = Array.from(canvas.querySelectorAll<HTMLElement>("[data-presentation-pin-id]"));
    labels.forEach((label) => { label.hidden = false; });
    const visibleLabelIds = new Set(resolveVisiblePresentationLabelIds(
      labels.map((label) => ({ id: label.dataset.presentationLabelId!, bounds: label.getBoundingClientRect() })),
      pins.map((pin) => ({ id: pin.dataset.presentationPinId!, bounds: pin.getBoundingClientRect() })),
      activeQuestionId
    ));
    labels.forEach((label) => { label.hidden = !visibleLabelIds.has(label.dataset.presentationLabelId!); });
  }, [activeQuestionId, isFullscreen, pinDisplayPositions, showQuestionPins, visibleQuestionIds]);

  // 첫 스냅샷은 새 PIN으로 보지 않는다. 이후 새 PIN이 들어오면 해당 슬라이드로 이동해 즉시 강조한다.
  useEffect(() => {
    if (!sessionId) return;
    const previousIds = previousQuestionIdsRef.current;
    previousQuestionIdsRef.current = positionedQuestionIds;
    const firstSnapshot = questionSessionIdRef.current !== sessionId;
    questionSessionIdRef.current = sessionId;
    if (firstSnapshot || !showQuestionPins) return;
    const incoming = findNewestIncomingPin(positionedQuestions, previousIds);
    if (!incoming) return;
    if (incoming.slideIndex !== currentIndexRef.current) setDetailQuestionId(null);
    goToSlide(incoming.slideIndex);
    setLiveQuestionId(incoming.id);
    setPinPlayback({ sessionId, currentSlide: incoming.slideIndex, showQuestionPins, shownPinIds: [incoming.id] });
    // id 집합이 같으면 질문 본문·답변·공감 변경만으로 강조를 재생하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToSlide, positionedQuestionKey, sessionId, showQuestionPins]);

  useEffect(() => {
    if (!liveQuestionId) return;
    const timeout = window.setTimeout(() => setLiveQuestionId(null), LIVE_PIN_HIGHLIGHT_DELAY);
    return () => window.clearTimeout(timeout);
  }, [liveQuestionId]);

  const rotateQuestions = useCallback(() => {
    const next = advancePinPlayback(pageQuestionsRef.current, playback.shownPinIds);
    setPinPlayback((current) => ({ ...current, shownPinIds: next.shownPinIds }));
  }, [playback.shownPinIds]);

  useEffect(() => {
    if (!canRotatePinPlayback(showQuestionPins, pageQuestions.length, playback.shownPinIds.length, detailQuestionId)) return;
    const interval = window.setInterval(rotateQuestions, PIN_REVEAL_DELAY);
    return () => window.clearInterval(interval);
  }, [detailQuestionId, pageQuestions.length, playback.shownPinIds.length, rotateQuestions, showQuestionPins]);

  useEffect(() => {
    if (!sessionId) return;
    if (!showQuestionPins) {
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
  }, [positionedQuestions.length, sessionId, showQuestionPins]);

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

  const toggleFullscreen = useCallback(async () => {
    setActionError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
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

  const slide = session?.slides[currentSlide];
  const detailQuestion = session?.questions.find((question) => question.id === detailQuestionId && question.slideIndex === currentSlide);
  const joinUrl = typeof window === "undefined" || !session ? "" : `${window.location.origin}/join/${session.code}`;
  const openQuestionDetail = (questionId: string) => {
    setDetailQuestionId(questionId);
    revealControls();
  };
  const closePresentation = () => {
    if (window.opener) window.close();
    else if (session) router.push(`/admin/session/${session.id}`);
  };

  return {
    t,
    ready,
    session,
    slide,
    currentSlide,
    detailQuestion,
    joinUrl,
    pageQuestions,
    visibleQuestionIds,
    pinDisplayPositions,
    activeQuestionId,
    liveQuestionId,
    liveReactions,
    pinMilestone,
    positionedQuestionCount: positionedQuestions.length,
    controlsVisible,
    isFullscreen,
    actionError,
    stageRef,
    presentationCanvasRef,
    revealControls,
    openQuestionDetail,
    closeQuestionDetail: () => setDetailQuestionId(null),
    toggleFullscreen,
    previousSlide: () => goToSlide(currentIndexRef.current - 1),
    nextSlide: () => goToSlide(currentIndexRef.current + 1),
    goHome: () => router.push("/"),
    goBackToAdmin: () => session && router.push(`/admin/session/${session.id}`),
    closePresentation
  };
}
