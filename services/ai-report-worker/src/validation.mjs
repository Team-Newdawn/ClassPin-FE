import { WorkerError } from "./errors.mjs";
import { containsSensitiveText } from "./privacy.mjs";

const REGION_TYPES = new Set(["title", "paragraph", "table", "chart", "formula", "code", "image", "diagram", "callout", "footer", "other"]);
const LEVELS = new Set(["sufficient", "limited", "insufficient"]);
const CLAIM_SECTIONS = ["executiveSummary", "confusionPoints", "unansweredQuestions", "improvementPriorities"];
const REF_PATTERN = /^M\d{3}\/S\d{3}\/(?:R|Q)\d{3}$/;

function object(value, code = "AI_REPORT_OUTPUT_INVALID") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkerError(code, { retryable: true });
  return value;
}

function safeString(value, maximum, allowEmpty = false) {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.trim().length > 0) && !containsSensitiveText(value);
}

export function validateSlideAnalysis(value, slideAlias) {
  const result = object(value);
  if (result.schemaVersion !== "ai-report-slide-analysis.v1" || result.slideAlias !== slideAlias
    || !safeString(result.slideSummary, 800) || !Array.isArray(result.keyConcepts)
    || result.keyConcepts.length > 12 || result.keyConcepts.some((item) => !safeString(item, 80))
    || new Set(result.keyConcepts).size !== result.keyConcepts.length || !Array.isArray(result.regions)
    || result.regions.length < 1 || result.regions.length > 12) throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true });
  const aliases = new Set();
  const orders = new Set();
  result.regions.forEach((raw, index) => {
    const region = object(raw);
    const expectedAlias = `R${String(index + 1).padStart(3, "0")}`;
    const box = object(region.bboxNorm);
    if (region.alias !== expectedAlias || aliases.has(region.alias) || !REGION_TYPES.has(region.type)
      || region.readingOrder !== index + 1 || orders.has(region.readingOrder)
      || !safeString(region.summary, 500) || !Array.isArray(region.concepts)
      || region.concepts.length > 8 || region.concepts.some((item) => !safeString(item, 80))
      || new Set(region.concepts).size !== region.concepts.length || !["low", "medium", "high"].includes(region.importance)
      || typeof region.confidence !== "number" || region.confidence < 0 || region.confidence > 1
      || ![box.x1, box.y1, box.x2, box.y2].every((item) => typeof item === "number" && item >= 0 && item <= 1)
      || box.x1 >= box.x2 || box.y1 >= box.y2) throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true });
    aliases.add(region.alias); orders.add(region.readingOrder);
  });
  return result;
}

export function validateCritic(value) {
  const result = object(value);
  if (result.schemaVersion !== "ai-report-critic.v1" || typeof result.pass !== "boolean"
    || !Array.isArray(result.issueCodes) || result.issueCodes.length > 12
    || result.issueCodes.some((code) => !["UNSUPPORTED_CLAIM", "BAD_EVIDENCE_REF", "OVERCONFIDENT", "MISSED_PIN", "PRIVACY_RISK", "INCONSISTENT_METRIC", "OTHER"].includes(code))
    || new Set(result.issueCodes).size !== result.issueCodes.length) throw new WorkerError("AI_REPORT_CRITIC_INVALID", { retryable: true });
  if (!result.pass) throw new WorkerError("AI_REPORT_CRITIC_REJECTED", { retryable: true });
  return result;
}

export function validateCanonicalReport(value, knownEvidenceRefs, expectedMaterials) {
  const result = object(value);
  if (result.schemaVersion !== "ai-report-canonical.v1" || !LEVELS.has(result.overallEvidenceLevel)
    || !Array.isArray(result.materials) || result.materials.length !== expectedMaterials.length) {
    throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true });
  }
  const claimIds = new Set();
  const limits = { executiveSummary: [1, 8], confusionPoints: [0, 20], unansweredQuestions: [0, 30], improvementPriorities: [0, 20] };
  for (const section of CLAIM_SECTIONS) {
    const [minimum, maximum] = limits[section];
    if (!Array.isArray(result[section]) || result[section].length < minimum || result[section].length > maximum) throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true });
    for (const raw of result[section]) {
      const claim = object(raw);
      if (!/^C\d{3}$/.test(claim.id) || claimIds.has(claim.id) || !safeString(claim.title, 120, true)
        || !safeString(claim.body, 900) || !LEVELS.has(claim.evidenceLevel)
        || !Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length < 1
        || claim.evidenceRefs.some((ref) => !REF_PATTERN.test(ref) || !knownEvidenceRefs.has(ref))) {
        throw new WorkerError("AI_REPORT_EVIDENCE_INVALID", { retryable: true });
      }
      claimIds.add(claim.id);
    }
  }
  if (!Array.isArray(result.claimIds) || result.claimIds.length !== claimIds.size
    || result.claimIds.some((id) => !claimIds.has(id))) throw new WorkerError("AI_REPORT_EVIDENCE_INVALID", { retryable: true });
  expectedMaterials.forEach((expected, index) => {
    const material = object(result.materials[index]);
    if (material.materialAlias !== expected.materialAlias || material.title !== expected.title
      || !Array.isArray(material.slides) || material.slides.length !== expected.slides.length) {
      throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true });
    }
    expected.slides.forEach((slide, slideIndex) => {
      const actual = object(material.slides[slideIndex]);
      if (actual.slideAlias !== slide.slideAlias || actual.slideNumber !== slide.slideNumber
        || actual.regionCount !== slide.regionCount || actual.pinCount !== slide.pinCount
        || !safeString(actual.summary, 800)) throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true });
    });
  });
  const narrative = object(result.narrative);
  if (!safeString(narrative.title, 160) || !Array.isArray(narrative.paragraphs)
    || narrative.paragraphs.length < 1 || narrative.paragraphs.length > 30
    || narrative.paragraphs.some((item) => !safeString(item, 1200))) throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true });
  return result;
}
