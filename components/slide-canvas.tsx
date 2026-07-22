"use client";
/* eslint-disable @next/next/no-img-element */

import type { Question, Slide } from "@/lib/types";

export function SlideCanvas({ slide, questions = [], selectedId, onSelectPin, onCanvasClick, compact = false }: {
  slide: Slide;
  questions?: Question[];
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
  compact?: boolean;
}) {
  const click = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onCanvasClick || (event.target as HTMLElement).closest("button")) return;
    const box = event.currentTarget.getBoundingClientRect();
    onCanvasClick((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };

  return (
    <div className={`slide-canvas ${compact ? "compact" : ""}`} onClick={click} role={onCanvasClick ? "button" : undefined} tabIndex={onCanvasClick ? 0 : undefined}>
      {/* Generated slide URLs are runtime assets and intentionally bypass Next image optimization. */}
      {slide.imageUrl ? <img src={slide.imageUrl} alt={`${slide.pageIndex + 1}번 슬라이드`} /> : (
        <div className="mock-slide">
          <div className="mock-slide-grid" />
          <div className="mock-slide-content">
            <span>{slide.eyebrow}</span>
            <h2>{slide.title}</h2>
            <p>{slide.body}</p>
            {slide.pageIndex === 2 && <div className="flywheel"><i>User signal</i><b>→</b><i>Context</i><b>→</b><i>Outcome</i></div>}
          </div>
          <strong className="mock-page">{String(slide.pageIndex + 1).padStart(2, "0")}</strong>
        </div>
      )}
      {questions.filter((q) => q.x !== null && q.y !== null).map((q, index) => (
        <button key={q.id} className={`question-pin ${selectedId === q.id ? "selected" : ""}`} style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%` }} onClick={() => onSelectPin?.(q.id)} aria-label={`질문: ${q.text}`}>
          {index + 1}
        </button>
      ))}
    </div>
  );
}
