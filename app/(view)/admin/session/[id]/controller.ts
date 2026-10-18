"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { questionsByEmpathy, questionsByNewest } from "@/app/_model/question-reactions";
import { usePinLabelMode } from "@/app/_controller/use-pin-label-mode";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useHorizontalSlideWheel } from "@/app/_controller/use-horizontal-slide-wheel";
import { useLanguage } from "@/app/_controller/language-context";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { useLiveAudienceCount, useLiveElapsed } from "@/app/_controller/use-live-audience";
import { useLiveAutoEnd } from "@/app/_controller/use-live-auto-end";
import { useSessions } from "@/app/_controller/session-store";
import { slideIndexFromPageNumber } from "@/app/_model/class/presentation-rotation";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import { CLASS_UNFILED_COLOR_INDEX, type PresentationQrPosition, type QuestionStatus } from "@/app/_model/types";

type Tab = "live" | "questions";
export const PRESENTATION_QR_POSITIONS: readonly PresentationQrPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const MOBILE_REMOTE_MEDIA = "(max-width: 600px)";

export const MIN_QUESTION_PANEL = 300;
export const MAX_QUESTION_PANEL = 560;
const MIN_STAGE_WIDTH = 400;
const NOTE_AUTOSAVE_DELAY = 10_000;

const clampQuestionPanel = (width: number, workspaceWidth = MIN_STAGE_WIDTH + MAX_QUESTION_PANEL) =>
  Math.min(MAX_QUESTION_PANEL, Math.max(MIN_QUESTION_PANEL, Math.min(width, workspaceWidth - MIN_STAGE_WIDTH)));

const errorDetail = (error: unknown) => error && typeof error === "object" && "message" in error
  ? String(error.message)
  : String(error);

