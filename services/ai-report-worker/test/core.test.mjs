import assert from "node:assert/strict";
import test from "node:test";
import { fakeCanonical } from "../src/fake-provider.mjs";
import { evidenceRefs, mapQuestionsToRegions } from "../src/mapping.mjs";
import { parseTesseractPageSize, redactText, sanitizeQuestionSnapshot } from "../src/privacy.mjs";
import { validateCanonicalReport, validateCritic, validateSlideAnalysis } from "../src/validation.mjs";

test("PIN coordinates map deterministically to the smallest nearby semantic region", () => {
  const regions = [
    { alias: "R001", bboxNorm: { x1: 0, y1: 0, x2: 1, y2: 1 } },
    { alias: "R002", bboxNorm: { x1: .4, y1: .4, x2: .6, y2: .6 } },
  ];
  const mapped = mapQuestionsToRegions({ questions: [{ questionAlias: "Q001", text: "왜?", anchor: { kind: "point", coords: { x: .5, y: .5 } } }] }, regions);
  assert.equal(mapped[0].regionAlias, "R002");
  assert.deepEqual([...evidenceRefs("M001", "S001", regions, mapped)], ["M001/S001/R001", "M001/S001/R002", "M001/S001/Q001"]);
  assert.equal(mapQuestionsToRegions({ questions: [{ questionAlias: "Q002", anchor: { kind: "point", coords: { x: 0, y: 0 } } }] }, [{ alias: "R001", bboxNorm: { x1: .8, y1: .8, x2: 1, y2: 1 } }])[0].mappingStatus, "coordinate-unmapped");
});

test("AI input strips source UUID mappings and redacts contact data and secrets", () => {
  const sanitized = sanitizeQuestionSnapshot({ questions: [{ questionAlias: "Q001", sourceMapping: { questionId: "secret-uuid" }, text: "mail a@b.com", answers: [{ body: "key sk-12345678901234567890" }] }] });
  assert.equal(JSON.stringify(sanitized).includes("secret-uuid"), false);
  assert.equal(JSON.stringify(sanitized).includes("a@b.com"), false);
  assert.equal(JSON.stringify(sanitized).includes("sk-12345678901234567890"), false);
  assert.equal(redactText("010-1234-5678").text, "[REDACTED]");
});

test("OCR coordinates use the complete slide canvas rather than the text extent", () => {
  const tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t1920\t1080\t-1\t";
  assert.deepEqual(parseTesseractPageSize(tsv), { width: 1920, height: 1080 });
});

test("slide analysis requires stable aliases and valid normalized boxes", () => {
  const slide = {
    schemaVersion: "ai-report-slide-analysis.v1", slideAlias: "S001", slideSummary: "핵심 요약", keyConcepts: [],
    regions: [{ alias: "R001", type: "title", bboxNorm: { x1: .1, y1: .1, x2: .9, y2: .3 }, readingOrder: 1, summary: "제목", concepts: [], importance: "high", confidence: .9 }],
  };
  assert.equal(validateSlideAnalysis(slide, "S001"), slide);
  assert.throws(() => validateSlideAnalysis({ ...slide, regions: [{ ...slide.regions[0], alias: "R009" }] }, "S001"));
});

test("critic rejection and fabricated evidence references block publication", () => {
  assert.throws(() => validateCritic({ schemaVersion: "ai-report-critic.v1", pass: false, issueCodes: ["UNSUPPORTED_CLAIM"] }));
  const claim = { id: "C001", title: "", body: "요약", evidenceLevel: "limited", evidenceRefs: ["M001/S001/R999"] };
  const report = {
    schemaVersion: "ai-report-canonical.v1", overallEvidenceLevel: "limited", executiveSummary: [claim], confusionPoints: [], unansweredQuestions: [], improvementPriorities: [],
    materials: [{ materialAlias: "M001", title: "자료", slides: [{ slideAlias: "S001", slideNumber: 1, title: "", summary: "요약", regionCount: 1, pinCount: 0 }] }],
    claimIds: ["C001"], narrative: { title: "리포트", paragraphs: ["요약"] },
  };
  assert.throws(() => validateCanonicalReport(report, new Set(["M001/S001/R001"]), [{ materialAlias: "M001", title: "자료", slides: [{ slideAlias: "S001", slideNumber: 1, regionCount: 1, pinCount: 0 }] }]));
});

test("local synthesis fills instructor sections from segmented pages and PIN evidence", () => {
  const region = { alias: "R001", summary: "문제 정의", bboxNorm: { x1: .1, y1: .1, x2: .9, y2: .3 } };
  const pins = [
    { questionAlias: "Q001", text: "근거는 무엇인가요?", category: "why", status: "unanswered", answers: [], mappingStatus: "mapped", regionAlias: "R001" },
    { questionAlias: "Q002", text: "어떻게 측정했나요?", category: "why", status: "unanswered", answers: [], mappingStatus: "mapped", regionAlias: "R001" },
  ];
  const materials = [{
    materialAlias: "M001",
    title: "자료.pdf",
    slides: [{ slideAlias: "S001", slideNumber: 1, summary: "문제 정의와 사용자 조사", keyConcepts: [], regions: [region], pins }],
  }];
  const report = fakeCanonical(materials);
  const knownRefs = new Set(["M001/S001/R001", "M001/S001/Q001", "M001/S001/Q002"]);
  const expected = [{ materialAlias: "M001", title: "자료.pdf", slides: [{ slideAlias: "S001", slideNumber: 1, regionCount: 1, pinCount: 2 }] }];
  assert.equal(validateCanonicalReport(report, knownRefs, expected), report);
  assert.ok(report.executiveSummary.length >= 3);
  assert.equal(report.confusionPoints.length, 1);
  assert.equal(report.unansweredQuestions.length, 2);
  assert.ok(report.improvementPriorities.length >= 1);
  assert.equal(report.materials[0].slides[0].pinCount, 2);
});
