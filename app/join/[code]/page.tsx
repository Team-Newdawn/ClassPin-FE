"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, MessageCircleQuestion, Send } from "@/components/icons";
import { PinLogo } from "@/components/pin-logo";
import { SlideCanvas } from "@/components/slide-canvas";
import { useSessions } from "@/components/session-store";
import { categoryLabel } from "@/lib/format";
import type { QuestionCategory } from "@/lib/types";

type DraftTag = {
  x: number;
  y: number;
  category: QuestionCategory;
};

export default function JoinSession() {
  const params = useParams<{ code: string }>();
  const { sessions, ready, addQuestion, loadSessionByCode } = useSessions();
  const session = useMemo(() => sessions.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, sessions]);
  const [slideIndex, setSlideIndex] = useState<number | null>(null);
  const [draftTags, setDraftTags] = useState<Record<string, DraftTag>>({});
  const [category, setCategory] = useState<QuestionCategory>("concept");
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  useEffect(() => {
    if (!ready || lookupDone || session) return;
    void loadSessionByCode(params.code).finally(() => setLookupDone(true));
  }, [loadSessionByCode, lookupDone, params.code, ready, session]);

  if (!ready || (!session && !lookupDone)) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!session) return <div className="student-empty"><PinLogo /><h1>참여할 세션을 찾을 수 없어요</h1><p>링크나 참여 코드를 다시 확인해 주세요.</p></div>;
  const current = slideIndex ?? session.currentSlide;
  const slide = session.slides[current];
  const draftTag = draftTags[slide.id];
  const activeCategory = draftTag?.category ?? category;
  const placeDraftTag = (x: number, y: number, nextCategory = activeCategory) => {
    setDraftTags((currentTags) => ({ ...currentTags, [slide.id]: { x, y, category: nextCategory } }));
    setCategory(nextCategory);
    setSubmitted(false);
  };
  const selectCategory = (nextCategory: QuestionCategory) => {
    setCategory(nextCategory);
    setDraftTags((currentTags) => {
      const currentTag = currentTags[slide.id];
      if (!currentTag) return currentTags;
      return { ...currentTags, [slide.id]: { ...currentTag, category: nextCategory } };
    });
  };
  const clearDraftTag = () => {
    setDraftTags((currentTags) => {
      if (!currentTags[slide.id]) return currentTags;
      const nextTags = { ...currentTags };
      delete nextTags[slide.id];
      return nextTags;
    });
  };
  const submit = () => {
    if (!text.trim()) return;
    addQuestion(session.id, { slideIndex: current, x: draftTag?.x ?? null, y: draftTag?.y ?? null, category: activeCategory, text: text.trim() });
    setSubmitted(true);
  };

  return (
    <main className="student-shell">
      <header className="student-header"><PinLogo /><span><i />{session.status === "live" ? "LIVE" : "종료된 세션"}</span></header>
      <div className="student-session"><div><span>{session.title}</span><small>강사 화면과 {slideIndex === null ? "실시간 동기화 중" : "개별 탐색 중"}</small></div><button onClick={() => setSlideIndex(null)} disabled={slideIndex === null}>현재 슬라이드</button></div>
      <section className="student-content">
        <div className="student-slide-top"><button className="icon-btn" disabled={current === 0} onClick={() => setSlideIndex(current - 1)}><ChevronLeft /></button><span>{current + 1} / {session.slides.length}</span><button className="icon-btn" disabled={current === session.slides.length - 1} onClick={() => setSlideIndex(current + 1)}><ChevronRight /></button></div>
        <div className="student-canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          const selectedCategory = event.dataTransfer.getData("application/pin-category") as QuestionCategory;
          const canvas = event.currentTarget.querySelector(".slide-canvas")?.getBoundingClientRect();
          if (!canvas || event.clientX < canvas.left || event.clientX > canvas.right || event.clientY < canvas.top || event.clientY > canvas.bottom) return;
          placeDraftTag(
            (event.clientX - canvas.left) / canvas.width,
            (event.clientY - canvas.top) / canvas.height,
            selectedCategory || activeCategory
          );
        }}>
          <SlideCanvas slide={slide} onCanvasClick={placeDraftTag} />
          {draftTag && <><button className="draft-pin" style={{ left: `${draftTag.x * 100}%`, top: `${draftTag.y * 100}%` }} aria-label="선택한 질문 위치">?</button><span className={`draft-tag category ${draftTag.category}`} style={{ left: `${draftTag.x * 100}%`, top: `${draftTag.y * 100}%` }}>{categoryLabel[draftTag.category]}</span></>}
        </div>
      </section>
      <section className="question-composer">
        {submitted ? <div className="submitted"><span><Check /></span><h2>질문을 남겼어요</h2><p>강사님이 실시간으로 확인할 수 있어요.</p><button className="btn primary" onClick={() => { setSubmitted(false); setText(""); clearDraftTag(); }}>질문 하나 더 남기기</button></div> : <>
          <div className="drag-guide">태그를 선택하거나 슬라이드 위로 끌어 놓으세요</div>
          <div className="category-scroll">{(Object.keys(categoryLabel) as QuestionCategory[]).map((item) => <button key={item} draggable className={activeCategory === item ? "active" : ""} onDragStart={(event) => { event.dataTransfer.setData("application/pin-category", item); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => selectCategory(item)}>{categoryLabel[item]}</button>)}</div>
          <div className="textarea-wrap"><textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="질문을 자유롭게 적어주세요" /><span>{text.length}/300</span></div>
          <button className="btn primary large full" onClick={submit} disabled={!text.trim()}><Send />질문 보내기</button>
        </>}
      </section>
      <footer className="student-footer"><MessageCircleQuestion />Pin Class로 질문하고 있어요</footer>
    </main>
  );
}
