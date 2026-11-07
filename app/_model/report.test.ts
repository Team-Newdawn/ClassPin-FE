import test from "node:test";
import assert from "node:assert/strict";
import type { InsightReportBody } from "./insight-report.ts";
import { chartSvg } from "./report-chart.ts";
import { draftReport, parseExportDocument, parseReportDocument, reportMetrics } from "./report.ts";

const metrics = reportMetrics(
  { slides: [1, 2, 3], questions: [
    { anchor: { kind: "point" }, reactions: 2 },
    { anchor: null, reactions: 0 }] },
  { startedAt: "2026-10-27T01:00:00Z", endedAt: "2026-10-27T01:50:00Z" }, null, "2026-10-27T02:00:00Z");

test("metrics count from source and leave unrecorded audience null", () => {
  assert.deepEqual(metrics, { at: "2026-10-27T02:00:00Z", slides: 3, questions: 2, pins: 1,
    reactions: 2, durationMinutes: 50, audience: null, peakAudience: null });
});

test("one detailed format: overview, AI sections, PIN flow, question types, every slide with all its questions (RPT-031)", async () => {
  const { reportAge } = await import("./report.ts");
  const empty = { questions: 0, positioned: 0, unanswered: 0, answered: 0, resolved: 0, reactions: 0, answers: 0 };
  const analysis: InsightReportBody = { schemaVersion: 2, model: "m",
    slides: [{ page: 1, topic: "도입", content: "내용", questionSummary: "", suggestion: "", metrics: empty },
      { page: 2, topic: "본론", questionSummary: "질문 요약", suggestion: "예시 추가", issues: [{ title: "용어", summary: "설명 부족", questionIds: [] }], metrics: { ...empty, questions: 12 } }],
    questions: Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, page: 2, text: `질문${i}`, answers: [], reactions: i, status: "unanswered" })),
    sections: [{ title: "피칭 요약", text: "전체" }, { title: "보완점", text: "- 제안" }],
    groups: [{ title: "용어", summary: "묶음", questionIds: ["q0", "q1", "q2", "q3", "q4", "q5"] }] };
  const questions = analysis.questions.map((q) => ({ page: q.page, text: q.text, reactions: q.reactions, pinned: q.id !== "q0", answers: q.id === "q11" ? ["답"] : [] }));
  const m = { ...metrics, slides: 2, questions: 12, pins: 11 };
  const draft = draftReport({ title: "강의", metrics: m, analysis, questions, lecture: { title: "1강", startedAt: "2026-11-02T05:00:00Z", folder: "테스트 · 교육" } });
  assert.deepEqual(draft.sections.map((s) => [s.title, s.slide ?? s.chart?.kind]), [["개요", undefined], ["피칭 요약", undefined], ["보완점", undefined],
    ["슬라이드별 PIN 질문 흐름", "line"], ["질문 유형", "bar"], ["질문 유형: 용어", undefined], ["슬라이드 1 · 도입", 1], ["슬라이드 2 · 본론", 2]]);
  assert.deepEqual(draft.sections[3].chart?.points, [{ label: "P.1", value: 0 }, { label: "P.2", value: 11 }]);
  assert.deepEqual(draft.sections[4].chart?.points, [{ label: "용어", value: 6 }]);
  assert.ok(!draft.sections[3].text.includes("|") && !draft.sections[4].text.includes("|"), "graphs replace the tables");
  assert.match(draft.sections[0].text, /^- 강의명: 1강\n- 일시: 2026년 11월 2일 오후 2:00\n- 진행 시간: 50분\n- 대상·목적: 테스트 · 교육/);
  assert.match(draft.sections[0].text, /\| 최다 슬라이드 \| P\.2 · 12건 \|\n\| 핀 찍힌 슬라이드 \| 1 \/ 2 · 핀 11개 \|\n\| 최다 주제 \| 용어 · 6건 \|/);
  assert.deepEqual([draft.sections[3].text, draft.sections[4].text], ["", ""], "graph sections carry no sentence");
  assert.match(draft.sections[5].text, /- 질문 6건 \(50%\)\n- 나온 슬라이드: P\.2 \(6\)/);
  assert.equal(draft.sections[5].text.split("\n").filter((line) => line.startsWith("- 질문")).length, 6, "the two facts and five top questions");
  const slide2 = draft.sections[7].text;
  assert.match(slide2, /^질문 요약\n\n- 용어: 설명 부족\n\n제안: 예시 추가\n\n질문 12건 \(공감순\)\n- 질문11 \(공감 11\)\n  답변: 답\n/);
  assert.match(slide2, /- 질문0$/, "every question, none cut, no answer status");
  assert.equal(draft.sections[6].text, "내용");
  const now = Date.parse("2026-11-01T12:00:00Z");
  assert.deepEqual(["2026-11-01T11:59:30Z", "2026-11-01T11:20:00Z", "2026-11-01T02:00:00Z", "2026-10-31T10:00:00Z", "2026-10-24T03:00:00Z"].map((iso) => reportAge(iso, now)),
    ["방금 수정됨", "40분 전", "10시간 전", "어제", "10월 24일"]);
});

