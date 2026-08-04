"use client";

import type { UploadPhase } from "@/components/use-slide-upload";
import { useLanguage } from "@/components/language-context";

/**
 * 업로드·변환 진행 표시. 업로드 중에는 올린 비율을 채운 막대를, 서버 렌더링
 * 중에는 진행률을 알 수 없으므로 흐르는(부정) 막대를 보여준다.
 */
export function UploadProgress({ phase, uploadPct, done, total }: { phase: UploadPhase; uploadPct: number; done?: number; total?: number }) {
  const { t } = useLanguage();
  const uploading = phase === "uploading";
  const detail = uploading ? `${uploadPct}%` : (total ? `${done ?? 0} / ${t("upload.pages", { count: total })}` : "");
  return (
    <div className="upload-progress" role="status" aria-live="polite">
      <div className="upload-progress-head">
        <span>{uploading ? t("upload.uploading") : t("upload.converting")}</span>
        <span>{detail}</span>
      </div>
      <div className={`upload-progress-track ${uploading ? "" : "indeterminate"}`}>
        <div className="upload-progress-bar" style={uploading ? { width: `${uploadPct}%` } : undefined} />
      </div>
    </div>
  );
}
