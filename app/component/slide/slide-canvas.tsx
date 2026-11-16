"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clusterPins } from "@/app/_model/lecture/pin-clusters";
import { BUBBLE_GAP, placeBubbles } from "@/app/_model/presentation/presentation-rotation";
import { useLanguage } from "@/app/_controller/provider/language-context";
import { questionMarkerEmoji, type Question, type Slide } from "@/app/_model/core/types";
import { PdfPage } from "./pdf-page";
import { PdfPageImage } from "./pdf-page-image";
import styles from "./slide-canvas.module.css";

// 본문 전체를 감싼 실제 높이로 배치한다. 좁은 폭 다음에는 넓은 폭도 시도한다.
const BUBBLE_WIDTHS = [180, 480, 640];
// pin_notselected.svg와 pin_selected.svg에서 그려진 모양이 차지하는 비율(두 그림을 합친 범위). 그림의 나머지는 투명하다.
const DRAWN_PIN = { left: .21, top: .17, right: .82, bottom: .8 };

/**
 * 말풍선이 붙을 PIN 범위. PIN 버튼은 누르기 쉽게 그림보다 크고, 그림 안에도 투명한 여백이 있다.
 * 이 둘을 빼야 말풍선이 눈에 보이는 PIN 모양에 붙는다. 영역·경로 질문은 버튼 전체가 보이는 모양이다.
 */
function drawnPinBounds(pin: HTMLElement, left: number, top: number) {
  let x = left, y = top, width = pin.offsetWidth, height = pin.offsetHeight;
  const icon = pin.querySelector<HTMLElement>(":scope > .question-pin-icon");
  const clusterSize = pin.classList.contains("pin-cluster-button") ? parseFloat(getComputedStyle(pin).backgroundSize) : NaN;
  if (icon) {
    x += icon.offsetLeft; y += icon.offsetTop; width = icon.offsetWidth; height = icon.offsetHeight;
  } else if (clusterSize > 0) {
    x += (width - clusterSize) / 2; y += (height - clusterSize) / 2; width = height = clusterSize;
  } else {
    return { left: x, right: x + width, top: y, bottom: y + height };
  }
  return { left: x + width * DRAWN_PIN.left, right: x + width * DRAWN_PIN.right, top: y + height * DRAWN_PIN.top, bottom: y + height * DRAWN_PIN.bottom };
}

