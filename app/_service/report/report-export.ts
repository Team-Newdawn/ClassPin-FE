import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { degrees, PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { attachOfficeReportPins, attachReportPins, REPORT_PIN_INSTRUCTIONS, type ReportPinSource, type ReportSlidePlacement } from "./report-pin-package.ts";
import { BorderStyle, Document, ExternalHyperlink, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import PptxGenJS from "pptxgenjs";
import sharp from "sharp";
import { formatReportLine, parseReportText, reportDate, type ReportDocument, type TextRun as StyledRun } from "../_model/report.ts";
import { C, chartSvg } from "../_model/report-chart.ts";

/** Rendered slide JPEG (from renderMaterialSlides) keyed by 1-based slide number. */
type SlideImage = { page: number; width: number; height: number; file: string };
type ReportExportContext = { fileName: string; images: readonly SlideImage[]; pinSource?: ReportPinSource };

// The bundled PDF font; Docker installs it too, so Office previews render the same face.
const FONT = "NanumGothic";
const LABEL = "OhPin 리포트";


// Section body on a 16:9 slide: 14pt text (big 18, small 11, RPT-062) at exactly 21pt line spacing in a 5.05in-tall box.
const BODY = { size: 14, line: 21, top: 1.8, h: 5.05 };
/** The largest w × h (inches) with the image's aspect ratio that fits a box w × h. */
export const containIn = (image: { width: number; height: number }, w: number, h: number) => {
  const scale = Math.min(w / image.width, h / image.height);
  return { w: image.width * scale, h: image.height * scale };
};
const PPTX_SIZE = { big: 18, small: 11 } as const;
/** Estimated width in em of 14pt text: Hangul/CJK = 1 em, anything else ≈ .55 em, scaled by the run's size. */
const runWidth = (run: StyledRun) => Array.from(run.text).reduce((sum, char) => sum + (char.codePointAt(0)! >= 0x1100 ? 1 : .55), 0) * (run.size ? PPTX_SIZE[run.size] / BODY.size : 1);
const lineRows = (runs: readonly StyledRun[], perLine: number) => Math.max(1, Math.ceil(runs.reduce((sum, run) => sum + runWidth(run), 0) / perLine));

/**
 * RPT-062: cuts a section body into slide pages of at most `rows` estimated lines, as RPT-024 text. Pages break between lines;
 * only a line taller than a whole page is cut inside. A table row counts as one line, and a table that runs on repeats its
 * header row and rule on the next page. Text is never shrunk to fit. `perLine` is in em.
 */
export function slidePages(text: string, perLine: number, rows: number): string[] {
  const pages: string[][] = [[]];
  let used = 0;
  const add = (line: string, height: number) => {
    if (used + height > rows && pages.at(-1)!.length) { pages.push([]); used = 0; }
    if (!line && !pages.at(-1)!.length) return; // no blank line at the top of a continued page
    pages.at(-1)!.push(line); used += height;
  };
  for (const block of parseReportText(text)) {
    if (block.kind === "table") {
      const [head, rule, ...body] = block.source.split("\n");
      // The header row moves with the first body row.
      if (used + 2 > rows && pages.at(-1)!.length) { pages.push([]); used = 0; }
      pages.at(-1)!.push(head, rule); used += 1;
      for (const row of body) {
        if (used + 1 > rows) { pages.push([head, rule]); used = 1; }
        pages.at(-1)!.push(row); used += 1;
      }
      continue;
    }
    if (lineRows(block.runs, perLine) <= rows) { add(block.source, lineRows(block.runs, perLine)); continue; }
    // Longer than a page: cut by width per character, keeping each character's style.
    let chunk: StyledRun[] = [], sum = 0;
    for (const char of block.runs.flatMap((run) => Array.from(run.text, (part) => ({ ...run, text: part })))) {
      if (sum + runWidth(char) > perLine * rows && chunk.length) { add(formatReportLine(chunk), rows); chunk = []; sum = 0; }
      chunk.push(char); sum += runWidth(char);
    }
    add(formatReportLine(chunk), lineRows(chunk, perLine));
  }
  return pages.map((page) => { while (page.at(-1) === "") page.pop(); return page.join("\n"); });
}

function reportModel(document: ReportDocument, context: ReportExportContext, charts: ReadonlyMap<string, SlideImage> = new Map()) {
  // macOS file names arrive decomposed (NFD); the PDF font has no glyphs for loose jamo, so "대학원 논문4" printed as "4".
  document = JSON.parse(JSON.stringify(document).normalize("NFC")) as ReportDocument;
  return { title: document.title, fileName: context.fileName.normalize("NFC"), pinSource: context.pinSource, images: context.images,
    // The draft's own timestamp, not "now": the same document always exports the same file (RPT-064).
    date: reportDate(document.metrics),
    sections: document.sections.map((section) => ({ ...section, image: charts.get(section.id) ?? (section.slide ? context.images.find((image) => image.page === section.slide) : undefined) })) };
}
type Report = ReturnType<typeof reportModel>;
const oneLine = (value: string) => value.replace(/\s*\n\s*/g, " ");

/**
 * RPT-063: bold, links and tables stay Markdown, `<i>` becomes `*`, size and underline tags go (Markdown has neither);
 * a single newline between text lines becomes a hard break.
 */
function markdownBody(text: string) {
  const blocks = parseReportText(text);
  return blocks.map((block, index) => {
    const source = block.source.replace(/<\/?(big|small|u)>/g, "").replace(/<\/?i>/g, "*"), next = blocks[index + 1];
    if (!next) return source;
    if (block.kind === "table" || next.kind === "table") return `${source}\n\n`;
    return source && next.source ? `${source}  \n` : `${source}\n`;
  }).join("");
}
/** RPT-063: text only, no images. */
function markdown(report: Report) {
  return [`# ${oneLine(report.title)}`, `${report.fileName} · ${report.date}`,
    ...report.sections.flatMap((section) => [`## ${oneLine(section.title)}`, ...section.slide ? [`슬라이드 ${section.slide}`] : [],
      ...section.text.trim() ? [markdownBody(section.text)] : []]),
  ].join("\n\n") + "\n";
}

export async function exportReport(document: ReportDocument, format: string, context: ReportExportContext) {
  if (format === "md") return { bytes: Buffer.from(markdown(reportModel(document, context))), mime: "text/markdown; charset=utf-8" };
  // RPT-037: each chart section's graph as a 2x JPEG, placed where a slide image would go; Markdown has no graphs.
  const charted = document.sections.flatMap((section) => section.chart?.points.length ? [{ section, chart: section.chart }] : []);
  const dir = charted.length ? await mkdtemp(join(tmpdir(), "report-chart-")) : null, charts = new Map<string, SlideImage>();
  try {
    for (const [index, { section, chart }] of charted.entries()) {
      const { svg } = chartSvg(chart.points, chart.kind, section.title), file = join(dir!, `chart-${index}.jpg`);
      const info = await sharp(Buffer.from(svg), { density: 144 }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toFile(file);
      charts.set(section.id, { page: 0, width: info.width, height: info.height, file });
    }
    return await exportFormat(reportModel(document, context, charts), format);
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
async function exportFormat(report: Report, format: string) {
  if (format === "pdf") return { bytes: await pdfReport(report), mime: "application/pdf" };
  if (format === "docx") return { bytes: await docxReport(report), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (format === "pptx") return { bytes: await pptxReport(report), mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  throw new Error("INVALID_EXPORT_FORMAT");
}

/** Return the exact download file plus its format-specific rendered preview. */
export async function previewReportExport(result: Awaited<ReturnType<typeof exportReport>>, format: string, work: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(result.bytes)], { type: result.mime }), `report.${format}`);
  if (format === "pptx" || format === "docx") {
    const { resolveDocumentBinary } = await import("../_infrastructure/server/document-binaries.ts");
    const binary = await resolveDocumentBinary("soffice");
    const source = join(work, `report.${format}`);
    await writeFile(source, result.bytes);
    // LibreOffice also loads fonts from its profile; without these, Hangul renders blank where Nanum isn't installed.
    const fonts = join(work, "office-profile/user/fonts");
    await mkdir(fonts, { recursive: true });
    for (const weight of ["Regular", "Bold"]) await copyFile(join(process.cwd(), `public/assets/insights/NanumGothic-${weight}.ttf`), join(fonts, `NanumGothic-${weight}.ttf`));
    await promisify(execFile)(binary, [
      `-env:UserInstallation=${pathToFileURL(join(work, "office-profile")).href}`, "--headless",
      "--convert-to", `pdf:${format === "pptx" ? "impress" : "writer"}_pdf_Export`, "--outdir", work, source,
    ], { timeout: 60_000, maxBuffer: 1024 * 1024, signal });
    signal?.throwIfAborted();
    form.set("preview", new Blob([new Uint8Array(await readFile(join(work, "report.pdf")))], { type: "application/pdf" }), "preview.pdf");
  }
  return form;
}

const hex = (value: string) => rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255);
/** One laid-out text line: styled pieces on one baseline, as tall as its largest piece. */
type Seg = { text: string; size: number; font: PDFFont; color: string; italic?: true; underline?: true; link?: string };
type Line = { segs: Seg[]; size: number; h: number };
// RPT-061 body sizes in points.
const PDF_SIZE = { big: 14, small: 8.5 } as const;

async function pdfReport(report: Report) {
  // No creation/modification dates, so the same document gives the same bytes.
  const pdf = await PDFDocument.create({ updateMetadata: false }); pdf.registerFontkit(fontkit);
  const embed = async (weight: string) => pdf.embedFont(await readFile(join(process.cwd(), `public/assets/insights/NanumGothic-${weight}.ttf`)), { subset: false });
  const regular = await embed("Regular"), bold = await embed("Bold");
  // A4 points; the design-system type scale is mapped down for print (H1 22, H2 16, Body 10.5, Caption 9).
  const W = 595, H = 842, M = 40, CW = W - M * 2, BOTTOM = H - 52;
  const placements: ReportSlidePlacement[] = [];
  let page!: PDFPage, y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); y = M; };
  const rule = (x1: number, top1: number, x2: number, top2: number) => page.drawLine({ start: { x: x1, y: H - top1 }, end: { x: x2, y: H - top2 }, thickness: .75, color: hex(C.border) });
  const write = (text: string, x: number, top: number, h: number, size: number, font: PDFFont, color: string) =>
    page.drawText(text, { x, y: H - top - h / 2 - size * .35, size, font, color: hex(color) });
  type Style = { size?: number; font?: PDFFont; color?: string };
  /** Wraps styled runs to `width`, breaking at the last space so English words stay whole; Korean without spaces breaks per character. */
  const wrap = (runs: readonly StyledRun[], width: number, { size = 10.5, font = regular, color = C.text }: Style = {}): Line[] => {
    const chars = runs.flatMap((run) => Array.from(run.text.replace(/\t/g, " "), (text) => {
      const charSize = run.size ? PDF_SIZE[run.size] : size, charFont = run.bold ? bold : font;
      // A link reads as one: brand color and underlined (RPT-061).
      return { text, size: charSize, font: charFont, color: run.link ? C.brand : color, w: charFont.widthOfTextAtSize(text, charSize),
        ...run.italic && { italic: true as const }, ...(run.underline || run.link) && { underline: true as const }, ...run.link && { link: run.link } };
    }));
    type Char = (typeof chars)[number];
    const lines: Line[] = [];
    const push = (part: Char[]) => {
      const segs: Line["segs"] = [], max = Math.max(size, ...part.map((char) => char.size));
      for (const char of part) {
        const last = segs.at(-1);
        if (last && last.font === char.font && last.size === char.size && last.color === char.color && last.italic === char.italic
          && last.underline === char.underline && last.link === char.link) last.text += char.text;
        else segs.push({ text: char.text, size: char.size, font: char.font, color: char.color, italic: char.italic, underline: char.underline, link: char.link });
      }
      lines.push({ segs, size: max, h: max * 1.6 });
    };
    let line: Char[] = [], used = 0;
    for (const char of chars) {
      if (line.length && used + char.w > width) {
        const cut = line.map((item) => item.text).lastIndexOf(" ");
        push(cut > 0 ? line.slice(0, cut) : line);
        line = cut > 0 ? line.slice(cut + 1) : []; used = line.reduce((sum, item) => sum + item.w, 0);
      }
      line.push(char); used += char.w;
    }
    push(line);
    return lines;
  };
  const para = (text: string, { after = 0, ...style }: Style & { after?: number } = {}): Line[] => {
    const lines = text.split(/\r?\n/).flatMap((line) => wrap([{ text: line }], CW, style));
    lines[lines.length - 1].h += after;
    return lines;
  };
  const draw = (line: Line, x: number, top: number) => {
    // One baseline for the line, set by its largest piece; each piece keeps its own size.
    const baseline = H - top - line.size * .8 - line.size * .35;
    for (const seg of line.segs) {
      const w = seg.font.widthOfTextAtSize(seg.text, seg.size);
      // NanumGothic has no italic face, so italic is the regular face slanted 12 degrees.
      page.drawText(seg.text, { x, y: baseline, size: seg.size, font: seg.font, color: hex(seg.color), ...seg.italic && { xSkew: degrees(12) } });
      if (seg.underline) page.drawLine({ start: { x, y: baseline - seg.size * .15 }, end: { x: x + w, y: baseline - seg.size * .15 }, thickness: seg.size / 16, color: hex(seg.color) });
      if (seg.link) page.node.addAnnot(pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Border: [0, 0, 0],
        Rect: [x, baseline - seg.size * .3, x + w, baseline + seg.size], A: { Type: "Action", S: "URI", URI: PDFString.of(seg.link) } })));
      x += w;
    }
  };
  /** Flows lines down the page, continuing on a new page when they don't fit. */
  const flow = (lines: Line[]) => {
    for (let rest = lines; rest.length;) {
      let used = 0, count = 0;
      while (count < rest.length && y + used + rest[count].h <= BOTTOM) used += rest[count++].h;
      if (!count && y > M) { newPage(); continue; }
      if (!count) used = rest[count++].h;
      let top = y;
      for (const line of rest.slice(0, count)) { draw(line, M, top); top += line.h; }
      y += used; rest = rest.slice(count);
      if (rest.length) newPage();
    }
  };
  const gap = (space: number) => { y += space; };
  /** RPT-061: page-width grid with equal columns; breaks between rows and repeats the header row on the next page. */
  const table = (rows: StyledRun[][][]) => {
    const colW = CW / rows[0].length, PAD = 6;
    const laid = rows.map((row, index) => {
      const cells = row.map((cell) => wrap(cell, colW - PAD * 2, { size: 9.5, font: index ? regular : bold }));
      return { cells, h: Math.max(...cells.map((lines) => lines.reduce((sum, line) => sum + line.h, 0))) + PAD * 2, head: !index };
    });
    const drawRow = (row: (typeof laid)[number]) => {
      page.drawRectangle({ x: M, y: H - y - row.h, width: CW, height: row.h, borderColor: hex(C.border), borderWidth: .75, ...row.head ? { color: hex(C.page) } : {} });
      row.cells.forEach((lines, column) => {
        if (column) rule(M + column * colW, y, M + column * colW, y + row.h);
        let top = y + PAD;
        for (const line of lines) { draw(line, M + column * colW + PAD, top); top += line.h; }
      });
      y += row.h;
    };
    laid.forEach((row, index) => {
      if (y + row.h + (index ? 0 : laid[1]?.h ?? 0) > BOTTOM && y > M) { newPage(); if (index) drawRow(laid[0]); }
      drawRow(row);
    });
    gap(8);
  };

  newPage();
  write(LABEL, M, y, 14, 10, bold, C.brand); gap(20);
  flow(para(report.title, { size: 22, font: bold }));
  flow(para(`${report.fileName} · ${report.date}`, { size: 10, color: C.secondary })); gap(16);
  gap(16);
  for (const section of report.sections) {
    // Page width, capped so a tall slide still fits on one page under its heading, which stays with it.
    const image = section.image, scale = image ? Math.min(CW / image.width, (BOTTOM - M - 80) / image.height) : 0;
    if (y + 72 + (image ? image.height * scale : 0) > BOTTOM) newPage();
    flow(para(section.title, { size: 16, font: bold, after: 6 }));
    if (section.slide) flow(para(`슬라이드 ${section.slide}`, { size: 9, font: bold, color: C.brand, after: 6 }));
    if (image) {
      const w = image.width * scale, h = image.height * scale;
      if (y + h > BOTTOM) newPage();
      page.drawImage(await pdf.embedJpg(await readFile(image.file)), { x: M + (CW - w) / 2, y: H - y - h, width: w, height: h });
      if (section.slide && image.page === section.slide) placements.push({ slideNumber: section.slide, sectionId: section.id,
        reportPage: pdf.getPageCount(), rect: { x: M + (CW - w) / 2, y, width: w, height: h } });
      gap(h + 12);
    }
    if (section.text) for (const block of parseReportText(section.text)) {
      if (block.kind === "table") table(block.rows); else flow(wrap(block.runs, CW));
    }
    gap(28);
  }
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    page = item;
    page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: .5, color: hex(C.border) });
    write(`${LABEL} · ${oneLine(report.title)}`, M, H - 36, 12, 8, regular, C.tertiary);
    const number = `${index + 1} / ${pages.length}`;
    write(number, W - M - regular.widthOfTextAtSize(number, 8), H - 36, 12, 8, regular, C.tertiary);
  });
  if (report.pinSource) {
    await attachReportPins(pdf, report.pinSource, { title: report.title, images: report.images, placements,
      requestedSlides: report.sections.flatMap((section) => section.slide ?? []) });
    // RPT-066: extractable white text below the last footer; no extra page or layout changes.
    pages[pages.length - 1].drawText(REPORT_PIN_INSTRUCTIONS.join("\n"), { x: M, y: 20, size: 5, lineHeight: 6, font: regular, color: rgb(1, 1, 1) });
  }
  return Buffer.from(await pdf.save());
}

