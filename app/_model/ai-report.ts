export const AI_REPORT_MAX_MATERIALS = 20;
export const AI_REPORT_MAX_SLIDES = 300;
export const AI_REPORT_MAX_QUESTIONS = 5000;
export const AI_REPORT_MAX_QUESTIONS_PER_SLIDE = 100;

export type AiReportStatus =
  | "queued"
  | "preparing"
  | "analyzing"
  | "synthesizing"
  | "criticizing"
  | "ready"
  | "failed"
  | "confirmed"
  | "deleting";

export type AiReportProductStatus = "queued" | "analyzing" | "ready" | "failed" | "confirmed";
export type AiReportSelectionKind = "material" | "materials" | "folder";

export interface AiReportPreflight {
  selectionKind: AiReportSelectionKind;
  folderId: string | null;
  materialIds: string[];
  materialCount: number;
  slideCount: number;
  questionCount: number;
  estimatedCostMinUsd: number;
  estimatedCostMaxUsd: number;
  requiresCostConfirmation: boolean;
  quoteExpiresAt: string;
  quote: string;
}

export interface AiReportCreateResult {
  reportId: string;
  jobId: string;
  reused: boolean;
}

export interface AiReportSummary {
  id: string;
  folderId: string | null;
  status: AiReportStatus;
  productStatus: AiReportProductStatus;
  progressCompleted: number;
  progressTotal: number;
  materialCount: number;
  slideCount: number;
  questionCount: number;
  estimatedCostMaxUsd: number;
  actualCostUsd: number;
  safeErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AiReportEvidenceLevel = "sufficient" | "limited" | "insufficient";

export interface AiReportMaterialSnapshot {
  material_alias: string;
  ordinal: number;
  title_snapshot: string;
}

export interface AiReportRevisionSummary {
  id: string;
  revision_no: number;
  kind: string;
  target_section: string | null;
  instruction_redacted: string | null;
  status: string;
  display_result: unknown;
  selected_claim_ids: unknown;
  safe_error_code: string | null;
  created_at: string;
}

export interface AiReportDetailDto {
  id: string;
  selection_kind: AiReportSelectionKind;
  folder_id: string | null;
  folder_name_snapshot: string | null;
  cutoff_at: string;
  status: AiReportStatus;
  product_status: AiReportProductStatus;
  progress_completed: number;
  progress_total: number;
  material_count: number;
  slide_count: number;
  question_count: number;
  source_fingerprint: string;
  estimated_cost_min_usd: number;
  estimated_cost_max_usd: number;
  actual_cost_usd: number;
  canonical_result: unknown;
  current_revision_id: string | null;
  confirmed_revision_id: string | null;
  safe_error_code: string | null;
  created_at: string;
  updated_at: string;
  materials: AiReportMaterialSnapshot[];
  revisions: AiReportRevisionSummary[];
  category_pins?: import("./ai-report-categories").ReportCategoryPin[];
}

export interface AiReportEvidenceDto {
  evidenceRef: string;
  materialAlias: string;
  materialTitle: string;
  slideAlias: string;
  slideNumber: number;
  imageUrl: string;
  expiresAt: string;
  region: {
    alias: string;
    type: string;
    summary: string;
    bboxNorm: { x1: number; y1: number; x2: number; y2: number };
  } | null;
  pin: {
    questionAlias: string;
    text: string;
    category: string;
    status: string;
    reactionCount: number;
    regionAlias: string | null;
    mappingStatus: string;
    anchor: unknown;
    answers: Array<{ body: string }>;
  } | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAiReportMaterialIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("materialIds must be an array");
  const normalized = [...new Set(value.map((item) => typeof item === "string" ? item.toLowerCase() : ""))].sort();
  if (normalized.length < 1 || normalized.length > AI_REPORT_MAX_MATERIALS || normalized.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error(`materialIds must contain 1-${AI_REPORT_MAX_MATERIALS} unique UUIDs`);
  }
  return normalized;
}

export function aiReportProductStatus(status: AiReportStatus): AiReportProductStatus {
  if (status === "queued") return "queued";
  if (status === "ready") return "ready";
  if (status === "failed") return "failed";
  if (status === "confirmed") return "confirmed";
  return "analyzing";
}

export function aiReportProgressPercent(completed: number, total: number) {
  if (!Number.isInteger(completed) || !Number.isInteger(total) || completed < 0 || total < 1) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

export function aiReportSelectionKind(materialCount: number, folderSelected: boolean): AiReportSelectionKind {
  if (folderSelected) return "folder";
  return materialCount === 1 ? "material" : "materials";
}
