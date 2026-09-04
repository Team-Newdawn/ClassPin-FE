"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useHorizontalSlideWheel } from "@/app/_controller/use-horizontal-slide-wheel";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import { CLASS_UNFILED_COLOR_INDEX, type PresentationQrPosition, type QuestionCategorySettings, type QuestionStatus } from "@/app/_model/types";

type Tab = "live" | "questions";
const PRESENTATION_QR_POSITIONS: readonly PresentationQrPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

export const MIN_QUESTION_PANEL = 300;
export const MAX_QUESTION_PANEL = 560;
const MIN_STAGE_WIDTH = 400;

const clampQuestionPanel = (width: number, workspaceWidth = MIN_STAGE_WIDTH + MAX_QUESTION_PANEL) =>
  Math.min(MAX_QUESTION_PANEL, Math.max(MIN_QUESTION_PANEL, Math.min(width, workspaceWidth - MIN_STAGE_WIDTH)));

const errorDetail = (error: unknown) => error && typeof error === "object" && "message" in error
  ? String(error.message)
  : String(error);

export function useSessionAdminController() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const {
    folders,
    sessions,
    ready,
    appendSlides,
    deleteSlide,
    answerQuestion,
    resolveQuestion,
    setCurrentSlide,
    setStatus,
    setShowQuestionPins,
    setPresentationQrPlacement,
    setQuestionCategories,
    setActiveSession,
    updateSlideNote
  } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const [tab, setTab] = useState<Tab>(search.get("tab") === "questions" ? "questions" : "live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuestionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lectureSaving, setLectureSaving] = useState(false);
  const lectureSavingRef = useRef(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [folderRailOpen, setFolderRailOpen] = useState(true);
  const [questionPanelWidth, setQuestionPanelWidth] = useState(380);
  const playerWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSavingSlideId, setNoteSavingSlideId] = useState<string | null>(null);
  const [noteSavedSlideId, setNoteSavedSlideId] = useState<string | null>(null);
  const presentationWindowRef = useRef<Window | null>(null);
  const slideInputRef = useRef<HTMLInputElement | null>(null);
  const [addingSlides, setAddingSlides] = useState(false);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);
  const [deletingSlide, setDeletingSlide] = useState(false);
  const [deleteSlideError, setDeleteSlideError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSession(params.id);
    return () => setActiveSession(null);
  }, [params.id, setActiveSession]);

  const visibleQuestions = useMemo(() => session?.questions.filter((question) =>
    (filter === "all" || question.status === filter) && question.text.toLowerCase().includes(query.toLowerCase())) ?? [], [filter, query, session]);

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

  const changeSlide = (index: number) => {
    if (session) runAction(setCurrentSlide(session.id, index), t("session.saveSlideError"));
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
    if (!session || tab !== "live" || detailQuestionId || shareOpen || deleteSlideId) return;
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [deleteSlideId, detailQuestionId, session, setCurrentSlide, shareOpen, t, tab]);

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
  const folderSessions = sessions.filter((item) => item.folderId === (session?.folderId ?? null));
  const questionsBySlide = useMemo(() => groupQuestionsBySlide(session?.questions ?? []), [session?.questions]);
  const questionCounts = useMemo(() => (session?.questions ?? []).reduce((counts, question) => {
    if (question.status === "unanswered") counts.unanswered += 1;
    if (question.status === "resolved") counts.resolved += 1;
    return counts;
  }, { total: session?.questions.length ?? 0, unanswered: 0, resolved: 0 }), [session?.questions]);
  const slideQuestions = questionsBySlide.get(session?.currentSlide ?? -1) ?? [];
  const selected = session?.questions.find((question) => question.id === selectedId) ?? slideQuestions[0];
  const detailQuestion = session?.questions.find((question) => question.id === detailQuestionId);
  const noteDraft = slide ? noteDrafts[slide.id] ?? slide.speakerNote ?? "" : "";
  const noteDirty = Boolean(slide && noteDraft !== (slide.speakerNote ?? ""));
  const deleteTarget = deleteSlideId ? session?.slides.find((item) => item.id === deleteSlideId) : null;
  const deleteTargetQuestionCount = deleteTarget ? questionsBySlide.get(deleteTarget.pageIndex)?.length ?? 0 : 0;
  const joinUrl = typeof window === "undefined" || !session ? "" : `${window.location.origin}/join/${session.code}`;

  const openQuestionDetail = (questionId: string) => {
    setSelectedId(questionId);
    setDetailQuestionId(questionId);
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
  const submitAnswer = () => {
    if (!session || !selected || !answer.trim()) return;
    const body = answer.trim();
    setActionError(null);
    void answerQuestion(session.id, selected.id, body)
      .then(() => setAnswer(""))
      .catch((error) => {
        console.error(`Answer save failed: ${errorDetail(error)}`, error);
        setActionError(t("session.saveAnswerError"));
      });
  };
  const resolveSelectedQuestion = () => {
    if (session && selected) runAction(resolveQuestion(session.id, selected.id), t("session.saveQuestionError"));
  };
  const saveCurrentSlideNote = () => {
    if (!session || !slide || !noteDirty || noteSavingSlideId === slide.id) return;
    const slideId = slide.id;
    setActionError(null);
    setNoteSavingSlideId(slideId);
    setNoteSavedSlideId(null);
    void updateSlideNote(session.id, slideId, noteDraft)
      .then(() => {
        setNoteSavedSlideId(slideId);
        window.setTimeout(() => setNoteSavedSlideId((current) => current === slideId ? null : current), 1800);
      })
      .catch((error) => {
        console.error(`Speaker note save failed: ${errorDetail(error)}`, error);
        setActionError(t("session.saveSpeakerNotesError"));
      })
      .finally(() => setNoteSavingSlideId((current) => current === slideId ? null : current));
  };
  const changeNoteDraft = (value: string) => {
    if (!slide) return;
    setNoteDrafts((current) => ({ ...current, [slide.id]: value }));
    setNoteSavedSlideId(null);
  };
  const saveNoteByKeyboard = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      saveCurrentSlideNote();
    }
  };
  const addSlideImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!session || !files.length || addingSlides) return;
    setActionError(null);
    setAddingSlides(true);
    try {
      await appendSlides(session.id, files);
    } catch (error) {
      console.error(`Slide append failed: ${errorDetail(error)}`, error);
      setActionError(t("session.addSlidesError"));
    } finally {
      setAddingSlides(false);
    }
  };
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
      setDeleteSlideError(t("session.deleteSlideError"));
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
      `pin-class-present-${session.id}`,
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
    ready,
    session,
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
    answer,
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
    addingSlides,
    deleteTarget,
    deletingSlide,
    deleteSlideError,
    deleteTargetQuestionCount,
    joinUrl,
    playerWorkspaceRef,
    filmstripRef,
    slideInputRef,
    handleSlideWheel,
    showLive: () => setTab("live"),
    showQuestions: () => setTab("questions"),
    toggleFolderRail: () => setFolderRailOpen((open) => !open),
    openShare: () => setShareOpen(true),
    closeShare: () => setShareOpen(false),
    changeAnswer: setAnswer,
    changeQuery: setQuery,
    changeFilter: setFilter,
    openQuestionDetail,
    closeQuestionDetail: () => setDetailQuestionId(null),
    selectQuestionFromList,
    changeSlide,
    toggleStatus: () => session && runLectureAction(() => setStatus(session.id, session.status === "live" ? "ended" : "live"), t("session.saveLectureError")),
    toggleQuestionPins: () => session && runLectureAction(() => setShowQuestionPins(session.id, !session.showQuestionPins), t("session.savePinSettingError")),
    changePresentationQrPlacement: (value: string) => {
      if (!session) return;
      const position = PRESENTATION_QR_POSITIONS.find((candidate) => candidate === value) ?? null;
      if (value !== "hidden" && position === null) return;
      runLectureAction(() => setPresentationQrPlacement(session.id, position), t("session.saveQrPositionError"));
    },
    saveQuestionCategories: (settings: QuestionCategorySettings) => session ? setQuestionCategories(session.id, settings) : Promise.resolve(),
    reportActionError: setActionError,
    submitAnswer,
    resolveSelectedQuestion,
    saveCurrentSlideNote,
    changeNoteDraft,
    saveNoteByKeyboard,
    addSlideImages,
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