export const SlideCanvas = memo(function SlideCanvas({ slide, questions = [], visibleQuestionIds, selectedId, liveQuestionId, livePinEffect, onSelectPin, onSelectCluster, expandedIds, highlightedId, dimmed = false, onCanvasClick, showQuestionLabels = false, showPins = true, compact = false, children }: {
  slide: Slide;
  questions?: Question[];
  visibleQuestionIds?: readonly string[];
  selectedId?: string | null;
  liveQuestionId?: string | null;
  livePinEffect?: "collapse" | "hold";
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
  const lastPlacement = useRef<{ key: string; scale: number; placements: ReturnType<typeof placeBubbles> } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [arrivedPins, setArrivedPins] = useState({ slideId: slide.id, ids: [] as string[] });
  if (arrivedPins.slideId !== slide.id) setArrivedPins({ slideId: slide.id, ids: [] });
  else if (livePinEffect && liveQuestionId && !arrivedPins.ids.includes(liveQuestionId)) {
    setArrivedPins({ slideId: slide.id, ids: [...arrivedPins.ids, liveQuestionId] });
  }
  useEffect(() => {
    const root = rootRef.current;
    if (!root || compact) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(root);
    return () => observer.disconnect();
  }, [compact]);
  const visiblePins = useMemo(() => {
    const visibleIds = visibleQuestionIds && new Set(visibleQuestionIds);
    return questions.filter((q) => q.x !== null && q.y !== null && (!visibleIds || visibleIds.has(q.id)));
  }, [questions, visibleQuestionIds]);
  const clusters = useMemo(() => clusterPins(visiblePins.filter((q) => q.anchorKind !== "box" && q.anchorKind !== "path" && !(livePinEffect && (q.id === liveQuestionId || arrivedPins.ids.includes(q.id)))), size.width, size.height).filter((group) => group.length > 1), [visiblePins, size.width, size.height, arrivedPins.ids, livePinEffect, liveQuestionId]);
  const clusteredIds = useMemo(() => new Set(clusters.flatMap((group) => group.map((q) => q.id))), [clusters]);
  // 말풍선 실제 크기를 재서 PIN 주변의 겹치지 않는 자리로 옮긴다. 모든 말풍선을 표시한다.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!showQuestionLabels && !(dimmed && selectedId) && !(liveQuestionId && livePinEffect)) return;
    const origin = { width: root.clientWidth, height: root.clientHeight };
    if (!origin.width || !origin.height) return;
    const pins = [...root.querySelectorAll<HTMLElement>("[data-bubble-anchor]")].map((pin) => {
      // 도착 애니메이션 중에도 최종 크기로 배치해 확대되는 PIN과 말풍선이 겹치지 않게 한다.
      const transform = new DOMMatrixReadOnly(getComputedStyle(pin).transform);
      const left = pin.offsetLeft + transform.m41;
      const top = pin.offsetTop + transform.m42;
      return { id: pin.dataset.bubbleAnchor!, bounds: drawnPinBounds(pin, left, top) };
    });
    const bubbles = [...root.querySelectorAll<HTMLElement>("[data-bubble-for]")];
    const activeKey = [liveQuestionId, selectedId, livePinEffect ? arrivedPins.ids.at(-1) : null].map((id) => id && bubbles.find((bubble) => bubble.dataset.bubbleFor!.split(" ").includes(id))?.dataset.bubbleFor).find(Boolean) ?? null;
    // 본문 전체를 측정하고, 빈자리가 부족할 때만 글자와 여백을 함께 줄인다.
    const variants = [...new Set([Math.min(280, origin.width * .45), ...BUBBLE_WIDTHS.filter((width) => width < origin.width - 8), Math.max(1, origin.width - 8)])];
    const apply = (bubble: HTMLElement, scale: number, width: number) => {
      bubble.style.setProperty("--bubble-scale", String(scale));
      bubble.style.maxWidth = `${width * scale}px`;
    };
    const pinsById = new Map(pins.map((pin) => [pin.id, pin]));
    const measure = (scale: number) => bubbles.flatMap((bubble) => {
      const pin = pinsById.get(bubble.dataset.bubbleFor!);
      if (!pin) return [];
      const shapes = variants.map((width) => { apply(bubble, scale, width); return { width: bubble.offsetWidth, height: bubble.offsetHeight }; });
      return [{ id: pin.id, x: bubble.offsetLeft, y: bubble.offsetTop, shapes, pin: pin.bounds, element: bubble }];
    });
    let requests = measure(1);
    const key = JSON.stringify([origin.width, origin.height, activeKey, pins, requests.map(({ element, ...request }) => (void element, request))]);
    if (lastPlacement.current?.key !== key) {
      let scale = 1;
      // PIN과 같은 단위(slide-canvas.module.css의 --pin-unit: 발표·관리 화면은 캔버스 폭의 0.1%, 그 밖은 1px)로 간격을 키운다.
      const gap = BUBBLE_GAP * (root.classList.contains("pin-manager") ? origin.width / 1000 : 1);
      let placements = placeBubbles(requests, pins, origin.width, origin.height, activeKey, gap);
      for (let attempt = 0; attempt < 24 && requests.some(({ id, y, shapes }) => {
        const placement = placements.get(id)!;
        return y + placement.y + shapes[placement.shape].height > origin.height;
      }); attempt++) {
        scale *= .8;
        requests = measure(scale);
        placements = placeBubbles(requests, scale > .02 ? pins : [], origin.width, origin.height, activeKey, gap);
      }
      lastPlacement.current = { key, scale, placements };
    }
    const { scale, placements } = lastPlacement.current;
    for (const { id, element } of requests) {
      const placement = placements.get(id)!;
      apply(element, scale, variants[placement.shape]);
      element.style.transform = `translate(${placement.x}px, ${placement.y}px)`;
      element.style.setProperty("--bubble-x", `${placement.x}px`);
      element.style.setProperty("--bubble-y", `${placement.y}px`);
      element.style.transformOrigin = `${-placement.x}px ${-placement.y}px`;
    }
  }, [arrivedPins.ids, clusters, compact, dimmed, expandedIds, highlightedId, liveQuestionId, livePinEffect, selectedId, showPins, showQuestionLabels, size, t, visiblePins]);
  const click = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!onCanvasClick) return;
    const box = event.currentTarget.getBoundingClientRect();
    onCanvasClick(event.detail === 0 ? .5 : (event.clientX - box.left) / box.width, event.detail === 0 ? .5 : (event.clientY - box.top) / box.height);
  };

  const pdfPage = slide.pdfUrl && slide.sourcePageIndex !== undefined
    ? { url: slide.pdfUrl, pageNumber: slide.sourcePageIndex + 1, label: t("common.slideNumber", { number: slide.pageIndex + 1 }), eager: !compact } : null;

  return (
    <div ref={rootRef} data-live-effect={livePinEffect} className={`${styles.root} slide-canvas ${compact ? "compact" : ""} ${onSelectCluster ? "pin-manager" : ""} ${dimmed ? "focus-dim" : ""}`}>
      {/* Generated slide URLs are runtime assets and intentionally bypass Next image optimization. */}
      {slide.imageUrl
        ? <img src={slide.imageUrl} alt={t("common.slideNumber", { number: slide.pageIndex + 1 })} />
        : pdfPage
          ? <><div className="slide-placeholder">{slide.pageIndex + 1}</div>{/* Uploaded sources render on the server; a fresh local blob PDF still renders in the browser. */}
            {pdfPage.url.startsWith("/api/pdf?") ? <PdfPageImage {...pdfPage} /> : <PdfPage {...pdfPage} />}</>
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
                  data-bubble-anchor={q.id}
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
                data-bubble-anchor={q.id}
                className={`question-region ${selectedId === q.id ? "selected" : ""} ${isLive ? "live" : ""}`}
                style={{ left: `${q.x! * 100}%`, top: `${q.y! * 100}%`, width: `${q.width! * 100}%`, height: `${q.height! * 100}%` }}
                onClick={() => onSelectPin?.(q.id)}
                aria-label={t("question.areaAria", { text: q.text })}
              >
                <span className={markerEmoji ? "emoji-pin" : ""}>{markerEmoji}</span>
              </button>
            ) : (
              <button className={`question-pin ${isSelected ? "selected focused" : ""} ${isLive ? "live" : ""}`} style={{ left: `${position.x! * 100}%`, top: `${position.y! * 100}%` }} data-bubble-anchor={q.id} onClick={() => onSelectPin?.(q.id)} aria-label={t("question.pinAria", { text: q.text })}>
                <img className="question-pin-icon" src={isSelected ? "/assets/design/pin_selected.svg?v=3f409ad0" : "/assets/design/pin_notselected.svg?v=d7d07244"} alt="" aria-hidden="true" draggable={false} />
                <span className={`question-pin-marker ${markerEmoji ? "emoji" : ""}`} aria-hidden="true">{markerEmoji}</span>
              </button>
            )}
            {(showQuestionLabels || (onSelectCluster && dimmed && selectedId === q.id) || (isLive && livePinEffect)) && (
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
        const isLive = group.some((pin) => pin.id === liveQuestionId);
        const style = { left: `${x * 100}%`, top: `${y * 100}%`, "--cluster-size": `calc(${Math.min(24 + group.length * 4, 56)} * var(--pin-unit))` } as React.CSSProperties;
        if (onSelectCluster) {
          const ordered = [...group].sort((a, b) => b.reactionCount - a.reactionCount);
          const ids = ordered.map((pin) => pin.id);
          // 오른쪽 패널에서 고른 질문(highlightedId)이 묶음 안에 있으면 묶음을 풀어 그 PIN을 보여 준다.
          if (expandedIds?.some((id) => ids.includes(id)) || (highlightedId && ids.includes(highlightedId))) {
            // 각 PIN을 묶음 중심에서 자기 실제 좌표로 이동시킨다(확대·재배치 없음).
            const spots = ordered.map((pin) => [(pin.x! - x) * size.width, (pin.y! - y) * size.height]);
            return <div key={ids.join("|")} className="pin-cluster-expanded focused" style={style}>
              {ordered.map((pin, index) => <button key={pin.id} type="button" className={`pin-cluster-spot ${pin.id === highlightedId ? "highlighted" : ""}`} style={{ "--spot-x": `${spots[index][0]}px`, "--spot-y": `${spots[index][1]}px`, animationDelay: `${index * 35}ms` } as React.CSSProperties} onClick={() => onSelectPin?.(pin.id)} aria-label={`${index + 1}. ${t("question.pinAria", { text: pin.text })}`}><span aria-hidden="true">{index + 1}</span></button>)}
            </div>;
          }
          return <Fragment key={ids.join("|")}>
            <button type="button" className={`pin-cluster-button ${isLive ? "live" : ""} ${selected ? "selected focused" : ""}`} style={style} data-cluster-ids={ids.join(" ")} data-bubble-anchor={ids.join(" ")} onClick={() => onSelectCluster(ids)} aria-label={t("question.clusterCount", { count: group.length })}><span aria-hidden="true">{group.length}</span></button>
            {showQuestionLabels && <button type="button" className={`question-tag question-bubble cluster-tag ${isLive ? "live" : ""} ${selected ? "focused" : ""}`} style={style} data-bubble-for={ids.join(" ")} onClick={() => onSelectCluster(ids)} aria-label={t("question.clusterCount", { count: group.length })}>
              <span className="question-bubble-body">{ordered[0].text}</span><span className="question-tag-more">{t("question.clusterMore", { count: group.length - 1 })}</span>
            </button>}
          </Fragment>;
        }
        return <details key={group.map((pin) => pin.id).sort().join("|")} className={`pin-cluster ${selected ? "selected" : ""}`} style={style}>
          <summary aria-label={t("question.clusterCount", { count: group.length })}><span aria-hidden="true">{group.length}</span></summary>
          <div className={`pin-cluster-list ${x < .25 ? "align-left" : x > .75 ? "align-right" : ""} ${y > .65 ? "above" : ""}`}>{group.map((pin) => <button key={pin.id} type="button" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; onSelectPin?.(pin.id); }}>{pin.text}</button>)}</div>
        </details>;
      })}
      {children}
    </div>
  );
});
