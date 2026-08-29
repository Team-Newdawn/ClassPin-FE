"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useHorizontalSlideWheel } from "@/app/_controller/use-horizontal-slide-wheel";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { LECTURE_REACTION_EVENT, lectureReactionTopic, type LectureReactionEmoji } from "@/app/_model/lecture-reactions";
import { questionsByEmpathy } from "@/app/_model/question-reactions";
import { broadcastLocalReaction } from "@/app/_model/realtime-reactions";
import { ensureAnonymousUser, getAudienceSupabaseClient } from "@/app/_infrastructure/supabase/client";
import { acceptsQuestionCategory, enabledQuestionCategories, questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type NormalizedPoint, type Question, type QuestionCategory, type QuestionMarker } from "@/app/_model/types";

type StudentTool = "pin" | "pen" | "emoji";

type DraftQuestion = {
  anchorKind: "point" | "box" | "path";
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  path: NormalizedPoint[] | null;
  category: QuestionCategory;
  marker: QuestionMarker;
  text: string;
};

const MAX_PATH_POINTS = 512;
const MIN_PATH_DISTANCE_PX = 2;
const MIN_PATH_LENGTH_PX = 12;

export function useJoinSessionController() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const params = useParams<{ code: string }>();
  const finalHref = `/join/${encodeURIComponent(params.code)}/final`;
  const { sessions, ready, addQuestion, updateQuestion, reactToQuestion, loadSessionByCode, setActiveSession } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, sessions]);
  const { reactions: liveReactions, addReaction } = useLectureReactions(session?.id ?? null);
  const [activeTool, setActiveTool] = useState<StudentTool>("pin");
  const [slideIndex, setSlideIndex] = useState<number | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<Record<string, DraftQuestion>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [viewingQuestionId, setViewingQuestionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [pendingReactionIds, setPendingReactionIds] = useState<Set<string>>(new Set());
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const pinDragged = useRef(false);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);
  const penPath = useRef<NormalizedPoint[]>([]);

  useEffect(() => {
    if (!ready || lookupDone || session) return;
    void loadSessionByCode(params.code).finally(() => setLookupDone(true));
  }, [loadSessionByCode, lookupDone, params.code, ready, session]);

  useEffect(() => {
    setActiveSession(session?.id ?? null);
    return () => setActiveSession(null);
  }, [session?.id, setActiveSession]);

  const current = slideIndex ?? session?.currentSlide ?? 0;
  const submittedQuestions = useMemo(() => questionsByEmpathy((session?.questions ?? []).filter((question) => question.slideIndex === current)), [current, session?.questions]);
  const visibleQuestionIds = useMemo(() => submittedQuestions
    .filter((question) => question.isMine || question.id === selectedQuestionId)
    .map((question) => question.id), [selectedQuestionId, submittedQuestions]);
  const handleSlideWheel = useHorizontalSlideWheel({
    currentIndex: current,
    slideCount: session?.slides.length ?? 0,
    onIndexChange: (index) => {
      setSlideIndex(index);
      setComposerOpen(false);
      setEditingQuestionId(null);
      setViewingQuestionId(null);
    }
  });

  if (!ready || (!session && !lookupDone)) return { state: "loading" as const };
  if (!session) return { state: "missing" as const, t };
  if (session.status !== "live") return { state: "ended" as const, finalHref, t };

  const slide = session.slides[current];
  const draftQuestion = draftQuestions[slide.id];
  const viewingQuestion = viewingQuestionId ? submittedQuestions.find((question) => question.id === viewingQuestionId) : null;
  const categoryOptions = enabledQuestionCategories(session.questionCategories);
  const defaultCategory = categoryOptions[0] ?? "concept";
  const activeCategory = draftQuestion?.category ?? defaultCategory;
  const activeMarker = draftQuestion?.marker ?? "pin";
  const activeMarkerEmoji = questionMarkerEmoji(activeMarker);
  const categoryLabel = (category: QuestionCategory) => questionCategoryLabel(session.questionCategories, category, defaultCategoryLabel);
  const categoryClass = (category: QuestionCategory) => questionCategoryClass(session.questionCategories, category);
  const markerLabel = (marker: QuestionMarker) => t(marker === "pin"
    ? "student.markerPin"
    : marker === "question"
      ? "student.markerQuestion"
      : marker === "smile"
        ? "student.markerSmile"
        : "student.markerIdea");
  const draftText = draftQuestion?.text ?? "";

  const placeDraftTag = (x: number, y: number, nextCategory = activeCategory) => {
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      return {
        ...currentDrafts,
        [slide.id]: {
          anchorKind: "point",
          x,
          y,
          width: null,
          height: null,
          path: null,
          category: currentDraft?.category ?? nextCategory,
          marker: currentDraft?.marker ?? "pin",
          text: currentDraft?.text ?? ""
        }
      };
    });
    setSubmitted(false);
    setComposerOpen(true);
  };

  const selectCategory = (nextCategory: QuestionCategory) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, category: nextCategory } };
    });
  };

  const selectMarker = (marker: QuestionMarker) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, marker } };
    });
  };

  const startEditingQuestion = (questionId: string) => {
    const question = submittedQuestions.find((item) => item.id === questionId);
    if (!question) return;
    setSelectedQuestionId(question.id);
    if (!question.isMine) return;
    if (question.status !== "unanswered" || question.answer) {
      setEditingQuestionId(null);
      setViewingQuestionId(question.id);
      setSubmitted(false);
      setSubmitError(null);
      setComposerOpen(true);
      return;
    }
    if (question.x === null || question.y === null) return;
    setDraftQuestions((currentDrafts) => ({
      ...currentDrafts,
      [slide.id]: {
        anchorKind: question.anchorKind === "path" ? "path" : question.anchorKind === "box" ? "box" : "point",
        x: question.x!,
        y: question.y!,
        width: question.width ?? null,
        height: question.height ?? null,
        path: question.path ?? null,
        category: acceptsQuestionCategory(session.questionCategories, question.category) ? question.category : defaultCategory,
        marker: question.marker,
        text: question.text
      }
    }));
    setEditingQuestionId(question.id);
    setViewingQuestionId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(true);
  };

  const updateDraftText = (text: string) => {
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, text } };
    });
  };

  const clearDraftQuestion = () => {
    penPath.current = [];
    setDraftQuestions((currentDrafts) => {
      if (!currentDrafts[slide.id]) return currentDrafts;
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[slide.id];
      return nextDrafts;
    });
  };

  const normalizedPoint = (clientX: number, clientY: number, canvas: DOMRect): NormalizedPoint => ({
    x: Math.min(1, Math.max(0, (clientX - canvas.left) / canvas.width)),
    y: Math.min(1, Math.max(0, (clientY - canvas.top) / canvas.height))
  });

  const appendPenPath = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return penPath.current;
    const canvas = event.currentTarget.getBoundingClientRect();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    let nextPath = [...penPath.current];
    samples.forEach((sample) => {
      const point = normalizedPoint(sample.clientX, sample.clientY, canvas);
      const previous = nextPath[nextPath.length - 1];
      if (previous && Math.hypot(
        (point.x - previous.x) * canvas.width,
        (point.y - previous.y) * canvas.height
      ) < MIN_PATH_DISTANCE_PX) return;
      if (nextPath.length >= MAX_PATH_POINTS) nextPath = nextPath.filter((_, index) => index % 2 === 0);
      nextPath.push(point);
    });
    penPath.current = nextPath;
    return nextPath;
  };

  const startPenDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.getBoundingClientRect();
    const start = normalizedPoint(event.clientX, event.clientY, canvas);
    penPath.current = [start];
    event.currentTarget.setPointerCapture(event.pointerId);
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setSubmitted(false);
    setComposerOpen(false);
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      return {
        ...currentDrafts,
        [slide.id]: {
          anchorKind: "path",
          x: start.x,
          y: start.y,
          width: null,
          height: null,
          path: [start],
          category: currentDraft?.category ?? defaultCategory,
          marker: currentDraft?.marker ?? "pin",
          text: currentDraft?.text ?? ""
        }
      };
    });
  };

  const movePenDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const path = appendPenPath(event);
    const start = path[0];
    if (!start) return;
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, anchorKind: "path", x: start.x, y: start.y, path } };
    });
  };

  const finishPenDrawing = (event: PointerEvent<HTMLDivElement>) => {
    const path = appendPenPath(event);
    const canvas = event.currentTarget.getBoundingClientRect();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    penPath.current = [];
    const pathLength = path.slice(1).reduce((length, point, index) => {
      const previous = path[index];
      return length + Math.hypot(
        (point.x - previous.x) * canvas.width,
        (point.y - previous.y) * canvas.height
      );
    }, 0);
    if (path.length < 2 || pathLength < MIN_PATH_LENGTH_PX) {
      clearDraftQuestion();
      return;
    }
    const start = path[0];
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, anchorKind: "path", x: start.x, y: start.y, path } };
    });
    setComposerOpen(true);
  };

  const cancelPenDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    penPath.current = [];
    clearDraftQuestion();
  };

  const startMovingDraftTag = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    pinDragged.current = false;
    pinDragStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDraftTag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const canvas = event.currentTarget.closest(".slide-canvas")?.getBoundingClientRect();
    if (!canvas) return;
    const start = pinDragStart.current;
    if (!pinDragged.current && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    pinDragged.current = true;
    const x = Math.min(1, Math.max(0, (event.clientX - canvas.left) / canvas.width));
    const y = Math.min(1, Math.max(0, (event.clientY - canvas.top) / canvas.height));
    setDraftQuestions((currentDrafts) => {
      const currentDraft = currentDrafts[slide.id];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [slide.id]: { ...currentDraft, x, y } };
    });
  };

  const finishMovingDraftTag = (event: PointerEvent<HTMLButtonElement>) => {
    moveDraftTag(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pinDragStart.current = null;
  };

  const openDraftComposer = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!pinDragged.current) setComposerOpen(true);
    pinDragged.current = false;
  };

  const openComposer = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setComposerOpen(true);
  };

  const submit = async () => {
    if (!draftQuestion || submitting) return;
    const values = {
      category: draftQuestion.category,
      marker: draftQuestion.marker,
      text: draftQuestion.text.trim() || categoryLabel(draftQuestion.category)
    };
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingQuestionId) {
        await updateQuestion(session.id, editingQuestionId, values);
      } else {
        await addQuestion(session.id, {
          slideIndex: current,
          anchorKind: draftQuestion.anchorKind,
          x: draftQuestion.x,
          y: draftQuestion.y,
          width: draftQuestion.width,
          height: draftQuestion.height,
          path: draftQuestion.path,
          ...values
        });
      }
      setSubmitted(true);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Question save failed: ${detail}`, error);
      setSubmitError(editingQuestionId ? t("student.editError") : t("student.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const closeComposer = () => {
    if (submitted || editingQuestionId) {
      clearDraftQuestion();
      setSubmitted(false);
    }
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setComposerOpen(false);
  };

  const deleteDraftQuestion = () => {
    clearDraftQuestion();
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(false);
  };

  const selectTool = (tool: StudentTool) => {
    if (tool !== activeTool) {
      clearDraftQuestion();
      setEditingQuestionId(null);
      setViewingQuestionId(null);
      setSubmitError(null);
      setSubmitted(false);
      setComposerOpen(false);
    }
    setActiveTool(tool);
  };

  const changeSlide = (index: number) => {
    setSlideIndex(index);
    setSelectedQuestionId(null);
    closeComposer();
  };

  const syncToLiveSlide = () => {
    setSlideIndex(null);
    setSelectedQuestionId(null);
    closeComposer();
  };

  const toggleQuestionReaction = async (question: Question) => {
    if (question.isMine || pendingReactionIds.has(question.id)) return;
    setReactionError(null);
    setPendingReactionIds((currentIds) => new Set(currentIds).add(question.id));
    try {
      await reactToQuestion(session.id, question.id, !question.reactedByMe);
    } catch (error) {
      console.error("Question empathy update failed", error);
      setReactionError(t("student.empathyError"));
    } finally {
      setPendingReactionIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(question.id);
        return nextIds;
      });
    }
  };

  const sendEmojiReaction = async (emoji: LectureReactionEmoji) => {
    setEmojiError(null);
    const reaction = { id: crypto.randomUUID(), emoji };
    addReaction(reaction);
    try {
      await ensureAnonymousUser();
      const client = getAudienceSupabaseClient();
      if (!client) {
        broadcastLocalReaction(lectureReactionTopic(session.id), LECTURE_REACTION_EVENT, reaction);
        return;
      }
      const channel = client.channel(lectureReactionTopic(session.id));
      try {
        await channel.httpSend(LECTURE_REACTION_EVENT, reaction);
      } finally {
        await client.removeChannel(channel);
      }
    } catch (error) {
      console.error("Lecture emoji reaction failed", error);
      setEmojiError(t("student.reactionError"));
    }
  };

  return {
    state: "live" as const,
    t,
    timeAgo,
    finalHref,
    session,
    liveReactions,
    activeTool,
    slideIndex,
    current,
    slide,
    draftQuestion,
    draftText,
    editingQuestionId,
    viewingQuestion,
    submitted,
    submitting,
    submitError,
    composerOpen,
    selectedQuestionId,
    submittedQuestions,
    visibleQuestionIds,
    pendingReactionIds,
    reactionError,
    emojiError,
    categoryOptions,
    activeCategory,
    activeMarker,
    activeMarkerEmoji,
    categoryLabel,
    categoryClass,
    markerLabel,
    handleSlideWheel,
    placeDraftTag,
    selectCategory,
    selectMarker,
    startEditingQuestion,
    updateDraftText,
    startPenDrawing,
    movePenDrawing,
    finishPenDrawing,
    cancelPenDrawing,
    startMovingDraftTag,
    moveDraftTag,
    finishMovingDraftTag,
    openDraftComposer,
    submit,
    closeComposer,
    deleteDraftQuestion,
    selectTool,
    changeSlide,
    syncToLiveSlide,
    toggleQuestionReaction,
    sendEmojiReaction,
    openComposer
  };
}
