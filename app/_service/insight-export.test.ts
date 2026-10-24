import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { exportInsight, insightExportSections, previewInsightExport } from "./insight-export.ts";
import type { InsightReportBody } from "../_model/insight-report.ts";

const text = "광합성은 햇빛과 물을 이용하는 과정입니다. ".repeat(8).trim();
const body: InsightReportBody = { schemaVersion: 2, model: "test",
  slides: [{ page: 1, topic: "광합성 소개", questionSummary: text, suggestion: "예시를 추가", metrics: { questions: 1, positioned: 1, unanswered: 1, answered: 0, resolved: 0, reactions: 2, answers: 0 } }],
  questions: [{ id: "Q1", page: 1, text: "엽록체는 어디에 있나요?", answers: [], reactions: 2, status: "unanswered" }],
  overall: { summary: "전체 요약", hotspots: [{ page: 1, reason: "질문 집중" }], suggestions: ["도입부 보강"] },
  groups: [{ title: "구조 질문", summary: "", questionIds: ["Q1", "MISSING"] }] };

const context = { title: "생물학 1강", fileName: "bio.pdf", date: "2026-10-23T03:00:00Z", images: [] };

test("sections keep code metrics and per-slide questions, drop the question-group list, and markdown contains every line", async () => {
  const sections = insightExportSections(body);
  assert.equal(sections[0].lines[1], "슬라이드 1: 질문 집중");
  assert.equal(sections.length, 2);
  assert.ok(sections[1].lines[0].startsWith("질문 1 · 미답변 1"));
  assert.ok(sections[1].lines.includes("질문: 엽록체는 어디에 있나요?"));
  const md = (await exportInsight(body, "md", context)).bytes.toString();
  assert.ok(md.startsWith("# 생물학 1강 인사이트 리포트"));
  assert.ok(!md.includes("구조 질문"));
  for (const section of sections) for (const line of section.lines) assert.ok(md.includes(line), line);
  await assert.rejects(exportInsight(body, "xls", context), /INVALID_EXPORT_FORMAT/);
});

test("PDF and Markdown previews carry the exact native download bytes", async () => {
  for (const format of ["pdf", "md"]) {
    const result = await exportInsight(body, format, context);
    const form = await previewInsightExport(result, format, "");
    const wire = await new Response(form).formData(), file = wire.get("file") as File;
    assert.equal(file.name, `insight.${format}`);
    assert.equal(file.type, result.mime);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), result.bytes);
    assert.equal(wire.get("preview"), null);
  }
  const stop = new AbortController(); stop.abort();
  await assert.rejects(previewInsightExport({ bytes: Buffer.from("test"), mime: "text/plain" }, "md", "", stop.signal), { name: "AbortError" });
});

test("Office previews render each actual native file with its own page geometry", { skip: process.env.INSIGHT_EXPORT_SMOKE !== "1" }, async () => {
  const { register } = await import("node:module"), { pathToFileURL } = await import("node:url");
  const { PDFDocument } = await import("pdf-lib");
  const marker = pathToFileURL(join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")).href;
  register("data:text/javascript," + encodeURIComponent(`export function resolve(specifier, context, next) { return next(specifier === "server-only" ? ${JSON.stringify(marker)} : specifier, context); }`), import.meta.url);
  for (const format of ["pptx", "docx"]) {
    const directory = await mkdtemp(join(tmpdir(), "insight-preview-test-"));
    try {
      const result = await exportInsight(body, format, context);
      const form = await previewInsightExport(result, format, directory);
      const wire = await new Response(form).formData(), file = wire.get("file") as File, preview = wire.get("preview") as File;
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), result.bytes);
      assert.equal(preview.type, "application/pdf");
      await writeFile(join(directory, "preview.pdf"), Buffer.from(await preview.arrayBuffer()));
      assert.match(execFileSync("pdffonts", [join(directory, "preview.pdf")]).toString(), /NanumGothic/, `${format} preview must render Hangul with the bundled font`);
      const pdf = await PDFDocument.load(await preview.arrayBuffer());
      assert.ok(pdf.getPageCount() > 0);
      const first = pdf.getPage(0), ratio = first.getWidth() / first.getHeight();
      assert.ok(format === "pptx" ? Math.abs(ratio - 16 / 9) < .01 : ratio < 1, `${format} preview must use its native page geometry`);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test("binary exports embed the slide image and preserve Korean text within PDF page bounds", { skip: process.env.INSIGHT_EXPORT_SMOKE !== "1" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "insight-export-test-"));
  try {
    const image = join(directory, "slide-1.jpg");
    await sharp({ create: { width: 800, height: 450, channels: 3, background: "#0f62fe" } }).jpeg().toFile(image);
    for (const format of ["pdf", "pptx", "docx"]) {
      const result = await exportInsight(body, format, { ...context, images: [{ page: 1, width: 800, height: 450, file: image }] });
      const path = join(directory, `report.${format}`); await writeFile(path, result.bytes);
      if (format !== "pdf") {
        execFileSync("unzip", ["-t", path], { stdio: "pipe" });
        assert.match(execFileSync("unzip", ["-l", path], { encoding: "utf8" }), /media\/.+\.(jpe?g)/i, `${format} must embed the slide image`);
      } else {
        assert.match(execFileSync("pdfimages", ["-list", path], { encoding: "utf8" }), /jpeg/, "pdf must embed the slide image");
        const plain = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
        assert.ok(plain.replace(/\s/g, "").includes(text.replace(/\s/g, "")), "Korean text must survive embedding");
        for (const match of execFileSync("pdftotext", ["-bbox", path, "-"], { encoding: "utf8" }).matchAll(/<word[^>]+xMax="([\d.]+)"/g)) assert.ok(Number(match[1]) <= 555.5, `text past the 40pt margin: ${match[1]}`);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
