import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_REPORT_MAX_QUESTIONS,
  AI_REPORT_MAX_QUESTIONS_PER_SLIDE,
  AI_REPORT_MAX_SLIDES,
  type AiReportSelectionKind,
} from "@/app/_model/ai-report";
import { AdminApiError } from "@/app/_infrastructure/server/admin-api";

interface MaterialSelectionRow {
  id: string;
  file_name: string;
  lecture_id: string;
  courses: { owner_id: string; folder_id: string | null } | null;
  material_versions: Array<{
    id: string;
    version_no: number;
    checksum: string | null;
    source_path: string;
    slides: Array<{ id: string; page_index: number; image_path: string }>;
  }>;
}

interface QuestionFingerprintRow {
  id: string;
  lecture_id: string;
  slide_id: string | null;
  raw_text: string;
  category: string;
  status: string;
  reaction_count: number;
  created_at: string;
  updated_at: string;
  region_anchors: unknown;
  answers: unknown;
}

export interface LoadedAiReportSelection {
  selectionKind: AiReportSelectionKind;
  folderId: string | null;
  materialIds: string[];
  materialCount: number;
  slideCount: number;
  questionCount: number;
  sourceFingerprint: string;
}

interface AiReportSelectionInspection {
  materialCount?: unknown;
  slideCount?: unknown;
  questionCount?: unknown;
  sourceFingerprint?: unknown;
}

function hashParts(parts: readonly string[]) {
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

export async function loadAiReportSelection(
  client: SupabaseClient,
  ownerId: string,
  materialIds: string[],
  selectionKind: AiReportSelectionKind,
  folderId: string | null,
): Promise<LoadedAiReportSelection> {
  const { data: materialData, error: materialError } = await client.from("materials")
    .select(`
      id,
      file_name,
      lecture_id,
      courses!inner(owner_id, folder_id),
      material_versions(id, version_no, checksum, source_path, slides(id, page_index, image_path))
    `)
    .in("id", materialIds);
  if (materialError) throw new AdminApiError(503, "AI_REPORT_SOURCE_READ_FAILED", true);

  const materials = ((materialData ?? []) as unknown as MaterialSelectionRow[])
    .sort((a, b) => a.id.localeCompare(b.id));
  if (materials.length !== materialIds.length
    || materials.some((material) => material.courses?.owner_id !== ownerId)
    || (selectionKind === "folder" && materials.some((material) => material.courses?.folder_id !== folderId))) {
    throw new AdminApiError(403, "AI_REPORT_SOURCE_NOT_OWNED");
  }

  const versions = materials.map((material) => {
    const version = [...material.material_versions]
      .sort((a, b) => b.version_no - a.version_no || b.id.localeCompare(a.id))[0];
    if (!version || !version.slides.length) throw new AdminApiError(409, "AI_REPORT_SOURCE_INCOMPLETE");
    return { material, version, slides: [...version.slides].sort((a, b) => a.page_index - b.page_index || a.id.localeCompare(b.id)) };
  });
  const slideCount = versions.reduce((count, item) => count + item.slides.length, 0);
  if (slideCount < 1 || slideCount > AI_REPORT_MAX_SLIDES) {
    throw new AdminApiError(422, "AI_REPORT_SLIDE_LIMIT");
  }

  const selectedSlideIds = versions.flatMap(({ slides }) => slides.map((slide) => slide.id));
  const { data: questionData, error: questionError } = await client.from("questions")
    .select("id, lecture_id, slide_id, raw_text, category, status, reaction_count, created_at, updated_at, region_anchors(kind, coords), answers(body, visibility, created_at)")
    .in("slide_id", selectedSlideIds)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (questionError) throw new AdminApiError(503, "AI_REPORT_SOURCE_READ_FAILED", true);
  const questions = ((questionData ?? []) as unknown as QuestionFingerprintRow[])
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (questions.length > AI_REPORT_MAX_QUESTIONS) throw new AdminApiError(422, "AI_REPORT_QUESTION_LIMIT");
  const questionCounts = new Map<string, number>();
  questions.forEach((question) => {
    if (!question.slide_id) return;
    questionCounts.set(question.slide_id, (questionCounts.get(question.slide_id) ?? 0) + 1);
  });
  if ([...questionCounts.values()].some((count) => count > AI_REPORT_MAX_QUESTIONS_PER_SLIDE)) {
    throw new AdminApiError(422, "AI_REPORT_SLIDE_QUESTION_LIMIT");
  }

  const sourceFingerprint = hashParts([
    ...versions.flatMap(({ material, version, slides }) => [
      JSON.stringify([material.id, material.file_name, material.lecture_id, version.id, version.version_no, version.checksum, version.source_path]),
      ...slides.map((slide) => JSON.stringify([material.id, version.id, slide.id, slide.page_index, slide.image_path])),
    ]),
    ...questions.map((question) => JSON.stringify([
      question.id,
      question.lecture_id,
      question.slide_id,
      question.raw_text,
      question.category,
      question.status,
      question.reaction_count,
      question.created_at,
      question.updated_at,
      question.region_anchors,
      question.answers,
    ])),
  ]);

  return {
    selectionKind,
    folderId,
    materialIds,
    materialCount: materials.length,
    slideCount,
    questionCount: questions.length,
    sourceFingerprint,
  };
}

export async function inspectAiReportSelection(
  serviceClient: SupabaseClient,
  ownerId: string,
  materialIds: string[],
  selectionKind: AiReportSelectionKind,
  folderId: string | null,
): Promise<LoadedAiReportSelection> {
  const { data, error } = await serviceClient.rpc("inspect_ai_report_selection", {
    target_owner_id: ownerId,
    target_selection_kind: selectionKind,
    target_folder_id: folderId,
    target_material_ids: materialIds,
  });
  if (error) {
    if (error.message.includes("material limit")) throw new AdminApiError(422, "AI_REPORT_MATERIAL_LIMIT");
    if (error.message.includes("slide limit")) throw new AdminApiError(422, "AI_REPORT_SLIDE_LIMIT");
    if (error.message.includes("question limit")) throw new AdminApiError(422, "AI_REPORT_QUESTION_LIMIT");
    if (error.message.includes("incomplete")) throw new AdminApiError(409, "AI_REPORT_SOURCE_INCOMPLETE");
    if (error.code === "42501") throw new AdminApiError(403, "AI_REPORT_SOURCE_NOT_OWNED");
    throw new AdminApiError(503, "AI_REPORT_SOURCE_READ_FAILED", true);
  }
  const inspection = data as AiReportSelectionInspection | null;
  const materialCount = Number(inspection?.materialCount);
  const slideCount = Number(inspection?.slideCount);
  const questionCount = Number(inspection?.questionCount);
  const sourceFingerprint = inspection?.sourceFingerprint;
  if (!Number.isInteger(materialCount) || !Number.isInteger(slideCount)
    || !Number.isInteger(questionCount) || typeof sourceFingerprint !== "string"
    || !/^[0-9a-f]{64}$/.test(sourceFingerprint)) {
    throw new AdminApiError(503, "AI_REPORT_SOURCE_READ_FAILED", true);
  }
  return { selectionKind, folderId, materialIds, materialCount, slideCount, questionCount, sourceFingerprint };
}
