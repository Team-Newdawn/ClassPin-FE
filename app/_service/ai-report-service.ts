import { aiReportProductStatus, type AiReportCreateResult, type AiReportDetailDto, type AiReportEvidenceDto, type AiReportPreflight, type AiReportStatus, type AiReportSummary } from "@/app/_model/ai-report";
import { getAccessToken } from "@/app/_infrastructure/supabase/client";

export class AiReportServiceError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
  }
}

async function authenticatedJson<T>(url: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new AiReportServiceError("AUTH_REQUIRED", false);
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const value = await response.json().catch(() => null) as { error?: { code?: string; retryable?: boolean } } | null;
  if (!response.ok) {
    throw new AiReportServiceError(
      value?.error?.code ?? "AI_REPORT_REQUEST_FAILED",
      Boolean(value?.error?.retryable),
    );
  }
  return value as T;
}

export function preflightAiReport(input: {
  materialIds: string[];
  selectionKind: "material" | "materials" | "folder";
  folderId: string | null;
}) {
  return authenticatedJson<AiReportPreflight>("/api/admin/ai-reports/preflight", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createAiReport(input: {
  quote: string;
  idempotencyKey: string;
  confirmedCost: boolean;
}) {
  return authenticatedJson<AiReportCreateResult>("/api/admin/ai-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

interface AiReportSummaryWire {
  id: string;
  folder_id: string | null;
  status: AiReportStatus;
  progress_completed: number;
  progress_total: number;
  material_count: number;
  slide_count: number;
  question_count: number;
  estimated_cost_max_usd: number;
  actual_cost_usd: number;
  safe_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchAiReports(signal?: AbortSignal): Promise<AiReportSummary[]> {
  const result = await authenticatedJson<{ reports: AiReportSummaryWire[] }>("/api/admin/ai-reports", { signal });
  return result.reports.map((report) => ({
    id: report.id,
    folderId: report.folder_id,
    status: report.status,
    productStatus: aiReportProductStatus(report.status),
    progressCompleted: report.progress_completed,
    progressTotal: report.progress_total,
    materialCount: report.material_count,
    slideCount: report.slide_count,
    questionCount: report.question_count,
    estimatedCostMaxUsd: report.estimated_cost_max_usd,
    actualCostUsd: report.actual_cost_usd,
    safeErrorCode: report.safe_error_code,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  }));
}

export async function fetchAiReport(reportId: string, options?: { signal?: AbortSignal; etag?: string | null }) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new AiReportServiceError("AUTH_REQUIRED", false);
  const response = await fetch(`/api/admin/ai-reports/${encodeURIComponent(reportId)}`, {
    signal: options?.signal,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options?.etag ? { "if-none-match": options.etag } : {}),
    },
    cache: "no-store",
  });
  if (response.status === 304) return { data: null, etag: options?.etag ?? null, notModified: true as const };
  const value = await response.json().catch(() => null) as AiReportDetailDto | { error?: { code?: string; retryable?: boolean } } | null;
  if (!response.ok) {
    const error = value && "error" in value ? value.error : undefined;
    throw new AiReportServiceError(error?.code ?? "AI_REPORT_REQUEST_FAILED", Boolean(error?.retryable));
  }
  return {
    data: value as AiReportDetailDto,
    etag: response.headers.get("etag"),
    notModified: false as const,
  };
}

export function fetchAiReportEvidence(reportId: string, evidenceRef: string, signal?: AbortSignal) {
  return authenticatedJson<AiReportEvidenceDto>(`/api/admin/ai-reports/${encodeURIComponent(reportId)}/evidence/${evidenceRef.split("/").map(encodeURIComponent).join("/")}`, { signal });
}

export function retryAiReport(reportId: string, idempotencyKey: string) {
  return authenticatedJson<AiReportCreateResult>(`/api/admin/ai-reports/${encodeURIComponent(reportId)}/retry`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey }),
  });
}
