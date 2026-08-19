"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, type ReactNode } from "react";
import { useLanguage } from "@/components/language-context";
import { defaultQuestionCategorySettings, questionCategoryClass, questionCategoryLabel, questionMarkerEmoji, type Question, type QuestionCategorySettings, type Slide } from "@/lib/types";

export function SlideCanvas({ slide, questions = [], questionCategories = defaultQuestionCategorySettings(), visibleQuestionIds, selectedId, liveQuestionId, onSelectPin, onCanvasClick, showQuestionLabels = false, labelContent = "category", showPins = true, compact = false, children }: {
  slide: Slide;
  questions?: Question[];
  questionCategories?: QuestionCategorySettings;
  visibleQuestionIds?: readonly string[];
  selectedId?: string | null;
  liveQuestionId?: string | null;
  onSelectPin?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
  showQuestionLabels?: boolean;
  labelContent?: "category" | "body";
  showPins?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { t, categoryLabel: defaultCategoryLabel } = useLanguage();
  const categoryLabel = (category: Question["category"]) => questionCategoryLabel(questionCategories, category, defaultCategoryLabel);
  const click = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onCanvasClick || (event.target as HTMLElement).closest("button")) return;
    const box = event.currentTarget.getBoundingClientRect();
    onCanvasClick((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };

  return (
    <div className={`slide-canvas ${compact ? "compact" : ""}`} onClick={click} role={onCanvasClick ? "button" : undefined} tabIndex={onCanvasClick ? 0 : undefined}>
      {/* Generated slide URLs are runtime assets and intentionally bypass Next image optimization. */}
      {slide.imageUrl
        ? <img src={slide.imageUrl} alt={t("common.slideNumber", { number: slide.pageIndex + 1 })} />
        /* 변환된 슬라이드에는 항상 imageUrl 이 있다. 이미지가 아직/끝내 없을 때 흰 판만 남지 않게 한다. */
        : <div className="slide-placeholder">{slide.pageIndex + 1}</div>}
      {showPins && questions.filter((q) => q.x !== null && q.y !== null && (!visibleQuestionIds || visibleQuestionIds.includes(q.id))).map((q, index) => {
        const isBox = q.anchorKind === "box" && q.width != null && q.height != null;
        const isPath = q.anchorKind === "path" && (q.path?.length ?? 0) >= 2;
        const isLive = liveQuestionId === q.id;
        const markerEmoji = questionMarkerEmoji(q.marker);
        const marker = markerEmoji ?? index + 1;
        return (
          <Fragment key={q.id}>
            {isPath ? (
              <>
                <svg className={`question-path ${selectedId === q.id ? "selected" : ""} ${isLive ? "live" : ""}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={q.path!.map((point) => `${point.x},${point.y}`).join(" ")}
                    vectorEffect="non-scaling-stroke"
                    onClick={() => onSelectPin?.(q.id)}
                  />
                </svg>
                <button
                  className={`question-path-marker ${markerEmoji ? "emoji-pin" : ""} ${selectedId === q.id ? "selected" : ""} ${isLive ? "live" : ""}`}
                  style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%` }}
                  onClick={() => onSelectPin?.(q.id)}
                  aria-label={t("question.areaAria", { text: q.text })}
                >
                  {markerEmoji ? <span aria-hidden="true">{markerEmoji}</span> : marker}
                </button>
              </>
            ) : isBox ? (
              <button
                className={`question-region ${selectedId === q.id ? "selected" : ""} ${isLive ? "live" : ""}`}
                style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%`, width: `${q.width! * 100}%`, height: `${q.height! * 100}%` }}
                onClick={() => onSelectPin?.(q.id)}
                aria-label={t("question.areaAria", { text: q.text })}
              >
                <span className={markerEmoji ? "emoji-pin" : ""}>{marker}</span>
              </button>
            ) : (
              <button className={`question-pin ${markerEmoji ? "emoji-pin" : ""} ${selectedId === q.id ? "selected" : ""} ${isLive ? "live" : ""}`} style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%` }} onClick={() => onSelectPin?.(q.id)} aria-label={t("question.pinAria", { text: q.text })}>
                {markerEmoji ? <span aria-hidden="true">{markerEmoji}</span> : marker}
              </button>
            )}
            {showQuestionLabels && (
              <button
                className={`question-tag category ${questionCategoryClass(questionCategories, q.category)} ${q.answer ? "answered" : ""} ${isBox || isPath ? "region-tag" : ""} ${labelContent === "body" ? "feedback-bubble" : ""} ${q.reactionCount >= 5 ? "empathy-fire" : ""} ${isLive ? "live" : ""}`}
                style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%` }}
                onClick={() => onSelectPin?.(q.id)}
                aria-label={t("question.answeredAria", { answered: q.answer ? 1 : 0, text: q.text })}
              >
                {labelContent === "body" ? <>
                  {q.reactionCount >= 5 && <span className="pin-fire-effect" aria-hidden="true">🔥🔥🔥</span>}
                  <span className="feedback-bubble-body">{q.text}</span>
                  {q.reactionCount > 0 && <span className="pin-empathy-count" aria-label={t("question.empathyCount", { count: q.reactionCount })}>👍 {q.reactionCount}</span>}
                </> : q.answer ? `${t("question.checkAnswer")} · ${categoryLabel(q.category)}` : categoryLabel(q.category)}
              </button>
            )}
          </Fragment>
        );
      })}
      {children}
    </div>
  );
}
