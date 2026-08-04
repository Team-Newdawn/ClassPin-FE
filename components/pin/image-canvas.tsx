"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/language-context";
import type { Campaign, FeedbackPin } from "@/lib/pin/types";

/**
 * 기준 이미지 위에 핀을 얹는 캔버스.
 *
 * 강의 앱의 SlideCanvas 와 좌표 공식은 같지만 종횡비 처리가 다르다. SlideCanvas 는
 * aspect-ratio 를 16:9 로 고정하고 img 에 object-fit:contain 을 걸어 두는데, 좌표는
 * 이미지가 아니라 컨테이너 기준으로 계산된다. 슬라이드는 늘 16:9 라 문제가 없지만
 * 임의 비율 사진에서는 레터박스 여백에도 핀이 찍히고 저장 좌표가 이미지상 위치와 어긋난다.
 * 그래서 여기서는 컨테이너를 이미지 원본 비율에 맞춰 여백 자체를 없앤다.
 */
export function ImageCanvas({ campaign, pins = [], selectedId, onSelectPin, onCanvasClick, showLabels = false, labelMode = "always", children }: {
  campaign: Campaign;
  pins?: FeedbackPin[];
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
  showLabels?: boolean;
  /** 피드백이 몰린 자리는 라벨끼리 겹쳐 읽을 수 없다. 많이 쌓이는 화면은 "selected" 로 둔다. */
  labelMode?: "always" | "selected";
  children?: ReactNode;
}) {
  const { feedbackCategoryLabel, t } = useLanguage();
  // 예전 행이나 업로드 직후처럼 크기를 모를 때는 이미지가 로드되며 알려주는 값으로 메운다.
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const width = campaign.imageWidth ?? measured?.width;
  const height = campaign.imageHeight ?? measured?.height;

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
      {campaign.imageUrl
        ? <img
            src={campaign.imageUrl}
            alt={t("pin.image.alt", { title: campaign.title })}
            onLoad={(event) => {
              if (width && height) return;
              const image = event.currentTarget;
              setMeasured({ width: image.naturalWidth, height: image.naturalHeight });
            }}
          />
        : <div className="slide-placeholder">{t("pin.image.unavailable")}</div>}
      {pins.map((pin, index) => (
        <Fragment key={pin.id}>
          {/* 핀 자체를 유형 색으로 칠하면 라벨 없이도 지도가 한눈에 읽힌다. */}
          <button
            className={`question-pin pin-mark ${pin.category} ${selectedId === pin.id ? "selected" : ""}`}
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            onClick={() => onSelectPin?.(pin.id)}
            aria-label={t("pin.image.feedbackAria", { category: feedbackCategoryLabel(pin.category), body: pin.body })}
          >
            {index + 1}
          </button>
          {showLabels && (labelMode === "always" || selectedId === pin.id) && (
            <button
              className={`question-tag pin-category ${pin.category}`}
              style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
              onClick={() => onSelectPin?.(pin.id)}
              aria-label={t("pin.image.feedbackBodyAria", { body: pin.body })}
            >
              {feedbackCategoryLabel(pin.category)}
            </button>
          )}
        </Fragment>
      ))}
      {children}
    </div>
  );
}
