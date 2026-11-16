"use client";

import { useEffect } from "react";
import { loadPdfPageImage, PDF_PAGE_WIDTHS } from "@/app/_infrastructure/browser/pdf-document";
import type { Slide } from "@/app/_model/core/types";

/** The server page image `SlideCanvas` shows for this slide on the stage, or null (image slide, local blob PDF). */
const stagePage = (slide: Slide | undefined) =>
  slide && !slide.imageUrl && slide.pdfUrl?.startsWith("/api/pdf?") && slide.sourcePageIndex !== undefined
    ? [slide.pdfUrl, slide.sourcePageIndex + 1] as const : null;

/**
 * Once the current slide's stage image has arrived, loads the next and previous ones, so moving one slide shows at
 * once instead of waiting for a 1920px image (docs/frontend-performance-audit.md, 2026-11-16). `loadPdfPageImage`
 * shares in-flight requests, so this never repeats the stage's own request.
 */
export function usePrefetchNeighborSlides(slides: readonly Slide[] | undefined, index: number) {
  useEffect(() => {
    if (!slides) return;
    let active = true;
    const current = stagePage(slides[index]);
    const shown = current ? loadPdfPageImage(...current, PDF_PAGE_WIDTHS.full) : Promise.resolve("");
    void shown.catch(() => "").then(() => {
      if (!active) return;
      for (const page of [stagePage(slides[index + 1]), stagePage(slides[index - 1])]) {
        if (page) void loadPdfPageImage(...page, PDF_PAGE_WIDTHS.full).catch(() => {});
      }
    });
    return () => { active = false; };
  }, [slides, index]);
}
