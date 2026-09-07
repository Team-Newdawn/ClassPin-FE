"use client";

import type { Slide } from "@/app/_model/types";
import { useLanguage } from "@/app/_controller/language-context";
import { SlideCanvas } from "./slide-canvas";
import styles from "./slide-preview.module.css";

/**
 * 변환되는 대로 도착한 슬라이드를 채워 보여준다. 아직 안 온 자리는 빈 칸으로 남겨
 * "채워지는" 느낌을 준다 — 전체 완료를 기다리지 않아도 진행이 눈에 보인다.
 */
export function SlidePreview({ slides, total }: { slides: Slide[]; total: number }) {
  const { t } = useLanguage();
  const remaining = Math.max(0, total - slides.length);
  return (
    <div className={`${styles.root} slide-preview`}>
      <div className="slide-preview-head">
        <span>{t("upload.preview")}</span>
        <span>{total ? `${slides.length} / ${t("upload.pages", { count: total })}` : t("upload.pages", { count: slides.length })}</span>
      </div>
      <div className="slide-preview-grid">
        {slides.map((slide) => (
          <SlideCanvas key={slide.id} slide={slide} compact />
        ))}
        {Array.from({ length: remaining }).map((_, index) => (
          <div key={`placeholder-${index}`} className="slide-preview-ph" />
        ))}
      </div>
    </div>
  );
}
