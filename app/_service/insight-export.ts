import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BorderStyle, Document, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import PptxGenJS from "pptxgenjs";
import type { InsightReportBody } from "../_model/insight-report.ts";

/** Rendered slide JPEG (from renderMaterialSlides) keyed by 1-based slide number. */
type SlideImage = { page: number; width: number; height: number; file: string };
export type InsightExportContext = { title: string; fileName: string; date: string; images: readonly SlideImage[] };

// OhPin tokens (app/_design-system/tokens.css); exports can't read CSS variables.
const C = { brand: "#0f62fe", brandSubtle: "#eef4ff", text: "#141f38", secondary: "#53627f", tertiary: "#7483a0", border: "#dde2ec", subtle: "#e9edf4",
  page: "#f4f6fa", success: "#0b7a4f", successBg: "#e9f8f1" };
const FONT = "Pretendard";
const STATUS: Record<string, string> = { unanswered: "미답변", answered: "답변됨", resolved: "해결됨" };

function reportModel(body: InsightReportBody, context: InsightExportContext) {
  const sum = (key: "questions" | "unanswered" | "answers" | "reactions") => body.slides.reduce((total, slide) => total + slide.metrics[key], 0);
  return {
    title: context.title, fileName: context.fileName, category: body.category, footer: `Claude(${body.model}) 분석 · 강사 확정`,
    date: new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(context.date)),
    kpis: [["질문", sum("questions")], ["미답변", sum("unanswered")], ["답변", sum("answers")], ["공감", sum("reactions")]] as const,
    overall: body.overall,
    slides: body.slides.map((slide) => ({ ...slide, image: context.images.find((image) => image.page === slide.page),
      failed: Boolean(body.failedPages?.includes(slide.page)), questions: body.questions.filter((question) => question.page === slide.page),
      metricLine: [`질문 ${slide.metrics.questions}`, `미답변 ${slide.metrics.unanswered}`, `답변 ${slide.metrics.answers}`, `공감 ${slide.metrics.reactions}`] })),
  };
}
type Report = ReturnType<typeof reportModel>;
type Slide = Report["slides"][number];
const slideHeading = (slide: Slide) => slide.failed ? "이 슬라이드는 AI 분석에 실패했습니다." : slide.topic || "분석 결과가 없습니다.";
const slideBody = (slide: Slide) => slide.questions.length ? ["질문 요약", slide.questionSummary] as const : ["내용 정리", slide.content ?? ""] as const;
const questionMeta = (question: Slide["questions"][number]) => `${STATUS[question.status] ?? question.status} · 공감 ${question.reactions}`;

/** Markdown export (text only): overall summary, then each slide with its own questions. */
export function insightExportSections(body: InsightReportBody) {
  return [
    { title: "인사이트 리포트 · 전체 요약", lines: [body.overall.summary,
      ...body.overall.hotspots.map((item) => `슬라이드 ${item.page}: ${item.reason}`),
      ...body.overall.suggestions.map((item) => `제안: ${item}`)].filter(Boolean) },
    ...body.slides.map((slide) => ({ title: `슬라이드 ${slide.page}`, lines: [
      `질문 ${slide.metrics.questions} · 미답변 ${slide.metrics.unanswered} · 답변 ${slide.metrics.answers} · 공감 ${slide.metrics.reactions}`,
      slide.topic, slide.content ?? "", slide.questionSummary, slide.suggestion ? `제안: ${slide.suggestion}` : "",
      ...body.questions.filter((item) => item.page === slide.page).flatMap((item) => [`질문: ${item.text}`, ...item.answers.map((answer) => `답변: ${answer}`)])].filter(Boolean) })),
  ];
}

