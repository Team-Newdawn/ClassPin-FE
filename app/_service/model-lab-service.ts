import { getAccessToken } from "@/app/_infrastructure/supabase/client";
import type { ExperimentRun } from "@/app/(view)/admin/ai-reports/[id]/experiment-model";
import type { LabSelection } from "@/app/_model/model-lab";
import type { LabMetrics } from "@/app/_model/model-lab-metrics";
export type LabJob = LabSelection & { id: string; createdAt: string; mode: string; status: string; completed?: number; error?: string; metrics?: LabMetrics; run?: ExperimentRun & { freshElapsedMs?: number } };
const errors: Record<string,string> = {
  NO_SAVED_COMBINATION: "저장된 동일 조합이 없습니다. ‘새 실험 실행’을 선택해 주세요.",
  LOCAL_RUNTIME_MISSING: "로컬 Python 실행 환경 또는 실험 코드가 없습니다.",
  PREPROCESSING_MISSING: "선택 모델의 15페이지 OCR·영역 결과가 없습니다.",
  ANOTHER_RUN_ACTIVE: "다른 실험이 실행 중입니다. 완료 후 다시 실행해 주세요.",
  AUTH_REQUIRED: "로컬 강사 계정으로 로그인해 주세요.",
  AI_REPORT_NOT_FOUND: "이 실험 자료의 소유 계정으로 로그인해야 합니다.",
  LOCAL_ONLY: "로컬 개발 환경에서만 사용할 수 있습니다.",
};
export async function labRequest<T>(job?: string, selection?: LabSelection, mode?: string, signal?: AbortSignal): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`/api/dev/model-lab${job ? `?job=${encodeURIComponent(job)}` : ""}`, {
    method: selection ? "POST" : "GET", signal, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(selection ? { "Content-Type": "application/json" } : {}) },
    body: selection ? JSON.stringify({ ...selection, mode }) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(errors[data.error?.code] ?? "실험 요청에 실패했습니다. 로컬 설정과 실행 상태를 확인해 주세요.");
  return data as T;
}
