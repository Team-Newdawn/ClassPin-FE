"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { clusterPins } from "@/app/_model/pin-clusters";
import { placeBubbles } from "@/app/_model/class/presentation-rotation";




import { useLanguage } from "@/app/_controller/language-context";
import { questionMarkerEmoji, type Question, type Slide } from "@/app/_model/types";
import { PdfPage } from "./pdf-page";
import styles from "./slide-canvas.module.css";

// 자리가 좁을 때 말풍선이 바꿀 수 있는 모양. 앞쪽부터 시도한다: 폭을 줄여 최대 3줄로 감싸기 → 더 좁은 한 줄(넘치면 …).
const BUBBLE_SHAPES = [{ maxWidth: 180, wrap: true }, { maxWidth: 120, wrap: true }, { maxWidth: 90, wrap: true }, { maxWidth: 110, wrap: false }, { maxWidth: 80, wrap: false }];

export function SlideCanvas({ slide, questions = [], visibleQuestionIds, selectedId, liveQuestionId, onSelectPin, onSelectCluster, expandedIds, highlightedId, dimmed = false, onCanvasClick, showQuestionLabels = false, showPins = true, compact = false, children }: {
  slide: Slide;
  questions?: Question[];
  visibleQuestionIds?: readonly string[];
  selectedId?: string | null;
  liveQuestionId?: string | null;
  onSelectPin?: (id: string) => void;
  /** 강사 플레이어·발표 화면: 묶음을 펼침 목록 대신 콜백으로 넘기고, 같은 PIN 조작 디자인(pin-manager)을 쓴다. */
  onSelectCluster?: (ids: string[]) => void;
  expandedIds?: readonly string[];
  highlightedId?: string | null;
  dimmed?: boolean;
  onCanvasClick?: (x: number, y: number) => void;
  showQuestionLabels?: boolean;
  showPins?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const lastPlacement = useRef<{ key: string; placements: ReturnType<typeof placeBubbles> } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root || compact) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(root);
    return () => observer.disconnect();
  }, [compact]);
  // 말풍선 실제 크기를 재서 PIN 주변의 겹치지 않는 자리로 옮긴다. 모든 말풍선을 표시한다.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !showQuestionLabels) return;
    const origin = root.getBoundingClientRect();
    const pins = [...root.querySelectorAll<HTMLElement>("[data-bubble-anchor]")].map((pin) => {
      const box = pin.getBoundingClientRect();
      return { id: pin.dataset.bubbleAnchor!, bounds: { left: box.left - origin.left, right: box.right - origin.left, top: box.top - origin.top, bottom: box.bottom - origin.top } };
    });
    const bubbles = [...root.querySelectorAll<HTMLElement>("[data-bubble-for]")];
    const activeKey = [liveQuestionId, selectedId].map((id) => id && bubbles.find((bubble) => bubble.dataset.bubbleFor!.split(" ").includes(id))?.dataset.bubbleFor).find(Boolean) ?? null;
    // 기본 모양과 BUBBLE_SHAPES 중 기본보다 좁은 모양들의 실제 크기를 잰다.
    // ponytail: 말풍선마다 모양 여러 개를 측정해 렌더마다 reflow가 생긴다. 말풍선이 수백 개가 되면 텍스트 길이로 크기를 추정한다.
    const apply = (bubble: HTMLElement, shape?: (typeof BUBBLE_SHAPES)[number]) => {
      bubble.style.maxWidth = shape ? `${shape.maxWidth}px` : "";
      bubble.classList.toggle("wrapped", Boolean(shape?.wrap));
    };
    const requests = bubbles.flatMap((bubble) => {
      const pin = pins.find((item) => item.id === bubble.dataset.bubbleFor);
      if (!pin) return [];
      apply(bubble);
      const variants = [undefined, ...BUBBLE_SHAPES.filter((shape) => shape.maxWidth < bubble.offsetWidth)];
      const shapes = variants.map((shape) => { apply(bubble, shape); return { width: bubble.offsetWidth, height: bubble.offsetHeight }; });
      return [{ id: pin.id, x: bubble.offsetLeft, y: bubble.offsetTop, shapes, pin: pin.bounds, element: bubble, variants }];
    });
    // 같은 입력이면 지난 배치를 다시 쓴다. 발표 중 PIN 공개 타이머처럼 배치와 무관한 렌더에서 계산을 건너뛴다.
    const key = JSON.stringify([origin.width, origin.height, activeKey, pins, requests.map(({ element, ...request }) => (void element, request))]);
    if (lastPlacement.current?.key !== key) lastPlacement.current = { key, placements: placeBubbles(requests, pins, origin.width, origin.height, activeKey) };
    for (const { id, element, variants } of requests) {
      const placement = lastPlacement.current.placements.get(id)!;
      apply(element, variants[placement.shape]);
      element.style.transform = `translate(${placement.x}px, ${placement.y}px)`;
    }
  });
  const visiblePins = questions.filter((q) => q.x !== null && q.y !== null && (!visibleQuestionIds || visibleQuestionIds.includes(q.id)));
  const clusters = clusterPins(visiblePins.filter((q) => q.anchorKind !== "box" && q.anchorKind !== "path"), size.width, size.height).filter((group) => group.length > 1);
  const clusteredIds = new Set(clusters.flat().map((q) => q.id));
  const click = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!onCanvasClick) return;
    const box = event.currentTarget.getBoundingClientRect();
    onCanvasClick(event.detail === 0 ? .5 : (event.clientX - box.left) / box.width, event.detail === 0 ? .5 : (event.clientY - box.top) / box.height);
  };

  return (
    <div ref={rootRef} className={`${styles.root} slide-canvas ${compact ? "compact" : ""} ${onSelectCluster ? "pin-manager" : ""} ${dimmed ? "focus-dim" : ""}`}>
      {/* Generated slide URLs are runtime assets and intentionally bypass Next image optimization. */}
      {slide.imageUrl
        ? <img src={slide.imageUrl} alt={t("common.slideNumber", { number: slide.pageIndex + 1 })} />
        : slide.pdfUrl && slide.sourcePageIndex !== undefined
          ? <><div className="slide-placeholder">{slide.pageIndex + 1}</div><PdfPage url={slide.pdfUrl} pageNumber={slide.sourcePageIndex + 1} label={t("common.slideNumber", { number: slide.pageIndex + 1 })} eager={!compact} /></>
        /* 변환된 슬라이드에는 항상 imageUrl 이 있다. 이미지가 아직/끝내 없을 때 흰 판만 남지 않게 한다. */
          : <div className="slide-placeholder">{slide.pageIndex + 1}</div>}
      {onCanvasClick && <button type="button" className="slide-placement-control" onClick={click} aria-label={t("student.pinTool")} />}
      {showPins && visiblePins.filter((q) => !clusteredIds.has(q.id) || (!onSelectCluster && (q.id === selectedId || q.id === liveQuestionId))).map((q) => {
        const isBox = q.anchorKind === "box" && q.width != null && q.height != null;
        const isPath = q.anchorKind === "path" && (q.path?.length ?? 0) >= 2;
        const isLive = liveQuestionId === q.id;
        const isSelected = selectedId === q.id || isLive;
        const markerEmoji = questionMarkerEmoji(q.marker);
        const position = q;
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
                  {markerEmoji && <span aria-hidden="true">{markerEmoji}</span>}
                </button>
              </>
            ) : isBox ? (
              <button
                className={`question-region ${selectedId === q.id ? "selected" : ""} ${isLive ? "live" : ""}`}
                style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%`, width: `${q.width! * 100}%`, height: `${q.height! * 100}%` }}
                onClick={() => onSelectPin?.(q.id)}
                aria-label={t("question.areaAria", { text: q.text })}
              >
                <span className={markerEmoji ? "emoji-pin" : ""}>{markerEmoji}</span>
              </button>
            ) : (
              <button className={`question-pin ${isSelected ? "selected focused" : ""} ${isLive ? "live" : ""}`} style={{ left: `${position.x! * 100}%`, top: `${position.y! * 100}%` }} data-bubble-anchor={q.id} onClick={() => onSelectPin?.(q.id)} aria-label={t("question.pinAria", { text: q.text })}>
                <img className="question-pin-icon" src="/assets/design/question-pin.svg" alt="" aria-hidden="true" draggable={false} />
                <span className={`question-pin-marker ${markerEmoji ? "emoji" : ""}`} aria-hidden="true">{markerEmoji}</span>
              </button>
            )}
            {showQuestionLabels && (
              <button
                className={`question-tag question-bubble ${isBox || isPath ? "region-tag" : ""} ${q.reactionCount >= 5 ? "empathy-fire" : ""} ${isLive ? "live" : ""} ${selectedId === q.id ? "focused" : ""}`}
                style={{ left: `${position.x! * 100}%`, top: `${position.y! * 100}%` }}
                data-bubble-for={q.id}
                onClick={() => onSelectPin?.(q.id)}
                aria-label={t("question.pinAria", { text: q.text })}
              >
                {q.reactionCount >= 5 && <span className="question-fire-effect" aria-hidden="true">🔥🔥🔥</span>}
                <span className="question-bubble-body">{q.text}</span>
                {q.reactionCount > 0 && <span className="question-empathy-count" aria-label={t("question.empathyCount", { count: q.reactionCount })}>👍 {q.reactionCount}</span>}
              </button>
            )}
          </Fragment>
        );
      })}
      {showPins && clusters.map((group) => {
        const x = group.reduce((sum, pin) => sum + pin.x!, 0) / group.length;
        const y = group.reduce((sum, pin) => sum + pin.y!, 0) / group.length;
        const selected = group.some((pin) => pin.id === selectedId || pin.id === liveQuestionId);
        if (onSelectCluster) {
          const ordered = [...group].sort((a, b) => b.reactionCount - a.reactionCount);
          const ids = ordered.map((pin) => pin.id);
          const style = { left: `${x * 100}%`, top: `${y * 100}%` };
          // 오른쪽 패널에서 고른 질문(highlightedId)이 묶음 안에 있으면 묶음을 풀어 그 PIN을 보여 준다.
          if (expandedIds?.some((id) => ids.includes(id)) || (highlightedId && ids.includes(highlightedId))) {
            // 각 PIN을 묶음 중심에서 자기 실제 좌표로 이동시킨다(확대·재배치 없음).
            const spots = ordered.map((pin) => [(pin.x! - x) * size.width, (pin.y! - y) * size.height]);
            return <div key={ids.join("|")} className="pin-cluster-expanded focused" style={style}>
              {ordered.map((pin, index) => <button key={pin.id} type="button" className={`pin-cluster-spot ${pin.id === highlightedId ? "highlighted" : ""}`} style={{ "--spot-x": `${spots[index][0]}px`, "--spot-y": `${spots[index][1]}px`, animationDelay: `${index * 35}ms` } as React.CSSProperties} onClick={() => onSelectPin?.(pin.id)} aria-label={`${index + 1}. ${t("question.pinAria", { text: pin.text })}`}><span aria-hidden="true">{index + 1}</span></button>)}
            </div>;
          }
          return <Fragment key={ids.join("|")}>
            <button type="button" className={`pin-cluster-button ${selected ? "selected focused" : ""}`} style={{ ...style, "--cluster-size": `${Math.min(24 + group.length * 4, 56)}px` } as React.CSSProperties} data-cluster-ids={ids.join(" ")} data-bubble-anchor={ids.join(" ")} onClick={() => onSelectCluster(ids)} aria-label={t("question.clusterCount", { count: group.length })}>{group.length}</button>
            {showQuestionLabels && <button type="button" className={`question-tag question-bubble cluster-tag ${selected ? "focused" : ""}`} style={style} data-bubble-for={ids.join(" ")} onClick={() => onSelectCluster(ids)} aria-label={t("question.clusterCount", { count: group.length })}>
              <span className="question-bubble-body">{ordered[0].text}</span><span className="question-tag-more">{t("question.clusterMore", { count: group.length - 1 })}</span>
            </button>}
          </Fragment>;
        }
        return <details key={group.map((pin) => pin.id).sort().join("|")} className={`pin-cluster ${selected ? "selected" : ""}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
          <summary aria-label={t("question.clusterCount", { count: group.length })}>{group.length}</summary>
          <div className={`pin-cluster-list ${x < .25 ? "align-left" : x > .75 ? "align-right" : ""} ${y > .65 ? "above" : ""}`}>{group.map((pin) => <button key={pin.id} type="button" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; onSelectPin?.(pin.id); }}>{pin.text}</button>)}</div>
        </details>;
      })}
      {children}
    </div>
  );
}