test("metrics-only draft keeps the code-built parts and raw questions per slide that has them", () => {
  const draft = draftReport({ title: "강의", metrics: { ...metrics, slides: 3 }, analysis: null,
    questions: [{ page: 3, text: "왜?", reactions: 0, pinned: true, answers: ["그래서"] }] });
  assert.deepEqual(draft.sections.map((s) => [s.title, s.slide]), [["개요", undefined], ["슬라이드별 PIN 질문 흐름", undefined], ["슬라이드 3", 3]]);
  assert.equal(draft.sections[2].text, "질문 1건 (공감순)\n- 왜?\n  답변: 그래서");
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

test("report text: inline bold and sizes nest inside one line, tables parse, malformed markup stays literal", async () => {
  const { formatReportLine, parseReportText } = await import("./report.ts");
  const [line] = parseReportText("보통 <big>**굵고 크게**</big> 그리고 <small>작게</small> **굵게**");
  assert.deepEqual(line.kind === "line" && line.runs, [{ text: "보통 " }, { text: "굵고 크게", size: "big", bold: true }, { text: " 그리고 " },
    { text: "작게", size: "small" }, { text: " " }, { text: "굵게", bold: true }]);
  assert.equal(line.kind === "line" && formatReportLine(line.runs), line.source, "format is the inverse of parse");
  assert.equal(formatReportLine([{ text: "가", size: "big", bold: true }, { text: "나", size: "big" }, { text: "다", size: "big" }]), "<big>**가**나다</big>");
  assert.deepEqual(parseReportText("**열림 <big>닫힘 없음").map((block) => block.kind === "line" && block.runs), [[{ text: "**열림 <big>닫힘 없음" }]]);
  // RPT-024 (2026-11-02): italic, underline and http(s) links nest with the rest and round-trip.
  const [styled] = parseReportText("<i>기울임</i> <u>밑줄</u> [**자료**](https://ohpin.kr/a?b=1) [위험](javascript:alert(1))");
  assert.deepEqual(styled.kind === "line" && styled.runs, [{ text: "기울임", italic: true }, { text: " " }, { text: "밑줄", underline: true }, { text: " " },
    { text: "자료", link: "https://ohpin.kr/a?b=1", bold: true }, { text: " [위험](javascript:alert(1))" }]);
  assert.equal(styled.kind === "line" && formatReportLine(styled.runs), styled.source);
  assert.equal(formatReportLine([{ text: "가", link: "https://a.kr", italic: true, underline: true }, { text: "나", link: "https://a.kr" }]), "[<i><u>가</u></i>나](https://a.kr)");

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

test("analysis export document: caller metrics are checked for shape, sections for size", () => {
  const metrics = { at: "2026-11-01T00:00:00.000Z", slides: 3, questions: 2, pins: 1, reactions: 0, durationMinutes: null, audience: 4, peakAudience: null };
  const document = { title: "분석", metrics, sections: [{ id: "summary-0", title: "분석 요약", text: "질문 2건" }] };
  assert.deepEqual(parseExportDocument(document), document);
  for (const bad of [null, { ...document, metrics: { ...metrics, at: "x" } }, { ...document, metrics: { ...metrics, pins: -1 } },
    { ...document, metrics: { ...metrics, audience: "4" } }, { ...document, sections: [{ id: "a", title: "t", text: "x".repeat(20_001) }] }])
    assert.throws(() => parseExportDocument(bad), /INVALID_DOCUMENT/);
});

test("the chart SVG escapes labels and stays one polyline for hundreds of slides (RPT-037)", () => {
  const { svg } = chartSvg([{ label: "<script>", value: 1 }], "bar", "a\"b");
  assert.ok(!svg.includes("<script>") && svg.includes("&#60;script&#62;") && svg.includes('aria-label="a&#34;b"'));
  // 300 slides: one polyline, no per-point dots, at most ~10 axis labels.
  const many = chartSvg(Array.from({ length: 300 }, (_, i) => ({ label: `P.${i + 1}`, value: i % 7 })), "line", "흐름").svg;
  assert.equal(many.match(/<polyline/g)?.length, 1);
  assert.equal(many.match(/<circle/g)?.length, 1, "only the peak is marked");
  assert.ok((many.match(/>P\.\d+</g)?.length ?? 0) <= 11);
});

test("a section chart is a line or bar of labelled, non-negative numbers", () => {
  const stored = draftReport({ title: "t", metrics, analysis: null, questions: [] });
  const chart = { kind: "line", points: [{ label: "P.1", value: 2 }] }, base = { title: "t", sections: [{ id: "a", title: "t", text: "x", chart }] };
  assert.deepEqual(parseReportDocument(base, stored).sections[0].chart, chart);
  for (const bad of [{ ...chart, kind: "pie" }, { ...chart, points: [{ label: "P.1", value: -1 }] }, { ...chart, points: [{ label: 3, value: 1 }] }, "line",
    { ...chart, points: Array.from({ length: 601 }, () => ({ label: "x", value: 0 })) }])
    assert.throws(() => parseReportDocument({ ...base, sections: [{ ...base.sections[0], chart: bad }] }, stored), /INVALID_DOCUMENT/);
});
