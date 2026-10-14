"use client";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/_controller/auth-context";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { advancePinPlayback, canRotatePinPlayback, crossedPinMilestone, findNewestIncomingPin, nextPresentationSlide, presentationAutoplayDelay } from "@/app/_model/class/presentation-rotation";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import type { Question } from "@/app/_model/types";
import { classSessionPersistenceEnabled } from "@/app/_service/class-session-service";
import { usePinCluster } from "../component/pin-cluster-popover";
import { usePinLabelMode } from "@/app/_controller/use-pin-label-mode";

const CONTROLS_HIDE_DELAY = 2600;
const PIN_REVEAL_DELAY = 1000;
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
  const { sessions, folders, ready: storeReady, loadSessionById, setActiveSession, setCurrentSlide, notifyQuestionsChanged } = useSessions();
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
  const presentationAutoplay = session?.presentationAutoplay ?? false;
  const { reactions: lectureReactions } = useLectureReactions(sessionId, notifyQuestionsChanged);
  const liveReactions = session?.allowEmojiReactions ? lectureReactions : [];
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
  const [showQuestionLabels] = usePinLabelMode(params.id);
  const { expandedIds, highlightedId, highlightPin, clusterQuestions, openCluster, closeCluster } = usePinCluster(session?.slides[currentSlide]?.id, pageQuestions);
  // 상세 대화상자나 묶음 팝오버가 열려 있으면 PIN 공개·자동 넘김·키보드 이동을 멈춘다.
  const pinFocusId = detailQuestionId ?? expandedIds?.[0] ?? null;
  const [pinPlayback, setPinPlayback] = useState({ sessionId, currentSlide, showQuestionPins, presentationAutoplay, shownPinIds: [] as string[] });
  if (pinPlayback.sessionId !== sessionId || pinPlayback.currentSlide !== currentSlide || pinPlayback.showQuestionPins !== showQuestionPins || pinPlayback.presentationAutoplay !== presentationAutoplay) {
    setPinPlayback({ sessionId, currentSlide, showQuestionPins, presentationAutoplay, shownPinIds: [] });
    if (pinPlayback.sessionId !== sessionId || pinPlayback.currentSlide !== currentSlide) setDetailQuestionId(null);
  }
  const [pinMilestone, setPinMilestone] = useState<number | null>(null);

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
    if (!presentationAutoplay) return { shownPinIds: pageQuestions.map((pin) => pin.id), activePinId: null };
    const validIds = new Set(pageQuestions.map((question) => question.id));
    const shownPinIds = pinPlayback.shownPinIds.filter((id) => validIds.has(id));
    if (shownPinIds.length) return { shownPinIds, activePinId: shownPinIds.at(-1) ?? null };
    const firstPinId = pageQuestions[0]?.id ?? null;
    return { shownPinIds: firstPinId ? [firstPinId] : [], activePinId: firstPinId };
  }, [pageQuestions, presentationAutoplay, showQuestionPins, pinPlayback.shownPinIds]);
  const visibleQuestionIds = useMemo(() => liveQuestionId && !playback.shownPinIds.includes(liveQuestionId)
    ? [...playback.shownPinIds, liveQuestionId]
    : playback.shownPinIds, [liveQuestionId, playback.shownPinIds]);
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

  const autoplayDelay = presentationAutoplayDelay(
    presentationAutoplay,
    showQuestionPins,
    pageQuestions.length,
    playback.shownPinIds.length,
    slideCount,
    pinFocusId !== null
  );
  useEffect(() => {
    if (autoplayDelay === null) return;
    const timeout = window.setTimeout(() => goToSlide(nextPresentationSlide(currentSlide, slideCount)), autoplayDelay);
    return () => window.clearTimeout(timeout);
  }, [autoplayDelay, currentSlide, goToSlide, positionedQuestionKey, slideCount]);

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

  // 첫 스냅샷은 새 PIN으로 보지 않는다. 이후 새 PIN이 들어오면 해당 슬라이드로 이동해 즉시 강조한다.
  useEffect(() => {
    if (!sessionId) return;
    const previousIds = previousQuestionIdsRef.current;
    previousQuestionIdsRef.current = positionedQuestionIds;
    const firstSnapshot = questionSessionIdRef.current !== sessionId;
    questionSessionIdRef.current = sessionId;
    if (firstSnapshot || !showQuestionPins || !presentationAutoplay) return;
    const incoming = findNewestIncomingPin(positionedQuestions, previousIds);
    if (!incoming) return;
    if (incoming.slideIndex !== currentIndexRef.current) setDetailQuestionId(null);
    goToSlide(incoming.slideIndex);
    setLiveQuestionId(incoming.id);
    setPinPlayback({ sessionId, currentSlide: incoming.slideIndex, showQuestionPins, presentationAutoplay, shownPinIds: [incoming.id] });
    // id 집합이 같으면 질문 본문·답변·공감 변경만으로 강조를 재생하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToSlide, positionedQuestionKey, presentationAutoplay, sessionId, showQuestionPins]);

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
    if (!presentationAutoplay || !canRotatePinPlayback(showQuestionPins, pageQuestions.length, playback.shownPinIds.length, pinFocusId)) return;
    const interval = window.setInterval(rotateQuestions, PIN_REVEAL_DELAY);
    return () => window.clearInterval(interval);
  }, [pinFocusId, pageQuestions.length, playback.shownPinIds.length, presentationAutoplay, rotateQuestions, showQuestionPins]);

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
      if (!session || pinFocusId) return;
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
  }, [pinFocusId, goToSlide, revealControls, session, toggleFullscreen]);

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
    activeQuestionId,
    liveQuestionId,
    liveReactions,
    pinMilestone,
    positionedQuestionCount: positionedQuestions.length,
    controlsVisible,
    isFullscreen,
    actionError,
    stageRef,
    revealControls,
    openQuestionDetail,
    closeQuestionDetail: () => setDetailQuestionId(null),
    showQuestionLabels,
    folder: folders.find((item) => item.id === session?.folderId) ?? null,
    expandedIds,
    highlightedId,
    highlightPin,
    clusterQuestions,
    openCluster: (ids: string[]) => { setDetailQuestionId(null); openCluster(ids); revealControls(); },
    closeCluster,
    toggleFullscreen,
    previousSlide: () => goToSlide(currentIndexRef.current - 1),
    nextSlide: () => goToSlide(currentIndexRef.current + 1),
    goHome: () => router.push("/"),
    goBackToAdmin: () => session && router.push(`/admin/session/${session.id}`),
    closePresentation
  };
}
