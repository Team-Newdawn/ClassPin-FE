"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useHorizontalSlideWheel } from "@/app/_controller/use-horizontal-slide-wheel";
import { useLectureReactions } from "@/app/_controller/use-lecture-reactions";
import { useAudienceHeartbeat } from "@/app/_controller/use-live-audience";
import { LECTURE_REACTION_EVENT, lectureReactionTopic, type LectureReactionEmoji } from "@/app/_model/lecture-reactions";
import { questionsByEmpathy, questionsByNewest } from "@/app/_model/question-reactions";
import { groupQuestionsBySlide } from "@/app/_model/stats";
import { LectureClosedError, QuestionRateLimitError } from "@/app/_service/class-session-service";
import { publishRealtimeReaction } from "@/app/_service/realtime-reaction-service";
import { acceptsQuestionCategory, enabledQuestionCategories, type Question, type QuestionCategory, type QuestionMarker } from "@/app/_model/types";

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
const JOIN_RETRY_LIMIT = 5;
// 이모지 하나가 참여자 전원에게 퍼지므로 연타가 N²로 불어나지 않게 사람마다 1초에 하나만 보낸다.
const EMOJI_REACTION_INTERVAL_MS = 1_000;

export function useJoinSessionController() {
  const { t, timeAgo } = useLanguage();
  const params = useParams<{ code: string }>();
  const code = params.code;
  const finalHref = `/join/${encodeURIComponent(code)}/final`;
  const { sessions, ready, addQuestion, updateQuestion, reactToQuestion, loadSessionByCode, setActiveSession, notifyQuestionsChanged } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.code.toLowerCase() === code.toLowerCase()), [code, sessions]);
  const { reactions: lectureReactions, addReaction } = useLectureReactions(session?.id ?? null, notifyQuestionsChanged);
  useAudienceHeartbeat(session?.status === "live" ? session.id : null);
  const [activeTool, setActiveTool] = useState<StudentTool>("pin");
  const [slideIndex, setSlideIndex] = useState<number | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<Record<string, DraftQuestion>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [viewingQuestionId, setViewingQuestionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const [lookupClosed, setLookupClosed] = useState(false);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [questionSort, setQuestionSort] = useState<QuestionSort>("empathy");
  const [questionScope, setQuestionScope] = useState<"slide" | "all">("slide");
  const [questionsHidden, setQuestionsHidden] = useState(false);
  const [pendingReactionIds, setPendingReactionIds] = useState<Set<string>>(new Set());
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const [captureShielded, setCaptureShielded] = useState(false);
  const pinDragged = useRef(false);
  const lastEmojiSentAt = useRef(0);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ponytail: browsers cannot block OS screenshots; cover the page on focus loss and screenshot shortcuts.
  useEffect(() => {
    const shield = () => setCaptureShielded(true);
    const shieldShortcut = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen") void navigator.clipboard?.writeText("").catch(() => undefined);
      if (event.key === "PrintScreen" || (event.metaKey && event.shiftKey)) shield();
    };
    window.addEventListener("blur", shield);
    window.addEventListener("keydown", shieldShortcut);
    window.addEventListener("keyup", shieldShortcut);
    return () => {
      window.removeEventListener("blur", shield);
      window.removeEventListener("keydown", shieldShortcut);
      window.removeEventListener("keyup", shieldShortcut);
    };
  }, []);

  useEffect(() => {
    if (!ready || lookupDone || session) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void loadSessionByCode(code)
      .then(() => setLookupDone(true))
      .catch((error: unknown) => {
        if (error instanceof LectureClosedError) setLookupClosed(true);
        // 입장이 몰려 서버가 잠시 밀릴 때 모두가 같은 순간 다시 두드리지 않도록 사람마다 다른 시간을 기다린다.
        else if (lookupAttempt < JOIN_RETRY_LIMIT) {
          retry = setTimeout(() => setLookupAttempt(lookupAttempt + 1), Math.min(16_000, 1_000 * 2 ** lookupAttempt) + Math.random() * 3_000);
          return;
        } else {
          console.error("Live session lookup failed", error);
          setLookupError(true);
        }
        setLookupDone(true);
      });
    return () => clearTimeout(retry);
  }, [loadSessionByCode, lookupAttempt, lookupDone, code, ready, session]);

  useEffect(() => {
    setActiveSession(session?.id ?? null);
    return () => setActiveSession(null);
  }, [session?.id, setActiveSession]);

  const current = slideIndex ?? session?.currentSlide ?? 0;
  const questionsBySlide = useMemo(() => groupQuestionsBySlide(session?.questions ?? []), [session?.questions]);
  const questionsById = useMemo(() => new Map(session?.questions.map((question) => [question.id, question])), [session?.questions]);
  const hasOwnQuestions = useMemo(() => session?.questions.some((question) => question.isMine) ?? false, [session?.questions]);
  const slideQuestions = useMemo(() => questionsBySlide.get(current) ?? EMPTY_QUESTIONS, [current, questionsBySlide]);
  const focusedPins = useMemo(() => {
    const question = questionsById.get(selectedQuestionId ?? "");
    return question?.slideIndex === current && (question.isMine || session?.showQuestionPins) ? [question] : [];
  }, [current, questionsById, selectedQuestionId, session?.showQuestionPins]);
  const submittedQuestions = useMemo(() => {
    const questions = questionScope === "all" ? session?.questions ?? EMPTY_QUESTIONS : slideQuestions;
    return questionSort === "empathy" ? questionsByEmpathy(questions) : questionsByNewest(questions);
  }, [questionScope, questionSort, session?.questions, slideQuestions]);

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
  if (lookupError) return { state: "failed" as const, t, retry: () => { setLookupError(false); setLookupAttempt(0); setLookupDone(false); } };
  if (!session && lookupClosed) return { state: "ended" as const, finalHref, t };
  if (!session) return { state: "missing" as const, t };
  if (session.status !== "live") return { state: "ended" as const, finalHref, t };

  const slide = session.slides[current] ?? session.slides[0];
  if (!slide) return { state: "missing" as const, t };
  const draftQuestion = draftQuestions[slide.id];
  const viewed = questionsById.get(viewingQuestionId ?? "");
  const viewingQuestion = viewed?.slideIndex === current ? viewed : null;
  // ponytail: 질문 유형 선택 UI는 숨기고 강의에서 켜진 첫 유형을 고정 주입한다. BE·DB가 category를 요구하지 않게 되면 필드째 삭제한다.
  const defaultCategory = enabledQuestionCategories(session.questionCategories)[0] ?? "concept";
  const draftText = draftQuestion?.text ?? "";

  const placeDraftTag = (x: number, y: number) => {
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
          category: currentDraft?.category ?? defaultCategory,
          marker: currentDraft?.marker ?? "pin",
          text: currentDraft?.text ?? ""
        }
      };
    });
    setComposerOpen(true);
  };



  const selectQuestion = (questionId: string) => {
    const question = questionsById.get(questionId);
    if (!question) return;
    if (activeTool === "emoji") setActiveTool("pin");
    setSelectedQuestionId((currentId) => currentId === question.id ? null : question.id);
    if (question.slideIndex !== current) setSlideIndex(question.slideIndex);
  };
  const startEditingQuestion = (questionId: string) => {
    const question = questionsById.get(questionId);
    if (!question) return;
    setSelectedQuestionId(question.id);
    const questionSlide = session.slides[question.slideIndex];
    if (!questionSlide) return;
    if (question.slideIndex !== current) setSlideIndex(question.slideIndex);
    if (!question.isMine) return;
    if (question.status !== "unanswered" || question.answer) {
      setEditingQuestionId(null);
      setViewingQuestionId(question.id);
      setSubmitError(null);
      setComposerOpen(true);
      return;
    }
    if (question.x === null || question.y === null) return;
    setDraftQuestions((currentDrafts) => ({
      ...currentDrafts,
      [questionSlide.id]: {
        x: question.x!,
        y: question.y!,
        category: acceptsQuestionCategory(session.questionCategories, question.category) ? question.category : defaultCategory,
        marker: question.marker,
        text: question.text
      }
    }));
    setEditingQuestionId(question.id);
    setViewingQuestionId(null);
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
    setDraftQuestions((currentDrafts) => {
      if (!currentDrafts[slide.id]) return currentDrafts;
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[slide.id];
      return nextDrafts;
    });
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

  const submit = async () => {
    if (!draftQuestion || submitting) return;
    const values = {
      category: draftQuestion.category,
      marker: draftQuestion.marker,
      text: draftQuestion.text.trim() || t("student.emptyQuestionText")
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
      clearDraftQuestion();
      setEditingQuestionId(null);
      setComposerOpen(false);
      setToast(t(editingQuestionId ? "student.edited" : "student.pinnedToast"));
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Question save failed: ${detail}`, error);
      setSubmitError(error instanceof QuestionRateLimitError ? t("student.rateLimited") : editingQuestionId ? t("student.editError") : t("student.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const closeComposer = () => {
    if (editingQuestionId) clearDraftQuestion();
    setEditingQuestionId(null);
    setViewingQuestionId(null);
    setSubmitError(null);
    setComposerOpen(false);
    if (composerOpen) (document.querySelector<HTMLButtonElement>(".draft-pin, .question-pin.selected") ?? document.querySelector<HTMLButtonElement>(".student-ask-button"))?.focus();
  };


  const selectTool = (tool: StudentTool) => {
    if (tool !== activeTool) {
      clearDraftQuestion();
      setEditingQuestionId(null);
      setViewingQuestionId(null);
      setSubmitError(null);
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
    const now = Date.now();
    if (now - lastEmojiSentAt.current < EMOJI_REACTION_INTERVAL_MS) return;
    lastEmojiSentAt.current = now;
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
    hasOwnQuestions,
    finalHref,
    session,
    liveReactions: session.allowEmojiReactions ? lectureReactions : [],
    // 이모지 도구를 연 채 강사가 이모지를 끄면 토글이 사라지므로 PIN 도구로 되돌린다.
    activeTool: session.allowEmojiReactions ? activeTool : "pin" as const,
    slideIndex,
    current,
    slide,
    draftQuestion,
    draftText,
    editingQuestionId,
    viewingQuestion,
    submitting,
    submitError,
    composerOpen,
    toast,
    selectedQuestionId,
    // 질문 카드를 누르면 그 질문 PIN 하나만 보인다. 다른 사람 질문 위치는 강사가 질문 핀 공개를 켰을 때만 보인다.
    focusedPins,
    questionSort,
    questionScope,
    setQuestionScope,
    questionsHidden,
    setQuestionsHidden,
    captureShielded,
    setCaptureShielded,
    slideQuestions,
    submittedQuestions,
    pendingReactionIds,
    reactionError,
    emojiError,
    handleSlideWheel,
    placeDraftTag,
    startEditingQuestion,
    selectQuestion,
    updateDraftText,
    startMovingDraftTag,
    moveDraftTag,
    finishMovingDraftTag,
    openDraftComposer,
    submit,
    closeComposer,
    selectTool,
    changeSlide,
    syncToLiveSlide,
    selectQuestionSort,
    toggleQuestionReaction,
    sendEmojiReaction
  };
}
