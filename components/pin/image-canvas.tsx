"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/language-context";
import { configuredFeedbackCategoryLabel, feedbackCategoryClass, feedbackPinMarkerEmoji, type Campaign, type CampaignPage, type FeedbackPin } from "@/lib/pin/types";

/**
 * 기준 이미지 위에 핀을 얹는 캔버스.
 *
 * 강의 앱의 SlideCanvas 와 좌표 공식은 같지만 종횡비 처리가 다르다. SlideCanvas 는
 * aspect-ratio 를 16:9 로 고정하고 img 에 object-fit:contain 을 걸어 두는데, 좌표는
 * 이미지가 아니라 컨테이너 기준으로 계산된다. 슬라이드는 늘 16:9 라 문제가 없지만
 * 임의 비율 사진에서는 레터박스 여백에도 핀이 찍히고 저장 좌표가 이미지상 위치와 어긋난다.
 * 그래서 여기서는 컨테이너를 이미지 원본 비율에 맞춰 여백 자체를 없앤다.
 */
export function ImageCanvas({ campaign, page, pins = [], visiblePinIds, pinDisplayPositions, selectedId, livePinId, onSelectPin, onCanvasClick, showLabels = false, labelMode = "always", labelContent = "category", children }: {
  campaign: Campaign;
  page?: CampaignPage;
  pins?: FeedbackPin[];
  visiblePinIds?: ReadonlySet<string>;
  pinDisplayPositions?: ReadonlyMap<string, { x: number; y: number }>;
  selectedId?: string | null;
  /** 플레이어가 방금 받은 실시간 피드백에만 쓰는 일시적인 강조 표시다. */
  livePinId?: string | null;
  onSelectPin?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
  showLabels?: boolean;
  /** 피드백이 몰린 자리는 라벨끼리 겹쳐 읽을 수 없다. 많이 쌓이는 화면은 "selected" 로 둔다. */
  labelMode?: "always" | "selected";
  /** 플레이어는 선택된 핀 옆에 유형 대신 피드백 본문을 말풍선으로 보여준다. */
  labelContent?: "category" | "body";
  children?: ReactNode;
}) {
  const { feedbackCategoryLabel, t } = useLanguage();
  const categoryLabel = (category: FeedbackPin["category"]) =>
    configuredFeedbackCategoryLabel(campaign.feedbackCategories, category, feedbackCategoryLabel);
  const categoryClass = (category: FeedbackPin["category"]) => feedbackCategoryClass(campaign.feedbackCategories, category);
  // 예전 행이나 업로드 직후처럼 크기를 모를 때는 이미지가 로드되며 알려주는 값으로 메운다.
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const activePage = page ?? campaign.pages[0];
  const width = activePage?.imageWidth ?? measured?.width;
  const height = activePage?.imageHeight ?? measured?.height;

  const click = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onCanvasClick || (event.target as HTMLElement).closest("button")) return;
    const box = event.currentTarget.getBoundingClientRect();
    onCanvasClick((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };

  return (
    <div
      className="pin-canvas"
      style={{ aspectRatio: width && height ? `${width} / ${height}` : "16 / 9" }}
      onClick={click}
      role={onCanvasClick ? "button" : undefined}
      tabIndex={onCanvasClick ? 0 : undefined}
    >
      {/* 캠페인 이미지는 런타임 자산이라 Next 이미지 최적화를 일부러 거친다. */}
      {activePage?.imageUrl
        ? <img
            key={activePage.id}
            src={activePage.imageUrl}
            alt={t("pin.image.alt", { title: campaign.title })}
            onLoad={(event) => {
              if (width && height) return;
              const image = event.currentTarget;
              setMeasured({ width: image.naturalWidth, height: image.naturalHeight });
            }}
          />
        : <div className="slide-placeholder">{t("pin.image.unavailable")}</div>}
      {pinDisplayPositions && <svg className="pin-displacement-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {pins.map((pin) => {
          const position = pinDisplayPositions.get(pin.id);
          if (!position || (Math.abs(position.x - pin.x) < 0.0001 && Math.abs(position.y - pin.y) < 0.0001)) return null;
          return <line key={pin.id} x1={pin.x * 100} y1={pin.y * 100} x2={position.x * 100} y2={position.y * 100} />;
        })}
      </svg>}
      {pins.map((pin) => {
        const position = pinDisplayPositions?.get(pin.id) ?? pin;
        const markerEmoji = feedbackPinMarkerEmoji(pin.marker);
        const reactionCount = pin.reactionCount;
        return <Fragment key={pin.id}>
          {/* 핀 자체를 유형 색으로 칠하면 라벨 없이도 지도가 한눈에 읽힌다. */}
          <button
            className={`question-pin pin-mark ${categoryClass(pin.category)} ${markerEmoji ? "emoji-pin" : ""} ${selectedId === pin.id ? "selected" : ""} ${livePinId === pin.id ? "live" : ""}`}
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
            data-feedback-pin-id={pin.id}
            hidden={visiblePinIds ? !visiblePinIds.has(pin.id) : undefined}
            onClick={() => onSelectPin?.(pin.id)}
            aria-label={t("pin.image.feedbackAria", { category: categoryLabel(pin.category), body: pin.body })}
          >
            {markerEmoji && <span aria-hidden="true">{markerEmoji}</span>}
          </button>
          {showLabels && (labelMode === "always" || selectedId === pin.id) && (
            <button
              className={`question-tag pin-category ${categoryClass(pin.category)} ${livePinId === pin.id ? "live" : ""} ${labelContent === "body" ? `feedback-bubble ${reactionCount >= 5 ? "empathy-fire" : ""} ${position.x > 0.58 ? "to-left" : ""} ${position.y < 0.12 ? "below" : ""}` : ""}`}
              style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
              data-feedback-label-id={pin.id}
              onClick={() => onSelectPin?.(pin.id)}
              aria-label={reactionCount > 0 && labelContent === "body"
                ? t("pin.image.feedbackBodyWithEmpathyAria", { body: pin.body, count: reactionCount })
                : t("pin.image.feedbackBodyAria", { body: pin.body })}
              title={labelContent === "body" ? pin.body : undefined}
            >
              {labelContent === "body" ? <>
                <span className="feedback-bubble-body">{pin.body}</span>
                {reactionCount > 0 && <span className="pin-empathy-count" aria-label={t("pin.image.empathyCount", { count: reactionCount })}>👍 {reactionCount}</span>}
                {reactionCount >= 5 && <span className="pin-fire-effect" aria-hidden="true">🔥🔥🔥</span>}
              </> : categoryLabel(pin.category)}
            </button>
          )}
        </Fragment>
      })}
      {children}
    </div>
  );
}
