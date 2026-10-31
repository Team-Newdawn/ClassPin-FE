import test from "node:test";
import assert from "node:assert/strict";
import type { InsightReportBody } from "./insight-report.ts";
import { applyReportProposal, draftReport, parseReportDocument, parseReportProposal, reportMetrics, staleTargets } from "./report.ts";

const metrics = reportMetrics(
  { slides: [1, 2, 3], questions: [
    { anchor: { kind: "point" }, reactions: 2 },
    { anchor: null, reactions: 0 }] },
  { startedAt: "2026-10-27T01:00:00Z", endedAt: "2026-10-27T01:50:00Z" }, null, "2026-10-27T02:00:00Z");

test("metrics count from source and leave unrecorded audience null", () => {
  assert.deepEqual(metrics, { at: "2026-10-27T02:00:00Z", slides: 3, questions: 2, pins: 1,
    reactions: 2, durationMinutes: 50, audience: null, peakAudience: null });
});

test("draft follows the approved section order and caps quoted questions", () => {
  const analysis: InsightReportBody = { schemaVersion: 2, model: "m",
    slides: [{ page: 1, topic: "도입", content: "내용", questionSummary: "", suggestion: "", metrics: { questions: 0, positioned: 0, unanswered: 0, answered: 0, resolved: 0, reactions: 0, answers: 0 } },
      { page: 2, topic: "본론", questionSummary: "질문 요약", suggestion: "예시 추가", issues: [{ title: "용어", summary: "설명 부족", questionIds: [] }],
        metrics: { questions: 12, positioned: 0, unanswered: 12, answered: 0, resolved: 0, reactions: 0, answers: 0 } }],
    questions: Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, page: 2, text: `질문${i}`, answers: [], reactions: i, status: "unanswered" })),
    sections: [{ title: "피칭 요약", text: "전체" }, { title: "보완점", text: "- 제안" }],
    groups: [{ title: "용어", summary: "묶음", questionIds: ["q0", "q1", "q2", "q3", "q4", "q5"] }] };
  const draft = draftReport({ title: "강의", metrics, analysis, questions: [] });
  assert.deepEqual(draft.sections.map((s) => s.title), ["개요", "피칭 요약", "보완점", "주제: 용어", "슬라이드 1 · 도입", "슬라이드 2 · 본론"]);
  assert.equal(draft.sections[3].text.split("\n").filter((line) => line.startsWith("- ")).length, 5);
  const slide2 = draft.sections[5];
  assert.equal(slide2.slide, 2);
  assert.match(slide2.text, /^- 질문11 \(공감 11 · 미답변\)/m);
  assert.match(slide2.text, /외 2개$/);
  assert.equal(draft.sections[4].text, "내용");
});

test("metrics-only draft keeps raw questions per slide that has them", () => {
  const draft = draftReport({ title: "강의", metrics, analysis: null,
    questions: [{ page: 3, text: "왜?", reactions: 0, status: "answered", answers: ["그래서"] }] });
  assert.deepEqual(draft.sections.map((s) => [s.title, s.slide]), [["개요", undefined], ["슬라이드 3", 3]]);
  assert.equal(draft.sections[1].text, "- 왜? (답변됨)\n  답변: 그래서");
});

test("document parsing rejects bad input and keeps server metrics", () => {
  const stored = draftReport({ title: "t", metrics, analysis: null, questions: [] });
  const ok = parseReportDocument({ title: "새", metrics: { slides: 999 }, sections: [{ id: "a", title: "x", text: "y", slide: 3 }] }, stored);
  assert.equal(ok.metrics, stored.metrics);
  for (const bad of [{ title: "t", sections: [{ id: "a", title: "", text: "", slide: 4 }] },
    { title: "t", sections: [{ id: "a", title: "", text: "" }, { id: "a", title: "", text: "" }] },
    { title: "t", sections: [{ id: "a", title: "", text: "x".repeat(20_001) }] }, null])
    assert.throws(() => parseReportDocument(bad, stored), /INVALID_DOCUMENT/);
});

test("proposal validates ids and applies replace, insert, remove in place", () => {
  const doc = { title: "t", metrics, sections: [{ id: "a", title: "A", text: "1" }, { id: "b", title: "B", text: "2" }] };
  assert.throws(() => parseReportProposal({ replace: [{ id: "zz", title: "", text: "" }], insert: [], remove: [] }, doc), /INVALID_PROPOSAL/);
  assert.throws(() => parseReportProposal({ replace: [], insert: [], remove: [] }, doc), /INVALID_PROPOSAL/);
  const proposal = parseReportProposal({ replace: [{ id: "b", title: "B2", text: "22" }], insert: [{ after: null, title: "0", text: "", slide: 1 }, { after: "a", title: "A+", text: "" }], remove: ["a"] }, doc);
  const next = applyReportProposal(doc, proposal);
  assert.deepEqual(next.sections.map((s) => s.title), ["0", "A+", "B2"]);
  assert.equal(next.sections[0].slide, 1);
  assert.deepEqual(doc.sections.map((s) => s.title), ["A", "B"]);
});

test("only replaced or removed sections edited after the proposal arrived are stale", () => {
  const proposal = { replace: [{ id: "a", title: "A", text: "" }], insert: [{ after: "b", title: "N", text: "" }], remove: ["c"] };
  const edited = new Map([["a", 200], ["b", 300], ["c", 50]]);
  assert.deepEqual(staleTargets(proposal, edited, 100), ["a"]);
  assert.deepEqual(staleTargets(proposal, edited, 10), ["a", "c"]);
  assert.deepEqual(staleTargets(proposal, new Map(), 0), []);
});

test("report text: inline bold and sizes nest inside one line, tables parse, malformed markup stays literal", async () => {
  const { formatReportLine, parseReportText } = await import("./report.ts");
  const [line] = parseReportText("보통 <big>**굵고 크게**</big> 그리고 <small>작게</small> **굵게**");
  assert.deepEqual(line.kind === "line" && line.runs, [{ text: "보통 " }, { text: "굵고 크게", size: "big", bold: true }, { text: " 그리고 " },
    { text: "작게", size: "small" }, { text: " " }, { text: "굵게", bold: true }]);
  assert.equal(line.kind === "line" && formatReportLine(line.runs), line.source, "format is the inverse of parse");
  assert.equal(formatReportLine([{ text: "가", size: "big", bold: true }, { text: "나", size: "big" }, { text: "다", size: "big" }]), "<big>**가**나다</big>");
  assert.deepEqual(parseReportText("**열림 <big>닫힘 없음").map((block) => block.kind === "line" && block.runs), [[{ text: "**열림 <big>닫힘 없음" }]]);

  const blocks = parseReportText("앞\n| 항목 | 값 |\n| --- | :---: |\n| **질문** | 4 |\n| 공감 |\n뒤");
  assert.deepEqual(blocks.map((block) => block.kind), ["line", "table", "line"]);
  const table = blocks[1];
  assert.ok(table.kind === "table");
  assert.deepEqual(table.rows, [[[{ text: "항목" }], [{ text: "값" }]], [[{ text: "질문", bold: true }], [{ text: "4" }]], [[{ text: "공감" }], []]]);
  assert.equal(table.source.split("\n").length, 4);
  // No rule line, a column-count mismatch, or more than 8 columns: plain lines.
  for (const text of ["| a | b |\n| c | d |", "| a | b |\n| --- |", `|${" x |".repeat(9)}\n|${" --- |".repeat(9)}`])
    assert.ok(parseReportText(text).every((block) => block.kind === "line"), text);
});
