import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { containIn, exportReport, previewReportExport, slidePages } from "./report-export.ts";
import type { ReportDocument } from "../_model/report.ts";

const long = "광합성은 햇빛과 물을 이용하는 과정입니다. ".repeat(8).trim();
const document: ReportDocument = { title: "생물학 1강",
  metrics: { at: "2026-10-23T03:00:00Z", slides: 3, questions: 4, pins: 2, reactions: 7, durationMinutes: 50, audience: null, peakAudience: null },
  sections: [
    { id: "a", title: "강의 개요", text: "슬라이드 3장, 질문 4개\n참여자 기록 없음" },
    { id: "b", title: "슬라이드 3 · 광합성", text: `${long}\n\n- 엽록체는 어디에 있나요? (공감 2 · 미답변)\n  답변: 잎의 세포 안에 있습니다.`, slide: 3 },
    { id: "c", title: "빈 섹션", text: "" },
  ] };
const context = { fileName: "bio.pdf", images: [] };
const lines = document.sections.flatMap((section) => [section.title, ...section.text.split("\n").filter(Boolean)]);
const zipText = async (bytes: Buffer, pattern: RegExp) => {
  const zip = await JSZip.loadAsync(bytes), names = Object.keys(zip.files).filter((name) => pattern.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return (await Promise.all(names.map((name) => zip.file(name)!.async("string")))).join("\n").replace(/<[^>]+>/g, "");
};

test("markdown: title, sections in order with slide references, every line kept; no metrics table", async () => {
  const md = (await exportReport(document, "md", context)).bytes.toString();
  assert.ok(md.startsWith("# 생물학 1강\n\nbio.pdf · 2026년 10월 23일\n\n## 강의 개요"));
  assert.ok(md.includes("## 슬라이드 3 · 광합성\n\n슬라이드 3\n\n광합성"));
  assert.ok(md.indexOf("## 강의 개요") < md.indexOf("## 슬라이드 3") && md.indexOf("## 슬라이드 3") < md.indexOf("## 빈 섹션"));
  assert.doesNotMatch(md, /## 강의 개요\n\n슬라이드 \d+\n/, "a section without a slide gets no reference line");
  assert.ok(md.includes("슬라이드 3장, 질문 4개  \n참여자 기록 없음"), "single newlines become hard breaks");
  for (const line of lines) assert.ok(md.includes(line), line);
  assert.equal((await exportReport(document, "md", context)).bytes.toString(), md, "same document, same file");
  await assert.rejects(exportReport(document, "xls", context), /INVALID_EXPORT_FORMAT/);
});

test("no format prints the metrics table (2026-11-04)", async () => {
  const bare = context;
  const md = (await exportReport(document, "md", bare)).bytes.toString();
  const docx = await zipText((await exportReport(document, "docx", bare)).bytes, /^word\/document\.xml$/);
  const pptx = await zipText((await exportReport(document, "pptx", bare)).bytes, /^ppt\/slides\/slide\d+\.xml$/);
  assert.ok(md.startsWith("# 생물학 1강\n\nbio.pdf · 2026년 10월 23일\n\n## 강의 개요"));
  for (const text of [md, docx, pptx]) assert.doesNotMatch(text, /강의 시간|최대 동시 참여자|수치/);
  assert.ok((await PDFDocument.load((await exportReport(document, "pdf", bare)).bytes)).getPageCount() >= 1);
});

test("chart sections embed their graph in docx and pptx; markdown keeps only the text (RPT-037)", async () => {
  const charted: ReportDocument = { ...document, sections: [{ id: "f", title: "흐름", text: "P.2에 가장 많았어요.", chart: { kind: "line", points: [{ label: "P.1", value: 2 }, { label: "P.2", value: 5 }] } }] };
  const media = async (bytes: Buffer, folder: string) => Object.keys((await JSZip.loadAsync(bytes)).files).filter((name) => name.startsWith(folder) && !name.endsWith("/"));
  assert.equal((await media((await exportReport(charted, "docx", context)).bytes, "word/media/")).length, 1);
  assert.equal((await media((await exportReport(charted, "pptx", context)).bytes, "ppt/media/")).length, 1);
  assert.equal((await media((await exportReport(document, "pptx", context)).bytes, "ppt/media/")).length, 0);
  assert.ok((await exportReport(charted, "md", context)).bytes.toString().includes("## 흐름\n\nP.2에 가장 많았어요."));
  assert.ok((await PDFDocument.load((await exportReport(charted, "pdf", context)).bytes)).getPageCount() >= 1);
});

test("docx and pptx carry every section line", async () => {
  const docx = await zipText((await exportReport(document, "docx", context)).bytes, /^word\/document\.xml$/);
  const pptx = await zipText((await exportReport(document, "pptx", context)).bytes, /^ppt\/slides\/slide\d+\.xml$/);
  for (const text of [docx, pptx]) {
    for (const line of lines) assert.ok(text.includes(line.replace(/^\s+/, "")), line);
  }
});

test("pptx paging breaks between lines, marks continued slides, and never drops text", async () => {
  assert.deepEqual(slidePages("짧은 본문", 20, 5), ["짧은 본문"]);
  assert.deepEqual(slidePages("", 20, 5), [""]);
  const many = Array.from({ length: 12 }, (_, index) => `줄 ${index + 1}`);
  const pages = slidePages(many.join("\n"), 20, 5);
  assert.deepEqual(pages.map((page) => page.split("\n").length), [5, 5, 2]);
  assert.deepEqual(pages.join("\n").split("\n"), many);
  // A wrapped line counts as several rows and moves whole to the next page.
  assert.deepEqual(slidePages(["가".repeat(10), "나".repeat(25)].join("\n"), 10, 3), ["가".repeat(10), "나".repeat(25)]);
  // Blank lines never open a continued page.
  assert.deepEqual(slidePages("가\n나\n\n다", 10, 2), ["가\n나", "다"]);
  // Only a line taller than a whole page is cut inside it.
  const huge = "가".repeat(65), cut = slidePages(huge, 10, 3);
  assert.deepEqual(cut.map((page) => page.length), [30, 30, 5]);
  assert.equal(cut.join(""), huge);
  const tall: ReportDocument = { ...document, sections: [{ id: "t", title: "긴 섹션", text: Array.from({ length: 60 }, (_, index) => `문단 ${index}`).join("\n") }] };
  const pptx = await zipText((await exportReport(tall, "pptx", context)).bytes, /^ppt\/slides\/slide\d+\.xml$/);
  assert.ok(pptx.includes("긴 섹션 (계속)"));
  for (let index = 0; index < 60; index++) assert.ok(pptx.includes(`문단 ${index}`), `문단 ${index}`);
});

test("PDF and Markdown previews carry the exact native download bytes", async () => {
  for (const format of ["pdf", "md"]) {
    const result = await exportReport(document, format, context);
    const form = await previewReportExport(result, format, "");
    const wire = await new Response(form).formData(), file = wire.get("file") as File;
    assert.equal(file.name, `report.${format}`);
    assert.equal(file.type, result.mime);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), result.bytes);
    assert.equal(wire.get("preview"), null);
  }
  assert.deepEqual((await exportReport(document, "pdf", context)).bytes, (await exportReport(document, "pdf", context)).bytes, "same document, same PDF");
  const stop = new AbortController(); stop.abort();
  await assert.rejects(previewReportExport({ bytes: Buffer.from("test"), mime: "text/plain" }, "md", "", stop.signal), { name: "AbortError" });
});

