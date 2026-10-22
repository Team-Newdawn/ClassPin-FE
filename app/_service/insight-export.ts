import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import PptxGenJS from "pptxgenjs";
import type { InsightReportBody } from "../_model/insight-report.ts";

export function insightExportSections(body: InsightReportBody) {
  const question = (id: string) => body.questions.find((item) => item.id === id);
  return [
    { title: "인사이트 리포트 · 전체 요약", lines: [body.overall.summary,
      ...body.overall.hotspots.map((item) => `슬라이드 ${item.page}: ${item.reason}`),
      ...body.overall.suggestions.map((item) => `제안: ${item}`)].filter(Boolean) },
    { title: "질문 묶음", lines: body.groups.flatMap((group) => [`${group.title}${group.summary ? ` — ${group.summary}` : ""}`,
      ...group.questionIds.map((id) => question(id)).filter((item) => !!item).map((item) => `  · (슬라이드 ${item.page}) ${item.text}`)]) },
    ...body.slides.map((slide) => ({ title: `슬라이드 ${slide.page}`, lines: [
      `질문 ${slide.metrics.questions} · 미답변 ${slide.metrics.unanswered} · 답변 ${slide.metrics.answers} · 공감 ${slide.metrics.reactions}`,
      slide.topic, slide.content ?? "", slide.questionSummary, slide.suggestion ? `제안: ${slide.suggestion}` : "",
      ...body.questions.filter((item) => item.page === slide.page).flatMap((item) => [`질문: ${item.text}`, ...item.answers.map((answer) => `답변: ${answer}`)])].filter(Boolean) })),
  ];
}

export async function exportInsight(body: InsightReportBody, format: string) {
  const sections = insightExportSections(body);
  const footer = `Claude(${body.model}) 분석 · 강사 확정`;
  if (format === "md") return { bytes: Buffer.from(sections.map((section) => `## ${section.title}\n\n${section.lines.join("\n\n")}`).join("\n\n") + "\n\n" + footer),
    mime: "text/markdown; charset=utf-8" };
  if (format === "pdf") {
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(await readFile(join(process.cwd(), "public/assets/insights/NanumGothic-Regular.ttf")), { subset: false });
    let page = pdf.addPage([595, 842]), y = 790;
    const line = (text: string, size = 11) => {
      let buffer = "";
      const draw = () => { if (y < 55) { page = pdf.addPage([595, 842]); y = 790; }
        page.drawText(buffer, { x: 45, y, size, font, color: rgb(.08, .12, .22) }); y -= size * 1.8; buffer = ""; };
      for (const char of Array.from(text.replace(/[\r\n\t]/g, " "))) {
        if (font.widthOfTextAtSize(buffer + char, size) > 505) draw();
        buffer += char;
      }
      if (buffer) draw(); y -= 7;
    };
    for (const section of sections) {
      if (y < 200) { page = pdf.addPage([595, 842]); y = 790; }
      line(section.title, 18);
      for (const text of section.lines) line(text); y -= 18;
    }
    line(footer, 9);
    return { bytes: Buffer.from(await pdf.save()), mime: "application/pdf" };
  }
  if (format === "docx") {
    const children: Paragraph[] = [];
    for (const section of sections) {
      children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
      children.push(...section.lines.map((text) => new Paragraph({ text, spacing: { after: 160 } })));
    }
    children.push(new Paragraph(footer));
    return { bytes: await Packer.toBuffer(new Document({ sections: [{ children }], styles: { default: { document: { run: { font: "Noto Sans KR", size: 22 } } } } })),
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (format === "pptx") {
    const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.author = "OhPin"; pptx.subject = footer;
    for (const section of sections) {
      const text = section.lines.join("\n");
      const characters = Array.from(text);
      for (let start = 0; start < Math.max(1, characters.length); start += 900) {
        const slide = pptx.addSlide();
        slide.addText(section.title, { x: .6, y: .4, w: 12, h: .7, fontFace: "Noto Sans KR", fontSize: 24 });
        slide.addText(characters.slice(start, start + 900).join(""), { x: .7, y: 1.5, w: 11.9, h: 5, fontFace: "Noto Sans KR", fontSize: 14, valign: "top" });
      }
    }
    return { bytes: await pptx.write({ outputType: "nodebuffer" }) as Buffer, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  }
  throw new Error("INVALID_EXPORT_FORMAT");
}
