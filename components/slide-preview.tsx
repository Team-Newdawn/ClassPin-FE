"use client";

/* eslint-disable @next/next/no-img-element */
import type { Slide } from "@/lib/types";

/**
 * 변환되는 대로 도착한 슬라이드를 채워 보여준다. 아직 안 온 자리는 빈 칸으로 남겨
 * "채워지는" 느낌을 준다 — 전체 완료를 기다리지 않아도 진행이 눈에 보인다.
 */
export function SlidePreview({ slides, total }: { slides: Slide[]; total: number }) {
  const remaining = Math.max(0, total - slides.length);
  return (
    <div className="slide-preview">
      <div className="slide-preview-head">
        <span>슬라이드 미리보기</span>
        <span>{slides.length}{total ? ` / ${total}` : ""}장</span>
      </div>
      <div className="slide-preview-grid">
        {slides.map((slide) => (
          <img key={slide.id} src={slide.imageUrl} alt={`${slide.pageIndex + 1}번 슬라이드`} loading="lazy" />
        ))}
        {Array.from({ length: remaining }).map((_, index) => (
          <div key={`placeholder-${index}`} className="slide-preview-ph" />
        ))}
      </div>
    </div>
  );
}
