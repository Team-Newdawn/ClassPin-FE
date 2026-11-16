import { insightCrop, prepareInsightEvidence } from "../_model/insight-evidence.ts";
import type { InsightAnchor, InsightQuestion } from "../_model/insight-evidence.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseInsightSelection(value: unknown): string[] {
  const body = record(value);
  if (Object.keys(body).length !== 1 || !Array.isArray(body.materialIds)
    || body.materialIds.length < 1 || body.materialIds.length > 20
    || body.materialIds.some((id) => typeof id !== "string" || !uuid.test(id))) throw new Error("INVALID_SELECTION");
  const ids = (body.materialIds as string[]).map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new Error("INVALID_SELECTION");
  return ids.sort();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_SOURCE");
  return value as Record<string, unknown>;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("INVALID_SOURCE");
  return value.map(record);
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_SOURCE");
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (!uuid.test(result)) throw new Error("INVALID_SOURCE");
  return result.toLowerCase();
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("INVALID_SOURCE");
  return value as number;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("INVALID_SOURCE");
  return new Date(result).toISOString();
}
function anchor(value: unknown): InsightAnchor {
  if (value === null || (Array.isArray(value) && !value.length)) return null;
  if (Array.isArray(value) && value.length !== 1) throw new Error("UNSUPPORTED_ANCHORS");
  const source = record(Array.isArray(value) ? value[0] : value), coords = record(source.coords);
  let result: InsightAnchor;
  if (source.kind === "point") result = { kind: "point", x: coords.x as number, y: coords.y as number };
  else if (source.kind === "box") result = { kind: "box", x: coords.x as number, y: coords.y as number, width: coords.width as number, height: coords.height as number };
  else if (source.kind === "path") result = { kind: "path", points: rows(coords.points).map((point) => ({ x: point.x as number, y: point.y as number })) };
  else throw new Error("UNSUPPORTED_ANCHORS");
  insightCrop(result);
  return result;
}

/** Internal source projection, NOT a redacted AI payload or an atomic persisted snapshot. */
export function inspectInsightSource(graph: unknown, materialIds: readonly string[]) {
  const selection = parseInsightSelection({ materialIds });
  const found = new Set<string>(), usedSlides = new Set<string>(), usedQuestions = new Set<string>();
  const materials = [];
  for (const course of rows(graph)) for (const lecture of rows(course.lectures)) {
    const lectureMaterials = rows(lecture.materials);
    if (!lectureMaterials.some((material) => selection.includes(id(material.id)))) continue;
    const knownSlides = new Map<string, string>();
    for (const material of lectureMaterials) for (const version of rows(material.material_versions)) {
      for (const slide of rows(version.slides)) {
        const slideId = id(slide.id);
        if (knownSlides.has(slideId)) throw new Error("DUPLICATE_SOURCE");
        knownSlides.set(slideId, id(material.id));
      }
    }
    const lectureQuestions = rows(lecture.questions);
    if (lectureQuestions.some((question) => !knownSlides.has(id(question.slide_id)))) throw new Error("ORPHAN_QUESTION");
    for (const material of lectureMaterials) {
      const materialId = id(material.id);
      if (!selection.includes(materialId)) continue;
      if (found.has(materialId)) throw new Error("DUPLICATE_SOURCE");
      found.add(materialId);
      const versions = rows(material.material_versions).sort((a, b) => count(b.version_no) - count(a.version_no));
      if (!versions.length || new Set(versions.map((version) => count(version.version_no))).size !== versions.length) throw new Error("INVALID_VERSION");
      const version = versions[0], versionId = id(version.id);
      const slides = rows(version.slides).sort((a, b) => count(a.page_index) - count(b.page_index)).map((slide) => {
        const slideId = id(slide.id);
        if (id(slide.material_version_id) !== versionId || usedSlides.has(slideId)) throw new Error("INVALID_SLIDE");
        usedSlides.add(slideId);
        const imagePath = slide.image_path === null ? null : text(slide.image_path);
        const sourcePageIndex = slide.source_page_index === null ? null : count(slide.source_page_index);
        if (!imagePath && sourcePageIndex === null) throw new Error("MISSING_SLIDE_IMAGE");
        return { id: slideId, pageIndex: count(slide.page_index), imagePath, sourcePageIndex };
      });
      if (new Set(slides.map((slide) => slide.pageIndex)).size !== slides.length) throw new Error("INVALID_SLIDE");
      const questions = lectureQuestions.filter((question) => knownSlides.get(id(question.slide_id)) === materialId).map((question) => {
        const questionId = id(question.id), slideId = id(question.slide_id);
        if (id(question.lecture_id) !== id(lecture.id) || !slides.some((slide) => slide.id === slideId)) throw new Error("QUESTION_VERSION_MISMATCH");
        if (usedQuestions.has(questionId)) throw new Error("DUPLICATE_SOURCE");
        usedQuestions.add(questionId);
        const answers = rows(question.answers ?? []).map((answer) => ({ body: text(answer.body), createdAt: date(answer.created_at) }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.body.localeCompare(b.body));
        return { id: questionId, slideId, anchor: anchor(question.region_anchors),
          text: text(question.raw_text), category: text(question.category), status: text(question.status) as InsightQuestion["status"],
          reactions: count(question.reaction_count), createdAt: date(question.created_at), answers };
      }).sort((a, b) => a.id.localeCompare(b.id));
      materials.push({ id: materialId, folderId: course.folder_id == null ? null : id(course.folder_id), lectureId: id(lecture.id), lectureStatus: typeof lecture.status === "string" ? lecture.status : null, versionId, version: count(version.version_no), sourcePath: text(version.source_path),
        title: text(lecture.title), fileName: text(material.file_name), slides, questions,
        // Optional in the REST graph; the report falls back to the player's audience record (RPT-071).
        startedAt: typeof lecture.started_at === "string" ? lecture.started_at : null, endedAt: typeof lecture.ended_at === "string" ? lecture.ended_at : null });
    }
  }
  if (found.size !== selection.length) throw new Error("SOURCE_NOT_FOUND");
  if (usedSlides.size > 300 || usedQuestions.size > 5000) throw new Error("SOURCE_LIMIT");
  materials.sort((a, b) => a.id.localeCompare(b.id));
  const evidence = prepareInsightEvidence(materials.flatMap((material) => material.slides.map((slide) => slide.id)),
    materials.flatMap((material) => material.questions.map((question) => ({ ...question, answerCount: question.answers.length }))));
  return { materials, evidence,
    counts: { materials: materials.length, slides: usedSlides.size, questions: usedQuestions.size,
      answers: evidence.reduce((sum, slide) => sum + slide.metrics.answers, 0) } };
}
