"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, MapPin, Pencil, Send, Smile, Trash2, X } from "@/components/icons";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { PinLogo } from "@/components/pin-logo";
import { SlideCanvas } from "@/components/slide-canvas";
import { StatusBadge } from "@/components/status-badge";
import { useHorizontalSlideWheel } from "@/components/use-horizontal-slide-wheel";
import { useSessions } from "@/components/session-store";
import { useLectureReactions } from "@/components/use-lecture-reactions";
import { LECTURE_REACTION_EMOJIS, LECTURE_REACTION_EVENT, lectureReactionTopic, type LectureReactionEmoji } from "@/lib/lecture-reactions";
import { questionsByEmpathy } from "@/lib/question-reactions";
import { broadcastLocalReaction } from "@/lib/realtime-reactions";
import { ensureAnonymousUser, getAudienceSupabaseClient } from "@/lib/supabase/client";
import { acceptsQuestionCategory, enabledQuestionCategories, QUESTION_MARKERS, questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type NormalizedPoint, type Question, type QuestionCategory, type QuestionMarker } from "@/lib/types";

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

export default function JoinSession() {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const params = useParams<{ code: string }>();
  const finalHref = `/join/${encodeURIComponent(params.code)}/final`;
  const { sessions, ready, addQuestion, updateQuestion, reactToQuestion, loadSessionByCode } = useSessions();
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

  if (!ready || (!session && !lookupDone)) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!session) return <div className="student-empty"><PinLogo /><LanguageSwitcher /><h1>{t("student.sessionNotFound")}</h1><p>{t("student.checkLink")}</p></div>;
  if (session.status !== "live") return <div className="student-empty"><PinLogo /><LanguageSwitcher /><h1>{t("student.sessionEndedTitle")}</h1><p>{t("student.sessionEndedDescription")}</p><Link className="btn primary" href={finalHref}>{t("experience.complete")}</Link></div>;
  const effectiveTool = activeTool;
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
    ? "pin.join.markerPin"
    : marker === "question"
      ? "pin.join.markerQuestion"
      : marker === "smile"
        ? "pin.join.markerSmile"
        : "pin.join.markerIdea");
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
  const appendPenPath = (event: React.PointerEvent<HTMLDivElement>) => {
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
      if (nextPath.length >= MAX_PATH_POINTS) {
        nextPath = nextPath.filter((_, index) => index % 2 === 0);
      }
      nextPath.push(point);
    });
    penPath.current = nextPath;
    return nextPath;
  };
  const startPenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
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
  const movePenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
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
  const finishPenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    const path = appendPenPath(event);
    const canvas = event.currentTarget.getBoundingClientRect();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
  const cancelPenDrawing = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    penPath.current = [];
    clearDraftQuestion();
  };
  const moveDraftTag = (event: React.PointerEvent<HTMLButtonElement>) => {
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
  const finishMovingDraftTag = (event: React.PointerEvent<HTMLButtonElement>) => {
    moveDraftTag(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pinDragStart.current = null;
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
  return (
    <main className="student-shell student-slide-shell">
      <div className="student-guide class-feedback-guide">
        <div><b>{session.title}<em>LIVE</em></b><span>{t("student.feedbackGuide")}</span></div>
        <div className="student-header-actions"><Link className="student-complete-button" href={finalHref}>{t("experience.complete")}</Link><LanguageSwitcher /></div>
      </div>
      <section
        className="student-stage"
        aria-label={t("student.slideAria", { title: session.title })}
        onWheel={handleSlideWheel}
      >
        <div className="student-image-stage">
          <div className="student-image-viewport">
            <div className={`student-canvas pin-fit tool-${effectiveTool}`} style={{ "--student-image-width": "min(100%, calc((100dvh - 180px) * 16 / 9))" } as React.CSSProperties}>
              <SlideCanvas
                slide={slide}
                questions={submittedQuestions}
                questionCategories={session.questionCategories}
                visibleQuestionIds={visibleQuestionIds}
                selectedId={selectedQuestionId}
                onSelectPin={startEditingQuestion}
                onCanvasClick={effectiveTool === "pin" ? placeDraftTag : undefined}
                showQuestionLabels
              >
                {effectiveTool === "pen" && <div
                  className="student-pen-layer"
                  onPointerDown={startPenDrawing}
                  onPointerMove={movePenDrawing}
                  onPointerUp={finishPenDrawing}
                  onPointerCancel={cancelPenDrawing}
                  aria-label={t("student.selectArea")}
                />}
                {draftQuestion?.anchorKind === "point" && !editingQuestionId && !submitted && <>
                  <button
                    className={`draft-pin ${questionMarkerEmoji(draftQuestion.marker) ? "emoji-pin" : ""}`}
                    style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}
                    aria-label={t("student.movePin")}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      pinDragged.current = false;
                      pinDragStart.current = { x: event.clientX, y: event.clientY };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={moveDraftTag}
                    onPointerUp={finishMovingDraftTag}
                    onPointerCancel={finishMovingDraftTag}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!pinDragged.current) setComposerOpen(true);
                      pinDragged.current = false;
                    }}
                  >{questionMarkerEmoji(draftQuestion.marker) && <span aria-hidden="true">{questionMarkerEmoji(draftQuestion.marker)}</span>}</button>
                  <span className={`draft-tag category ${categoryClass(draftQuestion.category)}`} style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}>{categoryLabel(draftQuestion.category)}</span>
                </>}
                {draftQuestion?.anchorKind === "path" && (draftQuestion.path?.length ?? 0) >= 1 && !editingQuestionId && !submitted && <>
                  <svg className="draft-path" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points={draftQuestion.path!.map((point) => `${point.x},${point.y}`).join(" ")} vectorEffect="non-scaling-stroke" />
                  </svg>
                  <button
                    type="button"
                    className={`draft-path-label category ${categoryClass(draftQuestion.category)}`}
                    style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}
                    aria-label={t("student.openAreaQuestion")}
                    onClick={(event) => { event.stopPropagation(); setComposerOpen(true); }}
                  >{categoryLabel(draftQuestion.category)}</button>
                </>}
                {draftQuestion?.anchorKind === "box" && draftQuestion.width != null && draftQuestion.height != null && !editingQuestionId && !submitted && <button
                  type="button"
                  className="draft-region"
                  style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%`, width: `${draftQuestion.width * 100}%`, height: `${draftQuestion.height * 100}%` }}
                  aria-label={t("student.openAreaQuestion")}
                  onClick={(event) => { event.stopPropagation(); setComposerOpen(true); }}
                ><span>{categoryLabel(draftQuestion.category)}</span></button>}
              </SlideCanvas>
            </div>
          </div>
          <div className="participant-controls">
            <div className="pin-page-navigation participant-pages" aria-label={t("student.chooseQuestionSlide")}>
              <button type="button" disabled={current === 0} onClick={() => { setSlideIndex(current - 1); setSelectedQuestionId(null); closeComposer(); }} aria-label={t("session.previousSlide")}><ChevronLeft /></button>
              <span>{current + 1} / {session.slides.length}</span>
              <button type="button" disabled={current === session.slides.length - 1} onClick={() => { setSlideIndex(current + 1); setSelectedQuestionId(null); closeComposer(); }} aria-label={t("session.nextSlide")}><ChevronRight /></button>
            </div>
            <div className="participant-reaction-tools">
              {effectiveTool === "emoji" && <div className="student-emoji-picker participant-emoji-picker" role="group" aria-label={t("student.chooseEmoji")}>
                {LECTURE_REACTION_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => void sendEmojiReaction(emoji)} aria-label={t("student.sendReaction", { emoji })}>{emoji}</button>)}
              </div>}
              <div className="participant-tool-switch" role="toolbar" aria-label={t("student.questionTools")}>
                <button type="button" className={effectiveTool === "pin" ? "active" : ""} aria-pressed={effectiveTool === "pin"} onClick={() => selectTool("pin")} aria-label={t("student.pinTool")} title={t("student.pin")}><MapPin /></button>
                <button type="button" className={effectiveTool === "pen" ? "active" : ""} aria-pressed={effectiveTool === "pen"} onClick={() => selectTool("pen")} aria-label={t("student.penTool")} title={t("student.pen")}><Pencil /></button>
                <button type="button" className={effectiveTool === "emoji" ? "active" : ""} aria-pressed={effectiveTool === "emoji"} onClick={() => selectTool(effectiveTool === "emoji" ? "pin" : "emoji")} aria-label={t("student.emojiTool")} title={t("student.emoji")}><Smile /></button>
              </div>
              {emojiError && <span className="participant-reaction-error" role="alert">{emojiError}</span>}
            </div>
          </div>
          {slideIndex !== null && <button className="student-sync-button" onClick={() => { setSlideIndex(null); setSelectedQuestionId(null); closeComposer(); }}>{t("student.currentSlide")}</button>}
        </div>
        <section className="student-feedback-panel" aria-labelledby="student-feedback-title">
          <header className="student-feedback-head"><h2 id="student-feedback-title">{t("student.feedbackListTitle")}</h2><span>{t("student.feedbackCount", { count: submittedQuestions.length })}</span></header>
          {submittedQuestions.length ? <ul className="student-feedback-list">
            {submittedQuestions.map((question) => {
              const reactionPending = pendingReactionIds.has(question.id);
              return <li key={question.id} className={`question-card ${selectedQuestionId === question.id ? "selected" : ""} ${question.reactionCount >= 5 ? "empathy-fire" : ""}`}>
                {question.reactionCount >= 5 && <span className="student-feedback-fire" aria-hidden="true">🔥🔥🔥</span>}
                <div className="student-feedback-row">
                  <button type="button" className="student-feedback-item" onClick={() => startEditingQuestion(question.id)} aria-pressed={selectedQuestionId === question.id}>
                    <span className="student-question-list-meta"><span className={`category ${categoryClass(question.category)}`}>{questionMarkerEmoji(question.marker) && <i aria-hidden="true">{questionMarkerEmoji(question.marker)}</i>}{categoryLabel(question.category)}</span><StatusBadge status={question.status} /><time dateTime={question.createdAt}>{timeAgo(question.createdAt)}</time></span>
                    <p>{question.text}</p>
                    {question.answer && <span className="student-question-list-answer"><b>{t("question.instructorAnswer")}</b>{question.answer}</span>}
                  </button>
                  <button
                    type="button"
                    className={`pin-empathy-button ${question.reactedByMe ? "active" : ""}`}
                    onClick={() => void toggleQuestionReaction(question)}
                    aria-pressed={question.reactedByMe}
                    aria-label={question.isMine ? t("student.empathyOwn") : t(question.reactedByMe ? "student.empathyRemove" : "student.empathyAdd", { count: question.reactionCount })}
                    aria-busy={reactionPending}
                    disabled={question.isMine || reactionPending}
                  ><span aria-hidden="true">👍</span><b>{question.reactionCount}</b></button>
                </div>
              </li>;
            })}
          </ul> : <p className="student-feedback-empty">{t("student.feedbackEmpty")}</p>}
          {reactionError && <p className="student-empathy-error" role="alert">{reactionError}</p>}
        </section>
      </section>
      <div className="participant-page-reactions" aria-hidden="true">
        {liveReactions.map((reaction) => <span key={reaction.id} className="slide-emoji-reaction campaign-live-reaction" style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}>{reaction.emoji}</span>)}
      </div>
      {composerOpen && <div className="student-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}>
        <section className="student-question-modal" role="dialog" aria-modal="true" aria-labelledby="question-modal-title">
          <button className="modal-close" onClick={closeComposer} aria-label={t("student.closeComposer")}><X /></button>
          {viewingQuestion ? <div className="student-answer-view">
            <span className={`category ${categoryClass(viewingQuestion.category)}`}>{questionMarkerEmoji(viewingQuestion.marker) && <i aria-hidden="true">{questionMarkerEmoji(viewingQuestion.marker)}</i>}{categoryLabel(viewingQuestion.category)}</span>
            <h2 id="question-modal-title">{t("student.myQuestion")}</h2>
            <p className="student-answer-question">{viewingQuestion.text}</p>
            <div className={`student-answer-panel ${viewingQuestion.answer ? "" : "pending"}`}>
              <span>{t("question.instructorAnswer")}</span>
              <p>{viewingQuestion.answer ?? t("student.waitingAnswer")}</p>
            </div>
            <button className="btn primary large full" onClick={closeComposer}>{t("common.confirm")}</button>
          </div> : submitted ? <div className="submitted"><span><Check /></span><h2 id="question-modal-title">{editingQuestionId ? t("student.edited") : t("student.submitted")}</h2><p>{t("student.instructorCanSee")}</p><button className="btn primary" onClick={closeComposer}>{editingQuestionId ? t("common.confirm") : t("student.newQuestion")}</button></div> : <>
            <div className="student-modal-heading">
              <span className={activeMarkerEmoji ? "emoji-pin" : ""}>{activeMarkerEmoji && <i aria-hidden="true">{activeMarkerEmoji}</i>}</span>
              <div><h2 id="question-modal-title">{editingQuestionId ? t("student.editPrompt") : draftQuestion?.anchorKind !== "point" ? t("student.areaPrompt") : t("student.pointPrompt")}</h2><p>{editingQuestionId ? t("student.editHint") : t("student.composeHint")}</p></div>
            </div>
            <fieldset className="pin-marker-picker">
              <legend>{t("pin.join.markerTitle")}</legend>
              <div>{QUESTION_MARKERS.map((marker) => {
                const emoji = questionMarkerEmoji(marker);
                return <button key={marker} type="button" className={activeMarker === marker ? "active" : ""} onClick={() => selectMarker(marker)} aria-pressed={activeMarker === marker} aria-label={markerLabel(marker)}>
                  <span className={emoji ? "emoji-pin" : ""} aria-hidden="true">{emoji}</span>
                  <b>{markerLabel(marker)}</b>
                </button>;
              })}</div>
            </fieldset>
            <div className="category-scroll">{categoryOptions.map((item) => <button key={item} className={activeCategory === item ? "active" : ""} onClick={() => selectCategory(item)}>{categoryLabel(item)}</button>)}</div>
            <div className="textarea-wrap"><textarea value={draftText} onChange={(event) => updateDraftText(event.target.value)} maxLength={300} placeholder={t("student.optionalQuestion")} /><span>{draftText.length}/300</span></div>
            {submitError && <div className="student-submit-error" role="alert">{submitError}</div>}
            <div className="student-composer-actions">
              <button className="btn primary large full" onClick={() => void submit()} disabled={submitting}>{submitting ? <span className="spinner" /> : <Send />}{editingQuestionId ? t("student.sendEdited") : t("student.sendQuestion")}</button>
              {editingQuestionId
                ? <button className="btn secondary large full" onClick={closeComposer} disabled={submitting}>{t("student.cancelEdit")}</button>
                : <button className="btn destructive large full" onClick={deleteDraftQuestion}><Trash2 />{draftQuestion?.anchorKind !== "point" ? t("student.deleteArea") : t("student.deletePin")}</button>}
            </div>
          </>}
        </section>
      </div>}
    </main>
  );
}