async function docxReport(report: Report) {
  const placements: ReportSlidePlacement[] = [];
  let imageIndex = 0;
  const run = (text: string, options: { size?: number; bold?: boolean; italic?: boolean; underline?: boolean; color?: string } = {}) =>
    new TextRun({ text, font: FONT, size: Math.round((options.size ?? 10.5) * 2), bold: options.bold, italics: options.italic, ...options.underline && { underline: {} },
      color: (options.color ?? C.text).slice(1) });
  // RPT-061 body sizes: small 8.5, normal 10.5, big 14. A link is a real hyperlink, brand color and underlined.
  const runs = (items: readonly StyledRun[], bold?: boolean) => items.map((item) => {
    const piece = run(item.text, { size: item.size === "big" ? 14 : item.size === "small" ? 8.5 : 10.5, bold: bold || item.bold, italic: item.italic,
      underline: item.underline || Boolean(item.link), ...item.link && { color: C.brand } });
    return item.link ? new ExternalHyperlink({ link: item.link, children: [piece] }) : piece;
  });
  const p = (children: TextRun | ExternalHyperlink | (TextRun | ExternalHyperlink)[], options: { after?: number; keepNext?: boolean } = {}) =>
    new Paragraph({ children: [children].flat(), spacing: { after: options.after ?? 120, line: 300 }, keepNext: options.keepNext });
  const line = { style: BorderStyle.SINGLE, size: 6, color: C.border.slice(1) };
  // A4 content width in twips; explicit widths and table-level borders (docx defaults to black) render the same in Word, Pages and Quick Look.
  const FULL = 9026, CELL = FULL / 4, edges = { top: line, bottom: line, left: line, right: line };
  const cell = (child: Paragraph, width = CELL, fill?: string) => new TableCell({ children: [child], width: { size: width, type: WidthType.DXA }, margins: { top: 100, bottom: 100, left: 160, right: 160 }, borders: edges,
    ...fill ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: fill.slice(1) } } : {} });
  const children: (Paragraph | Table)[] = [
    p(run(LABEL, { size: 10, bold: true, color: C.brand }), { after: 80 }),
    p(run(report.title, { size: 22, bold: true }), { after: 80 }),
    p(run(`${report.fileName} · ${report.date}`, { size: 10, color: C.secondary }), { after: 240 }),
  ];
  for (const section of report.sections) {
    children.push(p(run(section.title, { size: 16, bold: true }), { after: 80, keepNext: true }));
    if (section.slide) children.push(p(run(`슬라이드 ${section.slide}`, { size: 9, bold: true, color: C.brand }), { after: 80, keepNext: true }));
    if (section.image) {
      imageIndex++;
      if (section.slide && section.image.page === section.slide) placements.push({ slideNumber: section.slide, sectionId: section.id, imageIndex, reportPage: null, rect: null });
      // Page width in pixels (6.27in at 96dpi); tall slides are capped to the page height.
      const scale = Math.min(600 / section.image.width, 860 / section.image.height);
      children.push(new Paragraph({ children: [new ImageRun({ type: "jpg", data: await readFile(section.image.file),
        transformation: { width: Math.round(section.image.width * scale), height: Math.round(section.image.height * scale) } })], alignment: "center", spacing: { after: 120 } }));
    }
    if (section.text) for (const block of parseReportText(section.text)) {
      if (block.kind === "line") { children.push(p(runs(block.runs), { after: 0 })); continue; }
      // Header row repeats on every page Word breaks the table onto (RPT-061).
      const width = Math.floor(FULL / block.rows[0].length);
      children.push(new Table({ width: { size: FULL, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: block.rows[0].map(() => width),
        borders: { ...edges, insideHorizontal: line, insideVertical: line },
        rows: block.rows.map((row, index) => new TableRow({ tableHeader: !index, cantSplit: true,
          children: row.map((item) => cell(p(runs(item, !index), { after: 0 }), width, index ? undefined : C.page)) })) }));
    }
    children.push(p(run(""), { after: 240 }));
  }
  if (report.pinSource) {
    // Reuse the trailing spacer's 15pt line; the guide has three 5pt lines.
    const guide = new Paragraph({ children: REPORT_PIN_INSTRUCTIONS.map((text, index) => new TextRun({
      text, font: FONT, size: 10, color: "FFFFFF", break: index ? 1 : 0,
    })), spacing: { after: 240, line: 100, lineRule: "exact" } });
    if (report.sections.length) children[children.length - 1] = guide;
    else children.push(guide);
  }
  const bytes = await Packer.toBuffer(new Document({ creator: "OhPin", title: report.title, sections: [{ children }],
    styles: { default: { document: { run: { font: FONT, size: 21 } } } } }));
  return report.pinSource ? attachOfficeReportPins(bytes, report.pinSource, { format: "docx", title: report.title, pages: null,
    images: report.images, placements, requestedSlides: report.sections.flatMap((section) => section.slide ?? []) }) : bytes;
}

