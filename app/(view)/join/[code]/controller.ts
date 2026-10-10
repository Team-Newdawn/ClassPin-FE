"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { LECTURE_REACTION_EVENT, lectureReactionTopic, type LectureReactionEmoji } from "@/app/_model/lecture-reactions";
import { questionsByEmpathy, questionsByNewest } from "@/app/_model/question-reactions";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import { publishRealtimeReaction } from "@/app/_service/realtime-reaction-service";
import { acceptsQuestionCategory, enabledQuestionCategories, questionCategoryClass, questionCategoryLabel, type Question, type QuestionCategory, type QuestionMarker } from "@/app/_model/types";

type StudentTool = "pin" | "emoji";
type QuestionSort = "empathy" | "newest";

type DraftQuestion = {
  x: number;
  y: number;
  category: QuestionCategory;
  marker: QuestionMarker;
  text: string;
};
const EMPTY_QUESTIONS: Question[] = [];

export function useJoinSessionController() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const params = useParams<{ code: string }>();
  const finalHref = `/join/${encodeURIComponent(params.code)}/final`;
  const { sessions, ready, addQuestion, updateQuestion, reactToQuestion, loadSessionByCode, setActiveSession } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, sessions]);
  const { reactions: liveReactions, addReaction } = useLectureReactions(session?.id ?? null);
  const [activeTool, setActiveTool] = useState<StudentTool>("pin");
  const [draftQuestions, setDraftQuestions] = useState<Record<string, DraftQuestion>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [viewingQuestionId, setViewingQuestionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [questionSort, setQuestionSort] = useState<QuestionSort>("empathy");
  const [pendingReactionIds, setPendingReactionIds] = useState<Set<string>>(new Set());
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const pinDragged = useRef(false);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!ready || lookupDone || session) return;
    void loadSessionByCode(params.code)
      .then(() => setLookupFailed(false))
      .catch((error) => {
        console.error("Live session lookup failed", error);
        setLookupFailed(true);
      })
      .finally(() => setLookupDone(true));
  }, [loadSessionByCode, lookupDone, params.code, ready, session]);

  useEffect(() => {
    setActiveSession(session?.id ?? null);
    return () => setActiveSession(null);
  }, [session?.id, setActiveSession]);

  // 청중은 스스로 넘기지 못하고 강의자의 현재 슬라이드만 따라간다.
  const current = session?.currentSlide ?? 0;
  const [followedSlide, setFollowedSlide] = useState(current);
  const questionsBySlide = useMemo(() => groupQuestionsBySlide(session?.questions ?? []), [session?.questions]);
  const slideQuestions = useMemo(() => questionsBySlide.get(current) ?? EMPTY_QUESTIONS, [current, questionsBySlide]);
  const submittedQuestions = useMemo(() => questionSort === "empathy"
    ? questionsByEmpathy(slideQuestions)
    : questionsByNewest(slideQuestions), [questionSort, slideQuestions]);
  const visibleQuestionIds = useMemo(() => slideQuestions
    .filter((question) => question.isMine || question.id === selectedQuestionId)
    .map((question) => question.id), [selectedQuestionId, slideQuestions]);

  if (!ready || (!session && !lookupDone)) return { state: "loading" as const };
  if (!session && lookupFailed) return { state: "unavailable" as const, t, retry: () => setLookupDone(false) };
  if (!session) return { state: "missing" as const, t };
  if (session.status !== "live") return { state: "ended" as const, finalHref, t };

  const slide = session.slides[current];
  const draftQuestion = draftQuestions[slide.id];
  const viewingQuestion = viewingQuestionId ? slideQuestions.find((question) => question.id === viewingQuestionId) : null;
  const categoryOptions = enabledQuestionCategories(session.questionCategories);
  const defaultCategory = categoryOptions[0] ?? "concept";
  const activeCategory = draftQuestion?.category ?? defaultCategory;
  const activeMarker = draftQuestion?.marker ?? "pin";
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
          x,
          y,
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
    const question = slideQuestions.find((item) => item.id === questionId);
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
        x: question.x!,
        y: question.y!,
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

  const clearDraftQuestion = (slideId = slide.id) => {
    setDraftQuestions((currentDrafts) => {
      if (!currentDrafts[slideId]) return currentDrafts;
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[slideId];
      return nextDrafts;
    });
  };

  // 강의자가 슬라이드를 넘기면 이전 슬라이드에서 열려 있던 작성창과 선택을 닫는다.
  if (followedSlide !== current) {
    const previousSlideId = session.slides[followedSlide]?.id;
    if (previousSlideId && (submitted || editingQuestionId)) clearDraftQuestion(previousSlideId);
    setFollowedSlide(current);
    setSelectedQuestionId(null);
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(false);
  }

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
          anchorKind: "point",
          x: draftQuestion.x,
          y: draftQuestion.y,
          width: null,
          height: null,
          path: null,
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

  const selectQuestionSort = (sort: string) => {
    if (sort === "empathy" || sort === "newest") setQuestionSort(sort);
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
      await publishRealtimeReaction(lectureReactionTopic(session.id), LECTURE_REACTION_EVENT, reaction);
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
    questionSort,
    slideQuestions,
    submittedQuestions,
    visibleQuestionIds,
    pendingReactionIds,
    reactionError,
    emojiError,
    categoryOptions,
    activeCategory,
    activeMarker,
    categoryLabel,
    categoryClass,
    markerLabel,
    placeDraftTag,
    selectCategory,
    selectMarker,
    startEditingQuestion,
    updateDraftText,
    startMovingDraftTag,
    moveDraftTag,
    finishMovingDraftTag,
    openDraftComposer,
    submit,
    closeComposer,
    deleteDraftQuestion,
    selectTool,
    selectQuestionSort,
    toggleQuestionReaction,
    sendEmojiReaction
  };
}