test("Office previews render each actual native file with its own page geometry", { skip: process.env.INSIGHT_EXPORT_SMOKE !== "1" }, async () => {
  const { register } = await import("node:module"), { pathToFileURL } = await import("node:url");
  const { PDFDocument } = await import("pdf-lib");
  const marker = pathToFileURL(join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")).href;
  register("data:text/javascript," + encodeURIComponent(`export function resolve(specifier, context, next) { return next(specifier === "server-only" ? ${JSON.stringify(marker)} : specifier, context); }`), import.meta.url);
  for (const format of ["pptx", "docx"]) {
    const directory = await mkdtemp(join(tmpdir(), "report-preview-test-"));
    try {
      const result = await exportReport(document, format, context);
      const form = await previewReportExport(result, format, directory);
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

test("binary exports embed the section's slide image and preserve Korean text within PDF page bounds", { skip: process.env.INSIGHT_EXPORT_SMOKE !== "1" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "report-export-test-"));
  try {
    const image = join(directory, "slide-3.jpg");
    await sharp({ create: { width: 800, height: 450, channels: 3, background: "#0f62fe" } }).jpeg().toFile(image);
    for (const format of ["pdf", "pptx", "docx"]) {
      const result = await exportReport(document, format, { ...context, images: [{ page: 3, width: 800, height: 450, file: image }] });
      const path = join(directory, `report.${format}`); await writeFile(path, result.bytes);
      if (format !== "pdf") {
        execFileSync("unzip", ["-t", path], { stdio: "pipe" });
        assert.match(execFileSync("unzip", ["-l", path], { encoding: "utf8" }), /media\/.+\.(jpe?g)/i, `${format} must embed the slide image`);
      } else {
        assert.match(execFileSync("pdfimages", ["-list", path], { encoding: "utf8" }), /jpeg/, "pdf must embed the slide image");
        const plain = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" }).replace(/\s/g, "")
          .replace(/OhPin리포트·생물학1강\d+\/\d+/g, ""); // page footers interleave with a section that crosses a page
        for (const line of [...lines, "기록 없음"]) assert.ok(plain.includes(line.replace(/\s/g, "")), `pdf text: ${line}`);
        for (const match of execFileSync("pdftotext", ["-bbox", path, "-"], { encoding: "utf8" }).matchAll(/<word[^>]+xMax="([\d.]+)"/g)) assert.ok(Number(match[1]) <= 555.5, `text past the 40pt margin: ${match[1]}`);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("decomposed (NFD) Korean from macOS file names exports composed", async () => {
  const title = "대학원 논문4".normalize("NFD");
  const { bytes } = await exportReport({ title, metrics: { at: "2026-10-27T00:00:00Z", slides: 1, questions: 0, pins: 0,
    reactions: 0, durationMinutes: null, audience: null, peakAudience: null }, sections: [] }, "md", { fileName: `${title}.pdf`, images: [] });
  assert.match(bytes.toString("utf8"), /^# 대학원 논문4\n\n대학원 논문4\.pdf/);
});

test("formatted text and AI tables reach every format; pptx tables split between rows and repeat the header", async () => {
  const table = ["| 슬라이드 | 질문 |", "| --- | --- |", ...Array.from({ length: 30 }, (_, index) => `| ${index + 1}번 | **질문${index + 1}** |`)];
  const styled: ReportDocument = { ...document, sections: [{ id: "s", title: "서식", text: ["보통 <big>**큰굵은글**</big> 그리고 <small>작은글</small>", ...table, "표 뒤 문장"].join("\n") }] };
  const md = (await exportReport(styled, "md", context)).bytes.toString();
  assert.ok(md.includes("보통 **큰굵은글** 그리고 작은글\n\n| 슬라이드 | 질문 |\n| --- | --- |\n| 1번 | **질문1** |"), "size tags go, bold and the table stay, blank lines around the table");
  assert.ok(md.includes("| 30번 | **질문30** |\n\n표 뒤 문장"));
  const docx = await zipText((await exportReport(styled, "docx", context)).bytes, /^word\/document\.xml$/);
  const pptx = await zipText((await exportReport(styled, "pptx", context)).bytes, /^ppt\/slides\/slide\d+\.xml$/);
  for (const text of [docx, pptx]) {
    assert.doesNotMatch(text, /\*\*|<big>|&lt;big&gt;|\| --- \|/, "no raw markup in Office files");
    for (const word of ["큰굵은글", "작은글", "슬라이드", "질문30", "표 뒤 문장"]) assert.ok(text.includes(word), word);
  }
  const raw = (await JSZip.loadAsync((await exportReport(styled, "docx", context)).bytes)).file("word/document.xml")!.async("string");
  assert.match(await raw, /<w:tblHeader\/>/, "docx header row repeats across pages");

  const pages = slidePages(table.join("\n"), 40, 12);
  assert.ok(pages.length > 1);
  for (const page of pages) assert.ok(page.startsWith(table.slice(0, 2).join("\n")), "every page starts with the header row and rule");
  assert.deepEqual(pages.flatMap((page) => page.split("\n").slice(2)), table.slice(2), "every body row once, in order");
  assert.ok(pages.every((page) => page.split("\n").length - 1 <= 12), "header + rows fit the page");
  // A long styled line is cut inside but keeps each piece's style.
  const [first, second] = slidePages(`<big>**${"가".repeat(30)}**</big>`, 10, 2);
  assert.match(first, /^<big>\*\*가+\*\*<\/big>$/); assert.match(second, /^<big>\*\*가+\*\*<\/big>$/);
});

test("italic, underline and links reach every format as real styles and hyperlinks (RPT-024)", async () => {
  const styled: ReportDocument = { ...document, sections: [{ id: "s", title: "서식", text: "<i>기울임</i> <u>밑줄</u> [**자료 링크**](https://ohpin.kr/r?a=1&b=2)" }] };
  const md = (await exportReport(styled, "md", context)).bytes.toString();
  assert.ok(md.includes("*기울임* 밑줄 [**자료 링크**](https://ohpin.kr/r?a=1&b=2)"), "italic becomes *, underline tags go, the link stays");
  const docx = await (await JSZip.loadAsync((await exportReport(styled, "docx", context)).bytes)).file("word/document.xml")!.async("string");
  assert.match(docx, /<w:i\/>/); assert.match(docx, /<w:u w:val="single"\/>/); assert.match(docx, /<w:hyperlink /);
  const pptx = await JSZip.loadAsync((await exportReport(styled, "pptx", context)).bytes);
  const slideXml = (await Promise.all(Object.keys(pptx.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map((name) => pptx.file(name)!.async("string")))).join("");
  assert.match(slideXml, / i="1"/); assert.match(slideXml, / u="sng"/); assert.match(slideXml, /<a:hlinkClick /);
  const pdf = await PDFDocument.load((await exportReport(styled, "pdf", context)).bytes);
  const annots = pdf.getPages().flatMap((page) => page.node.Annots()?.asArray() ?? []).map((ref) => String(pdf.context.lookup(ref)));
  assert.ok(annots.some((annot) => annot.includes("/URI (https://ohpin.kr/r?a=1&b=2)")), "pdf carries a clickable link annotation");
  for (const text of [md, docx, slideXml]) assert.doesNotMatch(text, /&lt;i&gt;|&lt;u&gt;|<i>|<u>/, "no raw markup");
});

test("pptx pictures keep their aspect ratio inside the box", async () => {
  assert.deepEqual(containIn({ width: 1920, height: 1080 }, 6.6, 4.75), { w: 6.6, h: 6.6 * 1080 / 1920 });
  assert.deepEqual(containIn({ width: 640, height: 1280 }, 6.6, 4.75), { w: 4.75 / 2, h: 4.75 });
  // A wide chart in the real file: its picture's ext keeps 640:240 (EMU), not the 6.6 x 4.75 box.
  const charted: ReportDocument = { ...document, sections: [{ id: "f", title: "흐름", text: "요약", chart: { kind: "line", points: [{ label: "P.1", value: 2 }, { label: "P.2", value: 5 }] } }] };
  const zip = await JSZip.loadAsync((await exportReport(charted, "pptx", context)).bytes);
  const xml = (await Promise.all(Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map((name) => zip.file(name)!.async("string")))).join("");
  const pic = /<p:pic>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"/.exec(xml)!;
  assert.ok(Math.abs(Number(pic[1]) / Number(pic[2]) - 640 / 240) < .01, `${pic[1]}x${pic[2]}`);
  // Without text the graph gets the full slide width (RPT-037), still at 640:240.
  const bare = await JSZip.loadAsync((await exportReport({ ...charted, sections: [{ ...charted.sections[0], text: "" }] }, "pptx", context)).bytes);
  const bareXml = (await Promise.all(Object.keys(bare.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map((name) => bare.file(name)!.async("string")))).join("");
  const wide = /<p:pic>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"/.exec(bareXml)!;
  assert.ok(Number(wide[1]) > Number(pic[1]) * 1.5 && Math.abs(Number(wide[1]) / Number(wide[2]) - 640 / 240) < .01);
});
