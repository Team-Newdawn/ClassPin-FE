import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFHexString, decodePDFRawStream } from "pdf-lib";
import { exportReport, previewReportExport } from "./report-export.ts";
import type { ReportDocument } from "../_model/report.ts";
import type { ReportPinSource } from "./report-pin-package.ts";

const source: ReportPinSource = {
  id: "material", versionId: "version-2", version: 2, lectureId: "lecture",
  slides: [0, 1, 2].map((pageIndex) => ({ id: `slide-${pageIndex + 1}`, pageIndex, sourcePageIndex: pageIndex, imagePath: "PRIVATE_STORAGE_PATH" })),
  questions: [
    { kind: "point", x: 0.755725190839695, y: 0.47045518801244 },
    { kind: "box", x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    { kind: "path", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, null,
  ].map((anchor, index) => ({ id: `question-${index}`, slideId: "slide-1", anchor: anchor as ReportPinSource["questions"][number]["anchor"],
    text: `  ${"질문".normalize("NFD")} ${index}\n원문!  `, category: "question", status: "answered", reactions: index,
    createdAt: "2026-11-05T01:00:00Z", answers: [{ body: " 답변 원문\n ", createdAt: "2026-11-05T02:00:00Z" }] })),
};
const document: ReportDocument = {
  title: "PIN 첨부 회귀", metrics: { at: "2026-11-05T03:00:00Z", slides: 3, questions: 5, pins: 3,
    reactions: 6, durationMinutes: null, audience: null, peakAudience: null },
  sections: [
    { id: "overview", title: "기존 요약", text: "요약 본문은 그대로 유지한다." },
    { id: "first", title: "첫 슬라이드 설명", text: "분석 본문", slide: 1 },
    { id: "repeat", title: "같은 슬라이드 재참조", text: "후속 설명", slide: 1 },
    { id: "chart", title: "차트", text: "차트는 원본 슬라이드가 아니다.", slide: 2,
      chart: { kind: "line", points: [{ label: "P.1", value: 3 }, { label: "P.2", value: 1 }] } },
  ],
};

async function attachment(bytes: Buffer) {
  const pdf = await PDFDocument.load(bytes);
  const names = pdf.catalog.lookup(PDFName.of("Names"), PDFDict).lookup(PDFName.of("EmbeddedFiles"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
  assert.equal(names.size(), 2, "exactly one standard PDF attachment");
  assert.equal(names.lookup(0, PDFHexString).decodeText(), "ohpin-data.zip");
  const stream = names.lookup(1, PDFDict).lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F")) as PDFRawStream;
  return { pdf, zip: await JSZip.loadAsync(decodePDFRawStream(stream).decode(), { checkCRC32: true }) };
}

test("Office exports retain PIN data, package relationships and a single final white guide", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ohpin-office-test-"));
  try {
    const file = join(dir, "slide.jpg");
    await sharp({ create: { width: 800, height: 450, channels: 3, background: "#ddeeff" } }).jpeg().toFile(file);
    const images = [{ page: 1, width: 800, height: 450, file }];
    for (const format of ["docx", "pptx"]) {
      const result = await exportReport(document, format, { fileName: "source.pdf", images, pinSource: source });
      const outer = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
      const plain = await JSZip.loadAsync((await exportReport(document, format, { fileName: "source.pdf", images })).bytes);
      assert.equal(plain.file("ohpin/ohpin-data.zip"), null);
      assert.match(await outer.file("_rels/.rels")!.async("string"), /Id="rIdOhPinData" Type="urn:ohpin:relationships:pin-data" Target="ohpin\/ohpin-data.zip"/);
      assert.match(await outer.file("[Content_Types].xml")!.async("string"), /PartName="\/ohpin\/ohpin-data.zip" ContentType="application\/zip"/);
      const zip = await JSZip.loadAsync(await outer.file("ohpin/ohpin-data.zip")!.async("nodebuffer"), { checkCRC32: true });
      const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
      const pins = JSON.parse(await zip.file("pins.json")!.async("string"));
      assert.equal(manifest.format, `ohpin-${format}-package`);
      assert.deepEqual(manifest.scope.includedSlideNumbers, [1]);
      assert.deepEqual(manifest.scope.omittedSlideNumbers, [2]);
      assert.deepEqual(pins.questions.map((q: { anchor: unknown }) => q.anchor), source.questions.map((q) => q.anchor));
      assert.deepEqual(pins.questions.map((q: { question: string }) => q.question), source.questions.map((q) => q.text));
      assert.deepEqual(pins.questions.map((q: { answers: unknown }) => q.answers), source.questions.map((q) => q.answers));
      for (const entry of manifest.files) {
        const bytes = await zip.file(entry.path)!.async("nodebuffer");
        assert.equal(bytes.length, entry.bytes);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
      }
      assert.doesNotMatch(await zip.file("pins.json")!.async("string"), /PRIVATE_STORAGE_PATH/);
      const paths = format === "docx" ? ["word/document.xml"] : Object.keys(outer.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
      if (format === "docx") {
        assert.equal(manifest.report.pages, null);
        assert.equal(manifest.placementCoordinateSystem, null);
        assert.deepEqual(manifest.slides[0].placements, [
          { sectionId: "first", reportPage: null, rect: null, imageIndex: 1 },
          { sectionId: "repeat", reportPage: null, rect: null, imageIndex: 2 },
        ]);
      } else {
        assert.equal(manifest.report.pages, paths.length);
        assert.deepEqual(manifest.slides[0].placements.map((p: { reportPage: number }) => p.reportPage), [3, 4]);
        for (const placement of manifest.slides[0].placements) {
          const xml = await outer.file(paths[placement.reportPage - 1])!.async("string");
          const pic = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/)![0];
          const off = pic.match(/<a:off x="(\d+)" y="(\d+)"/)!, ext = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"/)!;
          for (const [actual, expected] of [[off[1], placement.rect.x], [off[2], placement.rect.y], [ext[1], placement.rect.width], [ext[2], placement.rect.height]]) {
            assert.ok(Math.abs(Number(actual) - Number(expected) * 12700) <= 1);
          }
        }
      }
      for (const [index, path] of paths.entries()) {
        const xml = await outer.file(path)!.async("string"), before = await plain.file(path)!.async("string");
        if (index < paths.length - 1) { assert.equal(xml, before); continue; }
        assert.equal(xml.split("ohpin-data.zip").length - 1, 1);
        assert.ok(xml.includes("PIN 위치에 관한 질문에는 pins.json과 manifest.json을 확인하십시오."));
        assert.ok(xml.includes("첨부를 읽을 수 없다면 위치를 추정하지 말고"));
        const blocks = [...xml.matchAll(format === "docx" ? /<w:p[ >][\s\S]*?<\/w:p>/g : /<p:sp>[\s\S]*?<\/p:sp>/g)];
        const guide = blocks.find(([block]) => block.includes("ohpin-data.zip"))![0];
        assert.match(guide, format === "docx" ? /w:color w:val="FFFFFF"/ : /a:srgbClr val="FFFFFF"/);
        const originalSpacer = format === "docx" ? [...before.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].at(-1)![0] : "";
        // docx allocates drawing IDs globally across exports; they do not change the document content.
        const normalize = (value: string) => value.replace(/<wp:docPr id="\d+"/g, '<wp:docPr id="0"')
          .replace(/descr="[^"]*report-chart-[^"]*"/g, 'descr="chart"');
        const spacerAt = before.lastIndexOf(originalSpacer);
        const baseline = originalSpacer ? before.slice(0, spacerAt) + before.slice(spacerAt + originalSpacer.length) : before;
        assert.equal(normalize(xml.replace(guide, "")), normalize(baseline));
      }
      const empty = await JSZip.loadAsync((await exportReport(document, format, { fileName: "source.pdf", images: [], pinSource: source })).bytes);
      const emptyPins = await JSZip.loadAsync(await empty.file("ohpin/ohpin-data.zip")!.async("nodebuffer"));
      assert.deepEqual(JSON.parse(await emptyPins.file("pins.json")!.async("string")).questions, []);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("PDF PIN attachment preserves raw data, layout and page mapping without leaking unrelated source fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ohpin-package-test-"));
  try {
    const image = join(dir, "slide.jpg");
    await sharp({ create: { width: 800, height: 450, channels: 3, background: "#ddeeff" } }).jpeg().toFile(image);
    const images = [1, 2].map((page) => ({ page, width: 800, height: 450, file: image }));
    const pinSource = { ...source, speakerNote: "PRIVATE_SPEAKER_NOTE", ownerId: "PRIVATE_OWNER_ID",
      sourcePath: "PRIVATE_SOURCE_PATH", questions: [...source.questions.map((q) => ({ ...q, authorId: "PRIVATE_AUTHOR_ID" })),
        { ...source.questions[0], id: "unrelated", slideId: "slide-3", text: "UNRELATED_QUESTION" }] };
    const result = await exportReport(document, "pdf", { fileName: "source.pdf", images, pinSource });
    const { pdf, zip } = await attachment(result.bytes);
    const direct = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
    assert.deepEqual(Object.keys(direct.files), Object.keys(zip.files));
    for (const name of Object.keys(zip.files)) assert.deepEqual(await direct.file(name)!.async("nodebuffer"), await zip.file(name)!.async("nodebuffer"));
    assert.deepEqual(Object.keys(zip.files).sort(), ["README.md", "manifest.json", "pins.json", "slides/slide-001.jpg"]);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    const pins = JSON.parse(await zip.file("pins.json")!.async("string"));
    assert.equal(manifest.material.version, "version-2");
    assert.equal(manifest.sourceSnapshot, "export-time");
    assert.deepEqual(manifest.scope.includedSlideNumbers, [1]);
    assert.deepEqual(manifest.scope.omittedSlideNumbers, [2]);
    assert.equal(manifest.scope.includedQuestionCount, 4);
    assert.equal(manifest.report.pages, pdf.getPageCount());
    assert.equal(manifest.slides[0].id, "slide-1");
    const placements = manifest.slides[0].placements;
    assert.deepEqual(placements.map((p: { sectionId: string }) => p.sectionId), ["first", "repeat"]);
    assert.ok(placements[0].reportPage < placements[1].reportPage, "page break is reflected in attachment");
    for (const place of placements) {
      const page = pdf.getPage(place.reportPage - 1), rect = place.rect;
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= page.getWidth() && rect.y + rect.height <= page.getHeight());
      assert.equal(rect.width / rect.height, 800 / 450);
      const content = page.node.Contents() as PDFArray;
      const commands = Array.from({ length: content.size() }, (_, i) => Buffer.from(decodePDFRawStream(content.lookup(i) as PDFRawStream).decode()).toString()).join("\n");
      assert.ok(commands.includes(`1 0 0 1 ${rect.x} ${page.getHeight() - rect.y - rect.height} cm`), "recorded position matches PDF drawing command");
    }
    assert.deepEqual(pins.questions.map((q: { anchor: unknown }) => q.anchor), source.questions.map((q) => q.anchor));
    assert.deepEqual(pins.questions.map((q: { question: string }) => q.question), source.questions.map((q) => q.text));
    assert.deepEqual(pins.questions.map((q: { answers: unknown }) => q.answers), source.questions.map((q) => q.answers));
    assert.deepEqual(await zip.file("slides/slide-001.jpg")!.async("nodebuffer"), await readFile(image));
    for (const file of manifest.files) {
      const bytes = await zip.file(file.path)!.async("nodebuffer");
      assert.equal(bytes.length, file.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    }
    for (const name of ["manifest.json", "pins.json", "README.md"]) assert.doesNotMatch(await zip.file(name)!.async("string"), /PRIVATE_|UNRELATED_QUESTION/);
    const plain = await PDFDocument.load((await exportReport(document, "pdf", { fileName: "source.pdf", images })).bytes);
    assert.equal(pdf.getPageCount(), plain.getPageCount());
    pdf.getPages().forEach((page, index) => {
      const contents = page.node.Contents() as PDFArray, before = plain.getPage(index).node.Contents() as PDFArray;
      assert.equal(contents.size(), before.size());
      for (let i = 0; i < contents.size(); i++) {
        const actual = Buffer.from(decodePDFRawStream(contents.lookup(i) as PDFRawStream).decode()).toString();
        const original = Buffer.from(decodePDFRawStream(before.lookup(i) as PDFRawStream).decode()).toString();
        if (index === pdf.getPageCount() - 1 && i === contents.size() - 1) {
          assert.ok(actual.startsWith(original), "existing page drawing commands stay unchanged");
          assert.match(actual.slice(original.length), /1 1 1 rg/, "instruction text is white");
        } else assert.equal(actual, original);
      }
      assert.equal(page.node.Annots()?.size() ?? 0, plain.getPage(index).node.Annots()?.size() ?? 0);
    });
    const output = join(dir, "report.pdf");
    await writeFile(output, result.bytes);
    const texts = execFileSync("pdftotext", [output, "-"], { encoding: "utf8" }).split("\f").slice(0, -1);
    assert.equal(texts.length, pdf.getPageCount());
    assert.ok(texts.slice(0, -1).every((text) => !text.includes("ohpin-data.zip")));
    const lastText = texts.at(-1)!.replace(/\s/g, "");
    assert.equal(lastText.split("ohpin-data.zip").length - 1, 1);
    assert.ok(lastText.includes("PIN위치에관한질문에는pins.json과manifest.json을확인하십시오."));
    assert.ok(lastText.includes("첨부를읽을수없다면위치를추정하지말고,첨부데이터에접근하지못했다고설명하십시오."));
    assert.deepEqual(result.bytes, (await exportReport(document, "pdf", { fileName: "source.pdf", images, pinSource })).bytes);
    const preview = await previewReportExport(result, "pdf", dir);
    assert.deepEqual(Buffer.from(await (preview.get("file") as Blob).arrayBuffer()), result.bytes);
    assert.equal((await exportReport(document, "md", { fileName: "source.pdf", images, pinSource })).bytes.toString(),
      (await exportReport(document, "md", { fileName: "source.pdf", images })).bytes.toString());
    await assert.rejects(exportReport(document, "pdf", { fileName: "source.pdf", images, pinSource: { ...source, slides: [] } }), /PIN_SLIDE_MISMATCH/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("omitted slide images never export orphan PINs; slides without questions remain included", async () => {
  const { zip } = await attachment((await exportReport(document, "pdf", { fileName: "source.pdf", images: [], pinSource: source })).bytes);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  assert.deepEqual(manifest.scope.includedSlideNumbers, []);
  assert.deepEqual(manifest.scope.omittedSlideNumbers, [1, 2]);
  assert.deepEqual(JSON.parse(await zip.file("pins.json")!.async("string")).questions, []);
  const dir = await mkdtemp(join(tmpdir(), "ohpin-empty-pins-"));
  try {
    const file = join(dir, "slide.jpg");
    await sharp({ create: { width: 20, height: 10, channels: 3, background: "white" } }).jpeg().toFile(file);
    const { zip: empty } = await attachment((await exportReport({ ...document, sections: [document.sections[1]] }, "pdf", {
      fileName: "source.pdf", images: [{ page: 1, file, width: 20, height: 10 }], pinSource: { ...source, questions: [] },
    })).bytes);
    assert.ok(empty.file("slides/slide-001.jpg"));
    assert.deepEqual(JSON.parse(await empty.file("pins.json")!.async("string")).questions, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