const MAX_SLIDE_ZOOM = 3;

/**
 * 두 손가락 핀치와 트랙패드 핀치(ctrl+휠)를 페이지 대신 슬라이드 이미지 확대로 바꾼다.
 * 너비만 키우므로 PIN은 같은 크기로 남고, 확대된 이미지는 뷰포트 안에서 스크롤된다.
 */
export function attachSlideZoom(viewport: HTMLElement | null) {
  if (!viewport) return;
  let zoom = 1;
  let pinch: { distance: number; zoom: number } | null = null;

  const zoomAt = (nextZoom: number, clientX: number, clientY: number) => {
    const clamped = Math.min(MAX_SLIDE_ZOOM, Math.max(1, nextZoom));
    if (clamped === zoom) return;
    const box = viewport.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const ratio = clamped / zoom;
    zoom = clamped;
    viewport.style.setProperty("--slide-zoom", String(zoom));
    // 손가락 사이 지점이 확대 전후 같은 자리에 머물도록 스크롤을 맞춘다.
    viewport.scrollLeft = (viewport.scrollLeft + x) * ratio - x;
    viewport.scrollTop = (viewport.scrollTop + y) * ratio - y;
  };
  const touchDistance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) pinch = { distance: touchDistance(event.touches), zoom };
  };
  const onTouchMove = (event: TouchEvent) => {
    if (!pinch || event.touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    const [first, second] = [event.touches[0], event.touches[1]];
    zoomAt(pinch.zoom * touchDistance(event.touches) / pinch.distance, (first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) pinch = null;
  };
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoomAt(zoom * Math.exp(-event.deltaY / 100), event.clientX, event.clientY);
  };

  viewport.addEventListener("touchstart", onTouchStart, { passive: true });
  viewport.addEventListener("touchmove", onTouchMove, { passive: false });
  viewport.addEventListener("touchend", onTouchEnd);
  viewport.addEventListener("touchcancel", onTouchEnd);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    viewport.removeEventListener("touchstart", onTouchStart);
    viewport.removeEventListener("touchmove", onTouchMove);
    viewport.removeEventListener("touchend", onTouchEnd);
    viewport.removeEventListener("touchcancel", onTouchEnd);
    viewport.removeEventListener("wheel", onWheel);
  };
}
