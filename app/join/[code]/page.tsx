"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Send, Trash2, X } from "@/components/icons";
import { PinLogo } from "@/components/pin-logo";
import { SlideCanvas } from "@/components/slide-canvas";
import { useHorizontalSlideWheel } from "@/components/use-horizontal-slide-wheel";
import { useSessions } from "@/components/session-store";
import { categoryLabel } from "@/lib/format";
import type { QuestionCategory } from "@/lib/types";

type DraftQuestion = {
  x: number;
  y: number;
  category: QuestionCategory;
  text: string;
};

export default function JoinSession() {
  const params = useParams<{ code: string }>();
  const { sessions, ready, addQuestion, updateQuestion, loadSessionByCode } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, sessions]);
  const [slideIndex, setSlideIndex] = useState<number | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<Record<string, DraftQuestion>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [viewingQuestionId, setViewingQuestionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const pinDragged = useRef(false);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!ready || lookupDone || session) return;
    void loadSessionByCode(params.code).finally(() => setLookupDone(true));
  }, [loadSessionByCode, lookupDone, params.code, ready, session]);
  const current = slideIndex ?? session?.currentSlide ?? 0;
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
  if (!session) return <div className="student-empty"><PinLogo /><h1>참여할 세션을 찾을 수 없어요</h1><p>링크나 참여 코드를 다시 확인해 주세요.</p></div>;
  const slide = session.slides[current];
  const submittedQuestions = session.questions.filter((question) => question.slideIndex === current);
  const draftQuestion = draftQuestions[slide.id];
  const viewingQuestion = viewingQuestionId ? submittedQuestions.find((question) => question.id === viewingQuestionId) : null;
  const activeCategory = draftQuestion?.category ?? "concept";
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
  const startEditingQuestion = (questionId: string) => {
    const question = submittedQuestions.find((item) => item.id === questionId);
    if (!question) return;
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
        category: question.category,
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
    setDraftQuestions((currentDrafts) => {
      if (!currentDrafts[slide.id]) return currentDrafts;
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[slide.id];
      return nextDrafts;
    });
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
      text: draftQuestion.text.trim() || categoryLabel[draftQuestion.category]
    };
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingQuestionId) {
        await updateQuestion(session.id, editingQuestionId, values);
      } else {
        await addQuestion(session.id, {
          slideIndex: current,
          x: draftQuestion.x,
          y: draftQuestion.y,
          ...values
        });
      }
      setSubmitted(true);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Question save failed: ${detail}`, error);
      setSubmitError(editingQuestionId ? "질문을 수정하지 못했어요. 잠시 후 다시 시도해 주세요." : "질문을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
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
  return (
    <main className="student-shell student-slide-shell">
      <header className="student-header"><PinLogo /><span><i />{session.status === "live" ? "LIVE" : "종료된 세션"}</span></header>
      <section className="student-stage" aria-label={`${session.title} 슬라이드`} onWheel={handleSlideWheel}>
        <div className="student-canvas">
          <SlideCanvas slide={slide} questions={submittedQuestions} onSelectPin={startEditingQuestion} onCanvasClick={placeDraftTag} showQuestionLabels>
            {draftQuestion && !editingQuestionId && !submitted && <>
              <button
                className="draft-pin"
                style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}
                aria-label="선택한 질문 위치 — 드래그하여 이동"
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
              >?</button>
              <span className={`draft-tag category ${draftQuestion.category}`} style={{ left: `${draftQuestion.x * 100}%`, top: `${draftQuestion.y * 100}%` }}>{categoryLabel[draftQuestion.category]}</span>
            </>}
          </SlideCanvas>
        </div>
        <div className="student-slide-nav">
          <button className="icon-btn" disabled={current === 0} onClick={() => { setSlideIndex(current - 1); setComposerOpen(false); setEditingQuestionId(null); setViewingQuestionId(null); }} aria-label="이전 슬라이드"><ChevronLeft /></button>
          <span>{current + 1} / {session.slides.length}</span>
          <button className="icon-btn" disabled={current === session.slides.length - 1} onClick={() => { setSlideIndex(current + 1); setComposerOpen(false); setEditingQuestionId(null); setViewingQuestionId(null); }} aria-label="다음 슬라이드"><ChevronRight /></button>
        </div>
        {slideIndex !== null && <button className="student-sync-button" onClick={() => { setSlideIndex(null); setComposerOpen(false); setEditingQuestionId(null); setViewingQuestionId(null); }}>현재 슬라이드로</button>}
        <p className="student-stage-hint">슬라이드를 클릭해 질문 핀을 남겨보세요</p>
      </section>
      {composerOpen && <div className="student-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}>
        <section className="student-question-modal" role="dialog" aria-modal="true" aria-labelledby="question-modal-title">
          <button className="modal-close" onClick={closeComposer} aria-label="질문 입력 닫기"><X /></button>
          {viewingQuestion ? <div className="student-answer-view">
            <span className={`category ${viewingQuestion.category}`}>{categoryLabel[viewingQuestion.category]}</span>
            <h2 id="question-modal-title">내 질문</h2>
            <p className="student-answer-question">{viewingQuestion.text}</p>
            <div className={`student-answer-panel ${viewingQuestion.answer ? "" : "pending"}`}>
              <span>강사 답변</span>
              <p>{viewingQuestion.answer ?? "아직 답변을 기다리고 있어요."}</p>
            </div>
            <button className="btn primary large full" onClick={closeComposer}>확인</button>
          </div> : submitted ? <div className="submitted"><span><Check /></span><h2 id="question-modal-title">{editingQuestionId ? "질문을 수정했어요" : "질문을 남겼어요"}</h2><p>강사님이 실시간으로 확인할 수 있어요.</p><button className="btn primary" onClick={closeComposer}>{editingQuestionId ? "확인" : "새 질문 남기기"}</button></div> : <>
            <div className="student-modal-heading">
              <span>?</span>
              <div><h2 id="question-modal-title">{editingQuestionId ? "질문을 수정해 주세요" : "이 위치에서 무엇이 궁금한가요?"}</h2><p>{editingQuestionId ? "유형이나 내용을 바꾼 뒤 다시 전송할 수 있어요." : "질문 유형만 선택하거나 내용을 함께 적어주세요."}</p></div>
            </div>
            <div className="category-scroll">{(Object.keys(categoryLabel) as QuestionCategory[]).map((item) => <button key={item} className={activeCategory === item ? "active" : ""} onClick={() => selectCategory(item)}>{categoryLabel[item]}</button>)}</div>
            <div className="textarea-wrap"><textarea value={draftText} onChange={(event) => updateDraftText(event.target.value)} maxLength={300} placeholder="선택 사항: 질문을 자유롭게 적어주세요" /><span>{draftText.length}/300</span></div>
            {submitError && <div className="student-submit-error" role="alert">{submitError}</div>}
            <div className="student-composer-actions">
              <button className="btn primary large full" onClick={() => void submit()} disabled={submitting}>{submitting ? <span className="spinner" /> : <Send />}{editingQuestionId ? "수정한 질문 보내기" : "질문 보내기"}</button>
              {editingQuestionId
                ? <button className="btn secondary large full" onClick={closeComposer} disabled={submitting}>수정 취소</button>
                : <button className="btn destructive large full" onClick={deleteDraftQuestion}><Trash2 />핀 삭제</button>}
            </div>
          </>}
        </section>
      </div>}
    </main>
  );
}
