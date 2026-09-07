"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { convertToSlides } from "@/app/_service/convert";
import { useSessions } from "@/app/_controller/session-store";
import { useLanguage } from "@/app/_controller/language-context";
import { localizeUploadError } from "@/app/_model/i18n";
import type { Slide } from "@/app/_model/types";

/** idle → uploading(바이트 전송) → processing(페이지 분석 또는 서버 변환) → 이동 */
export type UploadPhase = "idle" | "uploading" | "processing";

/** 준비 작업이 이보다 오래 걸리면 슬라이드를 도착하는 대로 미리 보여준다. */
const PREVIEW_AFTER_MS = 2000;

/** 도착 순서가 뒤섞여 오므로 페이지 번호 순서로 끼워 넣는다. */
function insertByPage(list: Slide[], slide: Slide): Slide[] {
  return [...list, slide].sort((a, b) => a.pageIndex - b.pageIndex);
}

/**
 * 업로드 화면 두 곳이 공유하는 변환 흐름.
 *
 * 업로드 구간은 회선에 좌우돼 길어질 수 있어 진행률을 바로 보여준다. 바이트가 다
 * 올라간 뒤에는 PDF 페이지 분석 또는 PPT/PPTX 서버 변환을 processing 상태로 둔다.
 * 준비가 2초를 넘기면 사용 가능한 슬라이드를 도착하는 대로 미리 보여준다.
 */
export function useSlideUpload(folderId: string | null = null) {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const { createSession } = useSessions();
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [total, setTotal] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; }
  };
  useEffect(() => clearTimer, []);

  const start = useCallback(async (file?: File) => {
    if (!file) return;
    setError(null);
    setUploadPct(0);
    setSlides([]);
    setTotal(0);
    setShowPreview(false);
    setPhase("uploading");
    try {
      const result = await convertToSlides(file, {
        onUploadProgress: (fraction) => {
          setUploadPct(Math.round(fraction * 100));
          if (fraction >= 1) {
            // 마지막 바이트 뒤에는 PDF 페이지 분석 또는 PPT/PPTX 변환이 남는다.
            setPhase("processing");
            clearTimer();
            previewTimer.current = setTimeout(() => setShowPreview(true), PREVIEW_AFTER_MS);
          }
        },
        onMeta: (count) => setTotal(count),
        onSlide: (slide) => setSlides((prev) => insertByPage(prev, slide)),
      });
      clearTimer();
      const session = await createSession({
        folderId,
        title: file.name.replace(/\.(pdf|pptx?)$/i, ""),
        fileName: file.name,
        slides: result.slides,
        sourcePath: result.sourcePath,
      });
      router.push(`/admin/session/${session.id}`);
    } catch (cause) {
      clearTimer();
      setError(cause instanceof Error ? localizeUploadError(locale, cause.message) : t("upload.failed"));
      setPhase("idle");
      setShowPreview(false);
    }
  }, [createSession, folderId, locale, router, t]);

  return { phase, uploadPct, error, slides, total, showPreview, busy: phase !== "idle", start };
}
