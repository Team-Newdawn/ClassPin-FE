import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { exportInsight, insightExportSections } from "./insight-export.ts";
import type { InsightReportBody } from "../_model/insight-report.ts";

const text = "광합성은 햇빛과 물을 이용하는 과정입니다. ".repeat(8).trim();
const body: InsightReportBody = { schemaVersion: 2, model: "test",
  slides: [{ page: 1, topic: "광합성 소개", questionSummary: text, suggestion: "예시를 추가", metrics: { questions: 1, positioned: 1, unanswered: 1, answered: 0, resolved: 0, reactions: 2, answers: 0 } }],
  questions: [{ id: "Q1", page: 1, text: "엽록체는 어디에 있나요?", answers: [], reactions: 2, status: "unanswered" }],
  overall: { summary: "전체 요약", hotspots: [{ page: 1, reason: "질문 집중" }], suggestions: ["도입부 보강"] },
  groups: [{ title: "구조 질문", summary: "", questionIds: ["Q1", "MISSING"] }] };

test("sections keep code metrics, skip unknown question references, and markdown contains every line", async () => {
  const sections = insightExportSections(body);
  assert.equal(sections[0].lines[1], "슬라이드 1: 질문 집중");
  assert.deepEqual(sections[1].lines, ["구조 질문", "  · (슬라이드 1) 엽록체는 어디에 있나요?"]);
  assert.ok(sections[2].lines[0].startsWith("질문 1 · 미답변 1"));
  const md = (await exportInsight(body, "md")).bytes.toString();
  for (const section of sections) for (const line of section.lines) assert.ok(md.includes(line), line);
  await assert.rejects(exportInsight(body, "xls"), /INVALID_EXPORT_FORMAT/);
});

test("binary exports preserve Korean text within PDF page bounds", { skip: process.env.INSIGHT_EXPORT_SMOKE !== "1" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "insight-export-test-"));
  try {
    for (const format of ["pdf", "pptx", "docx"]) {
      const result = await exportInsight(body, format);
      const path = join(directory, `report.${format}`); await writeFile(path, result.bytes);
      if (format !== "pdf") execFileSync("unzip", ["-t", path], { stdio: "pipe" });
      else {
        const plain = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
        assert.ok(plain.replace(/\s/g, "").includes(text.replace(/\s/g, "")), "Korean text must survive embedding");
        for (const match of execFileSync("pdftotext", ["-bbox", path, "-"], { encoding: "utf8" }).matchAll(/<word[^>]+xMax="([\d.]+)"/g)) assert.ok(Number(match[1]) <= 550);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
