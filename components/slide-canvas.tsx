"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, type ReactNode } from "react";
import { categoryLabel } from "@/lib/format";
import type { Question, Slide } from "@/lib/types";

export function SlideCanvas({ slide, questions = [], selectedId, onSelectPin, onCanvasClick, showQuestionLabels = false, compact = false, children }: {
  slide: Slide;
  questions?: Question[];
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
  showQuestionLabels?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const click = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onCanvasClick || (event.target as HTMLElement).closest("button")) return;
    const box = event.currentTarget.getBoundingClientRect();
    onCanvasClick((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };

  return (
    <div className={`slide-canvas ${compact ? "compact" : ""}`} onClick={click} role={onCanvasClick ? "button" : undefined} tabIndex={onCanvasClick ? 0 : undefined}>
      {/* Generated slide URLs are runtime assets and intentionally bypass Next image optimization. */}
      {slide.imageUrl
        ? <img src={slide.imageUrl} alt={`${slide.pageIndex + 1}번 슬라이드`} />
        /* 변환된 슬라이드에는 항상 imageUrl 이 있다. 이미지가 아직/끝내 없을 때 흰 판만 남지 않게 한다. */
        : <div className="slide-placeholder">{slide.pageIndex + 1}</div>}
      {questions.filter((q) => q.x !== null && q.y !== null).map((q, index) => (
        <Fragment key={q.id}>
          <button className={`question-pin ${selectedId === q.id ? "selected" : ""}`} style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%` }} onClick={() => onSelectPin?.(q.id)} aria-label={`질문: ${q.text}`}>
            {index + 1}
          </button>
          {showQuestionLabels && (
            <button className={`question-tag category ${q.category} ${q.answer ? "answered" : ""}`} style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%` }} onClick={() => onSelectPin?.(q.id)} aria-label={`${q.answer ? "답변이 도착한 " : ""}질문: ${q.text}`}>
              {q.answer ? `답변 확인 · ${categoryLabel[q.category]}` : categoryLabel[q.category]}
            </button>
          )}
        </Fragment>
      ))}
      {children}
    </div>
  );
}