export function useSessionAdminController() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const prepare = search.get("mode") === "prepare";
  const [questionScope, setQuestionScope] = useState<"slide" | "all">("slide");
  const [questionSort, setQuestionSort] = useState<"empathy" | "latest">("empathy");
  const [showQuestionLabels, saveShowQuestionLabels] = usePinLabelMode(params.id);
  const router = useRouter();
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [startedToast, setStartedToast] = useState(false);
  useEffect(() => {
    if (!startedToast) return;
    const timer = setTimeout(() => setStartedToast(false), 3000);
    return () => clearTimeout(timer);
  }, [startedToast]);
  const {
    folders,
    sessions,
    ready,
    deleteSlide,
    setCurrentSlide,
    setStatus,
    setPresentationAutoplay,
    setShowQuestionPins,
    setReactionAllowed,
    setPresentationQrPlacement,
    setActiveSession,
    updateSlideNote
  } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.id === params.id), [params.id, sessions]);
  const { reactions: lectureReactions } = useLectureReactions(session?.id ?? null);
  const liveReactions = session?.allowEmojiReactions ? lectureReactions : [];
  // 종료 저장 중에도 상태가 먼저 ended 로 바뀌므로, 팝업이 열려 있는 동안은 요약 값을 유지한다.
  // 경과 시간은 강의 종료를 누른 순간 멈추고, 계속 진행하면 다시 흐른다.
  const counting = session?.status === "live" || endConfirmOpen;
  const liveElapsed = useLiveElapsed(session?.startedAt, counting, endConfirmOpen);
  const audienceCount = useLiveAudienceCount(session?.id ?? null, counting);
  const [tab, setTab] = useState<Tab>(search.get("tab") === "questions" ? "questions" : "live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuestionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [mobileQuestionsOpen, setMobileQuestionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);


  const [lectureSaving, setLectureSaving] = useState(false);
  const lectureSavingRef = useRef(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [folderRailOpen, setFolderRailOpen] = useState(true);
  const [questionPanelWidth, setQuestionPanelWidth] = useState(340);
  const playerWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSavingSlideId, setNoteSavingSlideId] = useState<string | null>(null);
  const [noteSavedSlideId, setNoteSavedSlideId] = useState<string | null>(null);
  const pendingNotesRef = useRef(new Map<string, { sessionId: string; body: string }>());
  const noteSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const noteSavingBodiesRef = useRef(new Map<string, string>());
  const noteSaveQueueRef = useRef(Promise.resolve());
  const activeNoteSlideIdRef = useRef<string | null>(null);
  const presentationWindowRef = useRef<Window | null>(null);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);
  const [deletingSlide, setDeletingSlide] = useState(false);
  const [deleteSlideError, setDeleteSlideError] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_REMOTE_MEDIA);
    const showMobileRemote = () => {
      if (media.matches) setTab("live");
    };
    showMobileRemote();
    media.addEventListener("change", showMobileRemote);
    return () => media.removeEventListener("change", showMobileRemote);
  }, []);

  useEffect(() => {
    setActiveSession(params.id);
    return () => setActiveSession(null);
  }, [params.id, setActiveSession]);
  useLiveAutoEnd(params.id, session?.status === "live", setStatus);

  useEffect(() => () => {
    noteSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
    noteSaveTimersRef.current.clear();
  }, []);

  const visibleQuestions = useMemo(() => {
    const needle = query.toLowerCase();
    return session?.questions.filter((question) => (filter === "all" || question.status === filter) && question.text.toLowerCase().includes(needle)) ?? [];
  }, [filter, query, session?.questions]);

  const runAction = (action: Promise<void>, message: string) => {
    setActionError(null);
    void action.catch((error) => {
      console.error(`${message}: ${errorDetail(error)}`, error);
      setActionError(message);
    });
  };

  const runLectureAction = (action: () => Promise<void>, message: string) => {
    if (lectureSavingRef.current) return;
    lectureSavingRef.current = true;
    setActionError(null);
    setLectureSaving(true);
    void action()
      .catch((error) => {
        console.error(`${message}: ${errorDetail(error)}`, error);
        setActionError(message);
      })
      .finally(() => {
        lectureSavingRef.current = false;
        setLectureSaving(false);
      });
  };

  const filmstripRef = useRef<HTMLDivElement>(null);
  const currentSlide = session?.currentSlide;
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip || currentSlide == null) return;
    const active = strip.children[currentSlide] as HTMLElement | undefined;
    if (!active) return;
    const stripBox = strip.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const offset = (activeBox.left - stripBox.left) - (stripBox.width - activeBox.width) / 2;
    strip.scrollTo({ left: strip.scrollLeft + offset, behavior: "smooth" });
  }, [currentSlide]);

  const saveSlideNote = useCallback((slideId: string) => {
    const timer = noteSaveTimersRef.current.get(slideId);
    if (timer) clearTimeout(timer);
    noteSaveTimersRef.current.delete(slideId);
    const pending = pendingNotesRef.current.get(slideId);
    if (!pending || noteSavingBodiesRef.current.get(slideId) === pending.body) return;

    noteSavingBodiesRef.current.set(slideId, pending.body);
    const write = noteSaveQueueRef.current.then(async () => {
      setActionError(null);
      setNoteSavingSlideId(slideId);
      setNoteSavedSlideId(null);
      try {
        await updateSlideNote(pending.sessionId, slideId, pending.body);
        if (pendingNotesRef.current.get(slideId)?.body === pending.body) pendingNotesRef.current.delete(slideId);
        setNoteSavedSlideId(slideId);
      } catch (error) {
        console.error(`Speaker note save failed: ${errorDetail(error)}`, error);
        setActionError(t("session.saveSpeakerNotesError"));
      } finally {
        if (noteSavingBodiesRef.current.get(slideId) === pending.body) noteSavingBodiesRef.current.delete(slideId);
        setNoteSavingSlideId((current) => current === slideId ? null : current);
      }
    });
    noteSaveQueueRef.current = write;
  }, [t, updateSlideNote]);

  const changeSlide = (index: number) => {
    if (!session) return;
    const currentSlideId = session.slides[session.currentSlide]?.id;
    if (currentSlideId) saveSlideNote(currentSlideId);
    runAction(setCurrentSlide(session.id, index), t("session.saveSlideError"));
  };
  const resetSlidePageInput = (input: HTMLInputElement) => {
    if (session) input.value = String(session.currentSlide + 1);
  };
  const handleSlidePageKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!session) return;
      const index = slideIndexFromPageNumber(event.currentTarget.value, session.slides.length);
      if (index === null) return resetSlidePageInput(event.currentTarget);
      event.currentTarget.value = String(index + 1);
      if (index !== session.currentSlide) changeSlide(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      resetSlidePageInput(event.currentTarget);
    }
  };
  const handleSlideWheel = useHorizontalSlideWheel({
    currentIndex: session?.currentSlide ?? 0,
    slideCount: session?.slides.length ?? 0,
    onIndexChange: changeSlide
  });

  const slideParamApplied = useRef(false);
  useEffect(() => {
    if (slideParamApplied.current || !session) return;
    slideParamApplied.current = true;
    const param = search.get("slide");
    if (param === null) return;
    const index = Number(param);
    if (Number.isInteger(index) && index >= 0 && index < session.slides.length) void setCurrentSlide(session.id, index);
  }, [search, session, setCurrentSlide]);

  useEffect(() => {
    if (!session || tab !== "live" || detailQuestionId || shareOpen || deleteSlideId || mobileQuestionsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), dialog, [role='dialog'], [role='alertdialog'], [role='separator']")) return;
      const next = session.currentSlide + (event.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= session.slides.length) return;
      event.preventDefault();
      void setCurrentSlide(session.id, next).catch((error) => {
        console.error("Keyboard slide navigation failed", error);
        setActionError(t("session.saveSlideError"));
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSlideId, detailQuestionId, mobileQuestionsOpen, session, setCurrentSlide, shareOpen, t, tab]);

  useEffect(() => {
    if (tab !== "live") return;
    const fitQuestionPanel = () => {
      if (window.innerWidth <= 900 || !playerWorkspaceRef.current) return;
      setQuestionPanelWidth((width) => clampQuestionPanel(width, playerWorkspaceRef.current?.clientWidth));
    };
    fitQuestionPanel();
    window.addEventListener("resize", fitQuestionPanel);
    return () => window.removeEventListener("resize", fitQuestionPanel);
  }, [tab]);

  const slide = session?.slides[session.currentSlide];
  const folder = folders.find((item) => item.id === session?.folderId);
  const folderAccentIndex = folder?.colorIndex ?? CLASS_UNFILED_COLOR_INDEX;
  const folderHref = `/admin/folders/${folder?.id ?? "unfiled"}`;
  const folderSessions = useMemo(() => sessions.filter((item) => item.folderId === (session?.folderId ?? null)), [session?.folderId, sessions]);
  const questionsBySlide = useMemo(() => groupQuestionsBySlide(session?.questions ?? []), [session?.questions]);
  const questionCounts = useMemo(() => (session?.questions ?? []).reduce((counts, question) => {
    if (question.status === "unanswered") counts.unanswered += 1;
    if (question.status === "resolved") counts.resolved += 1;
    return counts;
  }, { total: session?.questions.length ?? 0, unanswered: 0, resolved: 0 }), [session?.questions]);
  const slideQuestions = useMemo(() => questionsBySlide.get(session?.currentSlide ?? -1) ?? [], [questionsBySlide, session?.currentSlide]);
  const questionsById = useMemo(() => new Map(session?.questions.map((question) => [question.id, question])), [session?.questions]);
  const selected = questionsById.get(selectedId ?? "");
  const detailQuestion = questionsById.get(detailQuestionId ?? "");
  const panelQuestions = useMemo(() => {
    const questions = questionScope === "slide" ? slideQuestions : session?.questions ?? [];
    return questionSort === "empathy" ? questionsByEmpathy(questions) : questionsByNewest(questions);
  }, [questionScope, questionSort, session?.questions, slideQuestions]);
  const noteDraft = slide ? noteDrafts[slide.id] ?? slide.speakerNote ?? "" : "";
  const noteDirty = Boolean(slide && noteDraft !== (slide.speakerNote ?? ""));
  const deleteTarget = deleteSlideId ? session?.slides.find((item) => item.id === deleteSlideId) : null;
  const deleteTargetQuestionCount = deleteTarget ? questionsBySlide.get(deleteTarget.pageIndex)?.length ?? 0 : 0;
  const joinUrl = typeof window === "undefined" || !session ? "" : `${window.location.origin}/join/${session.code}`;

  const openQuestionDetail = (questionId: string) => {
    setSelectedId(questionId);
    setDetailQuestionId(questionId);
  };
  const closeQuestionDetail = () => {
    setDetailQuestionId(null);
  };
  const selectQuestionFromList = (questionId: string, slideIndex: number) => {
    if (!session) return;
    changeSlide(slideIndex);
    setSelectedId(questionId);
    setTab("live");
  };
  const copyJoinLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const changeNoteDraft = (value: string) => {
    if (!session || !slide) return;
    setNoteDrafts((current) => ({ ...current, [slide.id]: value }));
    setNoteSavedSlideId(null);
    pendingNotesRef.current.set(slide.id, { sessionId: session.id, body: value });
    const timer = noteSaveTimersRef.current.get(slide.id);
    if (timer) clearTimeout(timer);
    noteSaveTimersRef.current.set(slide.id, setTimeout(() => saveSlideNote(slide.id), NOTE_AUTOSAVE_DELAY));
  };

  useEffect(() => {
    const previousSlideId = activeNoteSlideIdRef.current;
    activeNoteSlideIdRef.current = slide?.id ?? null;
    if (previousSlideId && previousSlideId !== slide?.id) saveSlideNote(previousSlideId);
  }, [saveSlideNote, slide?.id]);
  const closeDeleteSlide = () => {
    if (deletingSlide) return;
    setDeleteSlideId(null);
    setDeleteSlideError(null);
  };
  const confirmDeleteSlide = async () => {
    if (!session || !deleteTarget || deletingSlide) return;
    setDeleteSlideError(null);
    setDeletingSlide(true);
    try {
      await deleteSlide(session.id, deleteTarget.id);
      setDeleteSlideId(null);
    } catch (error) {
      console.error(`Slide deletion failed: ${errorDetail(error)}`, error);
      setDeleteSlideError(error instanceof Error ? error.message : t("session.deleteSlideError"));
    } finally {
      setDeletingSlide(false);
    }
  };
  const startQuestionPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStart.current = { x: event.clientX, width: event.currentTarget.parentElement?.clientWidth ?? questionPanelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizeQuestionPanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    setQuestionPanelWidth(clampQuestionPanel(resizeStart.current.width + resizeStart.current.x - event.clientX, playerWorkspaceRef.current?.clientWidth));
  };
  const finishQuestionPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizeQuestionPanelByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const renderedWidth = event.currentTarget.parentElement?.clientWidth ?? questionPanelWidth;
    setQuestionPanelWidth(clampQuestionPanel(renderedWidth + (event.key === "ArrowLeft" ? 20 : -20), playerWorkspaceRef.current?.clientWidth));
  };
  const openPresentation = () => {
    if (!session) return;
    setActionError(null);
    setPresentationError(null);
    const existing = presentationWindowRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const popup = window.open(
      `/admin/session/${session.id}/present`,
      // A fixed name would keep reusing a tab Chrome created while the player was fullscreen.
      "_blank",
      `popup=yes,width=${window.screen.availWidth},height=${window.screen.availHeight}`
    );
    if (!popup) {
      setPresentationError(t("session.popupBlocked"));
      return;
    }
    presentationWindowRef.current = popup;
    popup.focus();
  };

  return {
    prepare, questionScope, setQuestionScope, questionSort, setQuestionSort, showQuestionLabels, setShowQuestionLabels: (visible: boolean) => runAction(saveShowQuestionLabels(visible), t("session.savePinSettingError")),
    panelQuestions,
    ready,
    session,
    liveReactions,
    liveElapsed,
    audienceCount,
    slide,
    folder,
    folderAccentIndex,
    folderHref,
    folderSessions,
    questionsBySlide,
    questionCounts,
    slideQuestions,
    selected,
    detailQuestion,
    visibleQuestions,
    tab,
    filter,
    query,
    shareOpen,
    mobileQuestionsOpen,
    copied,
    actionError,
    lectureSaving,
    presentationError,
    folderRailOpen,
    questionPanelWidth,
    noteDraft,
    noteDirty,
    noteSavingSlideId,
    noteSavedSlideId,
    deleteTarget,
    deletingSlide,
    deleteSlideError,
    deleteTargetQuestionCount,
    joinUrl,
    playerWorkspaceRef,
    filmstripRef,
    handleSlideWheel,
    showLive: () => setTab("live"),
    showQuestions: () => setTab("questions"),
    toggleFolderRail: () => setFolderRailOpen((open) => !open),
    openShare: () => setShareOpen(true),
    closeShare: () => setShareOpen(false),
    openMobileQuestions: () => setMobileQuestionsOpen(true),
    closeMobileQuestions: () => setMobileQuestionsOpen(false),
    changeQuery: setQuery,
    changeFilter: setFilter,
    selectQuestion: setSelectedId,
    openQuestionDetail,
    closeQuestionDetail,
    selectQuestionFromList,
    changeSlide,
    handleSlidePageKeyDown,
    resetSlidePageInput,
    endConfirmOpen,
    closeEndConfirm: () => setEndConfirmOpen(false),
    confirmEnd: () => session && runLectureAction(async () => {
      await setStatus(session.id, "ended");
      setEndConfirmOpen(false);
      router.push(`/admin/session/${session.id}/report`);
    }, t("session.saveLectureError")),
    startPreparedLecture: () => session && runLectureAction(async () => {
      for (const slideId of pendingNotesRef.current.keys()) saveSlideNote(slideId);
      await noteSaveQueueRef.current;
      if (pendingNotesRef.current.size) throw new Error(t("session.saveSpeakerNotesError"));
      await setStatus(session.id, "live");
      router.replace(`/admin/session/${session.id}`);
    }, t("session.saveLectureError")),
    startedToast,
    toggleStatus: () => session && (session.status === "live" ? setEndConfirmOpen(true) : runLectureAction(async () => {
      await setStatus(session.id, "live");
      setStartedToast(true);
    }, t("session.saveLectureError"))),
    togglePresentationAutoplay: () => session && runLectureAction(() => setPresentationAutoplay(session.id, !session.presentationAutoplay), t("session.saveAutoplayError")),
    toggleQuestionPins: () => session && runLectureAction(() => setShowQuestionPins(session.id, !session.showQuestionPins), t("session.savePinSettingError")),
    toggleReactionAllowed: (setting: "allowQuestionReactions" | "allowEmojiReactions") => session && runLectureAction(() => setReactionAllowed(session.id, setting, !session[setting]), t("session.saveReactionSettingError")),
    changePresentationQrPlacement: (value: string) => {
      if (!session) return;
      const position = PRESENTATION_QR_POSITIONS.find((candidate) => candidate === value) ?? null;
      if (value !== "hidden" && position === null) return;
      runLectureAction(() => setPresentationQrPlacement(session.id, position), t("session.saveQrPositionError"));
    },
    changeNoteDraft,
    saveNoteOnBlur: () => slide && saveSlideNote(slide.id),
    openDeleteSlide: (slideId: string) => {
      setDeleteSlideError(null);
      setDeleteSlideId(slideId);
    },
    closeDeleteSlide,
    confirmDeleteSlide,
    startQuestionPanelResize,
    resizeQuestionPanel,
    finishQuestionPanelResize,
    cancelQuestionPanelResize: () => { resizeStart.current = null; },
    resizeQuestionPanelByKeyboard,
    openPresentation,
    copyJoinLink,
    goHome: () => router.push("/")
  };
}