export async function exportInsight(body: InsightReportBody, format: string, context: InsightExportContext) {
  if (format === "md") return { bytes: Buffer.from(`# ${context.title} 인사이트 리포트\n\n` + insightExportSections(body).map((section) => `## ${section.title}\n\n${section.lines.join("\n\n")}`).join("\n\n") +
    `\n\n${reportModel(body, context).footer}`), mime: "text/markdown; charset=utf-8" };
  const report = reportModel(body, context);
  if (format === "pdf") return { bytes: await pdfReport(report), mime: "application/pdf" };
  if (format === "docx") return { bytes: await docxReport(report), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (format === "pptx") return { bytes: await pptxReport(report), mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  throw new Error("INVALID_EXPORT_FORMAT");
}

const hex = (value: string) => rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255);
const roundRect = (w: number, h: number, r: number) => `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
/** One laid-out text line; `marker` is a pill (slide number) or circle (list number) drawn before the first line. */
type Line = { text: string; size: number; font: PDFFont; color: string; h: number; indent: number; marker?: { text: string; kind: "pill" | "circle" } };

async function pdfReport(report: Report) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const embed = async (weight: string) => pdf.embedFont(await readFile(join(process.cwd(), `public/assets/insights/NanumGothic-${weight}.ttf`)), { subset: false });
  const regular = await embed("Regular"), bold = await embed("Bold");
  // A4 points; the design-system type scale is mapped down for print (H1 22, H2 16, H3 12, Body 10.5, Caption 9).
  const W = 595, H = 842, M = 40, CW = W - M * 2, BOTTOM = H - 52;
  let page!: PDFPage, y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); y = M; };
  const box = (x: number, top: number, w: number, h: number, r: number, fill?: string, border?: string) =>
    page.drawSvgPath(roundRect(w, h, Math.min(r, h / 2)), { x, y: H - top, ...(fill ? { color: hex(fill) } : {}), ...(border ? { borderColor: hex(border), borderWidth: .75 } : { borderWidth: 0 }) });
  const write = (text: string, x: number, top: number, h: number, size: number, font: PDFFont, color: string) =>
    page.drawText(text, { x, y: H - top - h / 2 - size * .35, size, font, color: hex(color) });
  const pill = (text: string, x: number, top: number, color: string, fill: string, size = 9) => {
    const w = bold.widthOfTextAtSize(text, size) + 14;
    box(x, top, w, 18, 9, fill); write(text, x + 7, top, 18, size, bold, color); return w;
  };
  const para = (text: string, { size = 10.5, font = regular, color = C.text, width = CW - 32, after = 0, marker }: { size?: number; font?: PDFFont; color?: string; width?: number; after?: number; marker?: Line["marker"] } = {}): Line[] => {
    const indent = marker ? (marker.kind === "pill" ? bold.widthOfTextAtSize(marker.text, 9) + 22 : 26) : 0, lines: Line[] = [];
    for (const raw of text.replace(/\t/g, " ").split(/\r?\n/)) {
      let buffer = "";
      for (const char of Array.from(raw)) {
        if (buffer && font.widthOfTextAtSize(buffer + char, size) > width - indent) {
          // Break at the last space so English words stay whole; Korean without spaces still breaks per character.
          const cut = buffer.lastIndexOf(" "), keep = cut > 0 ? buffer.slice(0, cut) : buffer;
          lines.push({ text: keep, size, font, color, h: size * 1.6, indent }); buffer = cut > 0 ? buffer.slice(cut + 1) : "";
        }
        buffer += char;
      }
      lines.push({ text: buffer, size, font, color, h: size * 1.6, indent });
    }
    if (marker) lines[0].marker = marker;
    lines[lines.length - 1].h += after;
    return lines;
  };
  /** Flows lines down the page inside an optional card, splitting the card across pages when it doesn't fit. */
  const flow = (lines: Line[], card?: { fill?: string; border?: string; pad?: number }) => {
    const pad = card ? card.pad ?? 16 : 0;
    for (let rest = lines; rest.length;) {
      let used = 0, count = 0;
      while (count < rest.length && y + pad * 2 + used + rest[count].h <= BOTTOM) used += rest[count++].h;
      if (!count && y > M) { newPage(); continue; }
      if (!count) used = rest[count++].h;
      if (card) box(M, y, CW, used + pad * 2, 12, card.fill, card.border);
      let top = y + pad;
      for (const line of rest.slice(0, count)) {
        const x = M + pad + line.indent, lh = line.size * 1.6;
        if (line.marker?.kind === "pill") pill(line.marker.text, M + pad, top + (lh - 18) / 2, C.brand, C.brandSubtle);
        if (line.marker?.kind === "circle") {
          page.drawCircle({ x: M + pad + 9, y: H - top - lh / 2, size: 9, color: hex(C.brandSubtle) });
          write(line.marker.text, M + pad + 9 - bold.widthOfTextAtSize(line.marker.text, 9) / 2, top, lh, 9, bold, C.brand);
        }
        write(line.text, x, top, lh, line.size, line.font, line.color); top += line.h;
      }
      y += used + pad * 2; rest = rest.slice(count);
      if (rest.length) newPage();
    }
  };
  const gap = (space: number) => { y += space; };
  const cardTitle = (text: string, color = C.text) => para(text, { size: 12, font: bold, color, after: 4 });

  newPage();
  write("OhPin 인사이트 리포트", M, y, 14, 10, bold, C.brand); gap(20);
  flow(para(report.title, { size: 22, font: bold, width: CW }));
  flow(para(`${report.fileName} · ${report.date} · 슬라이드 ${report.slides.length}장`, { size: 10, color: C.secondary, width: CW })); gap(6);
  const x = M + pill("확정됨", M, y, C.success, C.successBg) + 6;
  if (report.category) pill(`AI 판단 · ${report.category}`, x, y, C.brand, C.brandSubtle);
  gap(32);
  const kpiW = (CW - 30) / 4;
  report.kpis.forEach(([label, value], index) => {
    const left = M + index * (kpiW + 10);
    box(left, y, kpiW, 60, 12, undefined, C.border);
    write(label, left + 14, y + 10, 14, 9.5, regular, C.secondary);
    write(String(value), left + 14, y + 28, 24, 20, bold, C.text);
  });
  gap(76);
  flow([...cardTitle("AI 전체 요약", C.brand), ...para(report.overall.summary)], { fill: C.brandSubtle }); gap(12);
  if (report.overall.hotspots.length) {
    flow([...cardTitle("질문이 몰린 슬라이드"), ...report.overall.hotspots.flatMap((item) => para(item.reason, { after: 6, marker: { text: `슬라이드 ${item.page}`, kind: "pill" } }))], { border: C.border }); gap(12);
  }
  if (report.overall.suggestions.length) {
    flow([...cardTitle("개선 제안"), ...report.overall.suggestions.flatMap((item, index) => para(item, { after: 6, marker: { text: String(index + 1), kind: "circle" } }))], { border: C.border });
  }
  for (const slide of report.slides) {
    newPage();
    write(`슬라이드 ${slide.page}`, M, y, 14, 10, bold, C.brand); gap(18);
    flow(para(slideHeading(slide), { size: 16, font: bold, color: slide.failed ? C.secondary : C.text, after: 6, width: CW }));
    slide.metricLine.reduce((left, text) => left + pill(text, left, y, C.secondary, C.subtle) + 6, M); gap(30);
    if (slide.image) {
      const scale = Math.min((CW - 24) / slide.image.width, 300 / slide.image.height), w = slide.image.width * scale, h = slide.image.height * scale;
      box(M, y, CW, h + 24, 12, C.page);
      page.drawImage(await pdf.embedJpg(await readFile(slide.image.file)), { x: M + (CW - w) / 2, y: H - y - 12 - h, width: w, height: h });
      gap(h + 36);
    }
    const [label, text] = slideBody(slide);
    if (text) { flow([...cardTitle(label), ...para(text)], { border: C.border }); gap(10); }
    if (slide.suggestion) { flow([...cardTitle("개선 제안", C.brand), ...para(slide.suggestion)], { fill: C.brandSubtle }); gap(10); }
    if (slide.questions.length) {
      gap(6); flow(para(`질문 ${slide.questions.length}개`, { size: 12, font: bold, after: 6 }));
      for (const question of slide.questions) {
        const width = CW - 24, lines = [...para(questionMeta(question), { size: 9, color: C.tertiary, width }), ...para(question.text, { after: question.answers.length ? 4 : 0, width }),
          ...question.answers.flatMap((answer) => para(`답변  ${answer}`, { size: 9.5, color: C.secondary, width }))];
        // Keep a short question card on one page instead of splitting it.
        if (y + lines.reduce((sum, line) => sum + line.h, 0) + 24 > BOTTOM && lines.length < 20) newPage();
        flow(lines, { border: C.border, pad: 12 }); gap(8);
      }
    }
  }
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    page = item;
    page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: .5, color: hex(C.border) });
    write(`OhPin 인사이트 리포트 · ${report.title} · ${report.footer}`, M, H - 36, 12, 8, regular, C.tertiary);
    const number = `${index + 1} / ${pages.length}`;
    write(number, W - M - regular.widthOfTextAtSize(number, 8), H - 36, 12, 8, regular, C.tertiary);
  });
  return Buffer.from(await pdf.save());
}

async function docxReport(report: Report) {
  const run = (text: string, options: { size?: number; bold?: boolean; color?: string } = {}) =>
    new TextRun({ text, font: FONT, size: Math.round((options.size ?? 10.5) * 2), bold: options.bold, color: (options.color ?? C.text).slice(1) });
  const p = (children: TextRun[] | TextRun, options: { after?: number; pageBreakBefore?: boolean } = {}) =>
    new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: options.after ?? 120, line: 300 }, pageBreakBefore: options.pageBreakBefore });
  const line = (color: string) => ({ style: color ? BorderStyle.SINGLE : BorderStyle.NONE, size: 6, color: color ? color.slice(1) : "auto" });
  // A4 content width in twips; explicit widths and table-level borders (docx defaults to black) render the same in Word, Pages and Quick Look.
  const FULL = 9026, edges = (color: string) => ({ top: line(color), bottom: line(color), left: line(color), right: line(color) });
  const card = (children: (Paragraph | Table)[], { fill, border = C.border }: { fill?: string; border?: string } = {}) => new Table({
    width: { size: FULL, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [FULL], borders: { ...edges(fill ? "" : border), insideHorizontal: line(""), insideVertical: line("") },
    rows: [new TableRow({ children: [new TableCell({ children, width: { size: FULL, type: WidthType.DXA }, margins: { top: 200, bottom: 120, left: 240, right: 240 },
      ...(fill ? { shading: { fill: fill.slice(1), type: ShadingType.CLEAR, color: "auto" } } : {}), borders: edges(fill ? "" : border) })] })] });
  const space = () => p(run(""), { after: 80 });
  const children: (Paragraph | Table)[] = [
    p(run("OhPin 인사이트 리포트", { size: 10, bold: true, color: C.brand }), { after: 80 }),
    p(run(report.title, { size: 22, bold: true }), { after: 80 }),
    p(run(`${report.fileName} · ${report.date} · 슬라이드 ${report.slides.length}장`, { size: 10, color: C.secondary })),
    p([run(" 확정됨 ", { size: 9, bold: true, color: C.success }), run("   "), ...(report.category ? [run(` AI 판단 · ${report.category} `, { size: 9, bold: true, color: C.brand })] : [])], { after: 240 }),
    new Table({ width: { size: FULL, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: report.kpis.map(() => FULL / 4), borders: { ...edges(C.border), insideHorizontal: line(C.border), insideVertical: line(C.border) },
      rows: [new TableRow({ children: report.kpis.map(([label, value]) => new TableCell({ width: { size: FULL / 4, type: WidthType.DXA },
      margins: { top: 160, bottom: 160, left: 200, right: 200 }, borders: edges(C.border),
      children: [p(run(label, { size: 9.5, color: C.secondary }), { after: 40 }), p(run(String(value), { size: 20, bold: true }), { after: 0 })] })) })] }),
    space(),
    card([p(run("AI 전체 요약", { size: 12, bold: true, color: C.brand })), p(run(report.overall.summary))], { fill: C.brandSubtle }),
  ];
  if (report.overall.hotspots.length) children.push(space(), card([p(run("질문이 몰린 슬라이드", { size: 12, bold: true })),
    ...report.overall.hotspots.map((item) => p([run(`슬라이드 ${item.page}   `, { bold: true, color: C.brand }), run(item.reason)]))]));
  if (report.overall.suggestions.length) children.push(space(), card([p(run("개선 제안", { size: 12, bold: true })),
    ...report.overall.suggestions.map((item, index) => p([run(`${index + 1}   `, { bold: true, color: C.brand }), run(item)]))]));
  for (const slide of report.slides) {
    children.push(p(run(`슬라이드 ${slide.page}`, { size: 10, bold: true, color: C.brand }), { after: 60, pageBreakBefore: true }),
      p(run(slideHeading(slide), { size: 16, bold: true, color: slide.failed ? C.secondary : C.text })),
      p(run(slide.metricLine.join("   ·   "), { size: 9, color: C.secondary }), { after: 160 }));
    if (slide.image) {
      const scale = Math.min(560 / slide.image.width, 360 / slide.image.height);
      children.push(card([new Paragraph({ children: [new ImageRun({ type: "jpg", data: await readFile(slide.image.file),
        transformation: { width: Math.round(slide.image.width * scale), height: Math.round(slide.image.height * scale) } })], alignment: "center" })], { fill: C.page }), space());
    }
    const [label, text] = slideBody(slide);
    if (text) children.push(card([p(run(label, { size: 12, bold: true })), p(run(text))]), space());
    if (slide.suggestion) children.push(card([p(run("개선 제안", { size: 12, bold: true, color: C.brand })), p(run(slide.suggestion))], { fill: C.brandSubtle }), space());
    if (slide.questions.length) {
      children.push(p(run(`질문 ${slide.questions.length}개`, { size: 12, bold: true })));
      for (const question of slide.questions) children.push(card([p(run(questionMeta(question), { size: 9, color: C.tertiary }), { after: 60 }), p(run(question.text)),
        ...question.answers.map((answer) => p([run("답변  ", { size: 9.5, bold: true, color: C.secondary }), run(answer, { size: 9.5, color: C.secondary })]))]), space());
    }
  }
  children.push(p(run(report.footer, { size: 8, color: C.tertiary })));
  return Packer.toBuffer(new Document({ creator: "OhPin", title: `${report.title} 인사이트 리포트`, sections: [{ children }],
    styles: { default: { document: { run: { font: FONT, size: 21 } } } } }));
}

async function pptxReport(report: Report) {
  const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.author = "OhPin"; pptx.subject = report.footer; pptx.title = `${report.title} 인사이트 리포트`;
  const c = (value: string) => value.slice(1);
  const text = (slide: PptxGenJS.Slide, value: string | PptxGenJS.TextProps[], options: PptxGenJS.TextPropsOptions) =>
    slide.addText(value, { fontFace: FONT, color: c(C.text), margin: 0, valign: "top", ...options });
  const box = (slide: PptxGenJS.Slide, options: { x: number; y: number; w: number; h: number; fill?: string; border?: string }) =>
    slide.addShape(pptx.ShapeType.roundRect, { x: options.x, y: options.y, w: options.w, h: options.h, rectRadius: .12,
      fill: { color: c(options.fill ?? "#ffffff") }, line: options.border ? { color: c(options.border), width: .75 } : { type: "none" } });
  const page = (label: string) => {
    const slide = pptx.addSlide(); slide.background = { color: "FFFFFF" };
    text(slide, label, { x: .6, y: .45, w: 8, h: .3, fontSize: 12, bold: true, color: c(C.brand) });
    text(slide, `OhPin 인사이트 리포트 · ${report.title}`, { x: .6, y: 7.05, w: 9, h: .25, fontSize: 9, color: c(C.tertiary) });
    return slide;
  };
  const card = (slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, title: string, body: string, brand = false) => {
    box(slide, { x, y, w, h, ...(brand ? { fill: C.brandSubtle } : { border: C.border }) });
    text(slide, [{ text: title, options: { bold: true, fontSize: 13, color: c(brand ? C.brand : C.text), breakLine: true } }, { text: body, options: { fontSize: 12, paraSpaceBefore: 6 } }],
      { x: x + .25, y: y + .2, w: w - .5, h: h - .4, fit: "shrink", lineSpacingMultiple: 1.2 });
  };

  const cover = page("OhPin 인사이트 리포트");
  text(cover, report.title, { x: .6, y: .85, w: 12, h: .7, fontSize: 30, bold: true });
  text(cover, `${report.fileName} · ${report.date} · 슬라이드 ${report.slides.length}장${report.category ? ` · AI 판단 · ${report.category}` : ""}`, { x: .6, y: 1.6, w: 12, h: .35, fontSize: 13, color: c(C.secondary) });
  report.kpis.forEach(([label, value], index) => {
    const x = .6 + index * 3.1;
    box(cover, { x, y: 2.2, w: 2.9, h: 1.05, border: C.border });
    text(cover, label, { x: x + .25, y: 2.35, w: 2.4, h: .3, fontSize: 12, color: c(C.secondary) });
    text(cover, String(value), { x: x + .25, y: 2.65, w: 2.4, h: .5, fontSize: 26, bold: true });
  });
  card(cover, .6, 3.55, 12.1, 3.3, "AI 전체 요약", report.overall.summary, true);
  if (report.overall.hotspots.length || report.overall.suggestions.length) {
    const slide = page("전체 요약");
    card(slide, .6, .95, 5.95, 5.9, "질문이 몰린 슬라이드", report.overall.hotspots.map((item) => `슬라이드 ${item.page}  ${item.reason}`).join("\n\n"));
    card(slide, 6.75, .95, 5.95, 5.9, "개선 제안", report.overall.suggestions.map((item, index) => `${index + 1}.  ${item}`).join("\n\n"));
  }
  for (const item of report.slides) {
    const slide = page(`슬라이드 ${item.page}`);
    text(slide, slideHeading(item), { x: .6, y: .8, w: 12.1, h: .5, fontSize: 20, bold: true, color: c(item.failed ? C.secondary : C.text), fit: "shrink" });
    box(slide, { x: .6, y: 1.5, w: 7.6, h: 5.35, fill: C.page });
    if (item.image) slide.addImage({ path: item.image.file, x: .8, y: 1.7, w: 7.2, h: 4.95, sizing: { type: "contain", w: 7.2, h: 4.95 } });
    text(slide, item.metricLine.join("  ·  "), { x: 8.45, y: 1.5, w: 4.3, h: .3, fontSize: 11, color: c(C.secondary) });
    const [label, body] = slideBody(item);
    card(slide, 8.45, 1.95, 4.25, item.suggestion ? 3.1 : 4.9, label, body || "-");
    if (item.suggestion) card(slide, 8.45, 5.2, 4.25, 1.65, "개선 제안", item.suggestion, true);
    // Question pages: about 6 questions each so cards stay readable without shrinking.
    for (let start = 0; start < item.questions.length; start += 6) {
      const list = page(`슬라이드 ${item.page} · 질문 ${item.questions.length}개`);
      item.questions.slice(start, start + 6).forEach((question, index) => {
        const x = .6 + (index % 2) * 6.15, y = .95 + Math.floor(index / 2) * 2;
        box(list, { x, y, w: 5.95, h: 1.85, border: C.border });
        text(list, [{ text: questionMeta(question), options: { fontSize: 10, color: c(C.tertiary), breakLine: true } },
          { text: question.text, options: { fontSize: 12, breakLine: true, paraSpaceBefore: 4 } },
          ...question.answers.map((answer) => ({ text: `답변  ${answer}`, options: { fontSize: 10.5, color: c(C.secondary), breakLine: true, paraSpaceBefore: 4 } }))],
        { x: x + .2, y: y + .15, w: 5.55, h: 1.55, fit: "shrink" });
      });
    }
  }
  return await pptx.write({ outputType: "nodebuffer" }) as Buffer;
}