const ROWS = Math.floor(BODY.h * 72 / BODY.line);
/** Characters (em) per line for a box `w` inches wide, with 10% slack for word wrap. */
const perLine = (w: number) => Math.floor(w * 72 / BODY.size * .9);

/** RPT-062: a styled run's PowerPoint text options; a link is a hyperlink in the brand color. */
const pptxStyle = (part: StyledRun): PptxGenJS.TextPropsOptions => ({ bold: part.bold, italic: part.italic,
  ...(part.underline || part.link) && { underline: { style: "sng" } }, ...part.link && { hyperlink: { url: part.link }, color: C.brand.slice(1) } });

async function pptxReport(report: Report) {
  const pptx = new PptxGenJS(), pages: PptxGenJS.Slide[] = [], placements: ReportSlidePlacement[] = []; pptx.layout = "LAYOUT_WIDE"; pptx.author = "OhPin"; pptx.title = report.title;
  const c = (value: string) => value.slice(1);
  const text = (slide: PptxGenJS.Slide, value: string, options: PptxGenJS.TextPropsOptions) =>
    slide.addText(value, { fontFace: FONT, color: c(C.text), margin: 0, valign: "top", ...options });
  const box = (slide: PptxGenJS.Slide, options: { x: number; y: number; w: number; h: number; fill?: string; border?: string }) =>
    slide.addShape(pptx.ShapeType.roundRect, { x: options.x, y: options.y, w: options.w, h: options.h, rectRadius: .12,
      fill: { color: c(options.fill ?? "#ffffff") }, line: options.border ? { color: c(options.border), width: .75 } : { type: "none" } });
  const page = (label: string) => {
    const slide = pptx.addSlide();
    pages.push(slide); slide.background = { color: "FFFFFF" };
    if (label) text(slide, label, { x: .6, y: .45, w: 8, h: .3, fontSize: 12, bold: true, color: c(C.brand) });
    text(slide, `${LABEL} · ${oneLine(report.title)}`, { x: .6, y: 7.05, w: 12, h: .25, fontSize: 9, color: c(C.tertiary) });
    return slide;
  };

  const cover = page(LABEL);
  text(cover, report.title, { x: .6, y: 2.4, w: 12.1, h: 1.6, fontSize: 32, bold: true, valign: "bottom" });
  text(cover, `${report.fileName} · ${report.date}`, { x: .6, y: 4.2, w: 12.1, h: .4, fontSize: 14, color: c(C.secondary) });
  for (const section of report.sections) {
    // A picture without text (RPT-037 graphs) takes the full slide width.
    const image = section.image, bare = Boolean(image) && !section.text.trim(), x = image ? 7.75 : .6, w = image ? 4.95 : 12.1;
    slidePages(section.text, perLine(w), ROWS).forEach((body, index) => {
      const slide = page(section.slide ? `슬라이드 ${section.slide}` : "");
      text(slide, index ? `${section.title} (계속)` : section.title, { x: .6, y: .8, w: 12.1, h: .9, fontSize: 22, bold: true });
      if (image) {
        const boxW = bare ? 12.1 : 6.9, inner = boxW - .3;
        box(slide, { x: .6, y: BODY.top, w: boxW, h: BODY.h, fill: C.page });
        // pptxgenjs' "contain" needs the picture's own size and stretched it to the box; fit and centre it here instead.
        const fit = containIn(image, inner, BODY.h - .3);
        slide.addImage({ path: image.file, x: .75 + (inner - fit.w) / 2, y: BODY.top + .15 + (BODY.h - .3 - fit.h) / 2, ...fit });
        if (section.slide && image.page === section.slide) placements.push({ slideNumber: section.slide, sectionId: section.id,
          reportPage: pages.length, rect: { x: (.75 + (inner - fit.w) / 2) * 72,
            y: (BODY.top + .15 + (BODY.h - .3 - fit.h) / 2) * 72, width: fit.w * 72, height: fit.h * 72 } });
      }
      // Lines and tables stack at the same row estimate the paging used.
      let top = BODY.top, lines: StyledRun[][] = [];
      const flush = () => {
        if (!lines.length) return;
        const h = lines.reduce((sum, item) => sum + lineRows(item, perLine(w)), 0) * BODY.line / 72;
        slide.addText(lines.flatMap((item, index) => (item.length ? item : [{ text: "" }]).map((part, at, all) => ({ text: part.text,
          options: { ...pptxStyle(part), fontSize: part.size ? PPTX_SIZE[part.size] : BODY.size, breakLine: at === all.length - 1 && index < lines.length - 1 } }))),
        { x, y: top, w, h, fontFace: FONT, color: c(C.text), margin: 0, valign: "top", lineSpacing: BODY.line });
        top += h; lines = [];
      };
      for (const block of body ? parseReportText(body) : []) {
        if (block.kind === "line") { lines.push(block.runs); continue; }
        flush();
        const rowH = BODY.line / 72;
        slide.addTable(block.rows.map((row, index) => row.map((item) => ({ text: item.map((part) => ({ text: part.text, options: { ...pptxStyle(part), bold: !index || part.bold, fontSize: part.size ? PPTX_SIZE[part.size] - 2 : 12 } })),
          options: index ? {} : { fill: { color: c(C.page) } } }))),
        { x, y: top, w, colW: block.rows[0].map(() => w / block.rows[0].length), rowH, fontFace: FONT, fontSize: 12, color: c(C.text), valign: "middle",
          margin: [0, .08, 0, .08], border: { type: "solid", pt: .75, color: c(C.border) } });
        top += block.rows.length * rowH;
      }
      flush();
    });
  }
  if (report.pinSource) text(pages[pages.length - 1], REPORT_PIN_INSTRUCTIONS.join("\n"), {
    x: .6, y: 7.32, w: 12.1, h: .17, fontSize: 3, lineSpacing: 3, color: "FFFFFF",
  });
  const bytes = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
  return report.pinSource ? attachOfficeReportPins(bytes, report.pinSource, { format: "pptx", title: report.title, pages: pages.length,
    images: report.images, placements, requestedSlides: report.sections.flatMap((section) => section.slide ?? []) }) : bytes;
}
