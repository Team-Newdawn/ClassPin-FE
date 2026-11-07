import type { InsightReportBody } from "./insight-report.ts";
import type { ChartKind, ChartPoint } from "./report-chart.ts";

/** docs/instructor-report-authoring.md §3. Shared by the report routes, the editor, and export. */
export type ReportMetrics = {
  at: string; slides: number; questions: number; pins: number;
  reactions: number; durationMinutes: number | null; audience: number | null; peakAudience: number | null;
};
export type ReportSection = { id: string; title: string; text: string; /** 1-based slide number. */ slide?: number; /** RPT-037: a code-built graph drawn above the section text; the numbers live here, not in a table. */ chart?: ReportChart };
export type ReportChart = { kind: ChartKind; points: ChartPoint[] };
export type ReportDocument = { title: string; metrics: ReportMetrics; sections: ReportSection[] };
/** `cleared` turns keep only their slot in the question count; `pending` marks a question whose answer is being written. */
export type ReportMessage = { role: "user" | "assistant"; text: string; createdAt: string; cleared?: true; pending?: true;
  /** RPT-057: name of the file sent with this question; the file itself is never stored. */ file?: string };
/** RPT-057: one file per question, sent to the AI for that question only. Claude takes images up to 5MB. */
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024, CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,application/pdf,image/png,image/jpeg,text/plain,text/markdown,text/csv";
export type ReportStatus = "drafting" | "failed" | "ready";
/** RPT-036: the instructor's own instructions for the AI-written sections (the report's one format is fixed, RPT-031). */
export const REPORT_REQUEST_MAX = 500;
/** "방금 수정됨", "n분 전", "n시간 전", "어제", or the date, in Korean time (RPT-011 list). */
export function reportAge(iso: string, now = Date.now()) {
  const at = Date.parse(iso), minutes = Math.floor((now - at) / 60_000), day = (time: number) => Math.floor((time + 9 * 3_600_000) / 86_400_000);
  if (minutes < 1) return "방금 수정됨";
  if (minutes < 60) return `${minutes}분 전`;
  if (day(now) === day(at)) return `${Math.floor(minutes / 60)}시간 전`;
  if (day(now) - day(at) === 1) return "어제";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(at);
}

export type ReportView = {
  id: string; materialId: string; /** Lecture title and source file name captured when the report was created. */ title: string; fileName: string; status: ReportStatus; error: string | null; createdAt: string; updatedAt: string;
  document: ReportDocument | null; messages: ReportMessage[]; questionsLeft: number;
  /** RPT-032: only `GET` of a running draft fills it; the preview is read-only and never saved. */ progress?: DraftProgress | null;
};
export type DraftProgress = { step: "render" } | { step: "slides"; done: number; total: number } | { step: "body"; preview: ReportDocument };

export const REPORT_LIMITS = { sections: 300, title: 200, sectionText: 20_000, total: 500_000, sectionId: 64 } as const;
export const CHAT_QUESTIONS_PER_REPORT = 5;

const newId = () => globalThis.crypto.randomUUID();
const clip = (value: string, limit: number) => value.length > limit ? value.slice(0, limit) : value;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

type MetricsSource = {
  slides: readonly unknown[];
  questions: readonly { anchor: unknown; reactions: number }[];
};
/** RPT-023: code-only counts; duration and audience are null when nothing was recorded. */
export function reportMetrics(material: MetricsSource, lecture: { startedAt: string | null; endedAt: string | null } | null,
  audience: { audience: number; peakAudience: number } | null, at = new Date().toISOString()): ReportMetrics {
  const q = material.questions;
  const start = Date.parse(lecture?.startedAt ?? ""), end = Date.parse(lecture?.endedAt ?? "");
  return { at, slides: material.slides.length, questions: q.length, pins: q.filter((item) => item.anchor != null).length,
    reactions: q.reduce((sum, item) => sum + item.reactions, 0),
    durationMinutes: Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 60_000) : null,
    audience: audience?.audience ?? null, peakAudience: audience?.peakAudience ?? null };
}

export const METRIC_NONE = "기록 없음";
/** The draft's own timestamp, not "now": the same document always shows and exports the same date (RPT-064). */
export const reportDate = (m: ReportMetrics) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(m.at));

export function overviewText(m: ReportMetrics) {
  const recorded = (value: number | null, unit: string) => value === null ? "기록 없음" : `${value}${unit}`;
  return [`슬라이드 ${m.slides}장, 질문 ${m.questions}개(위치가 있는 PIN ${m.pins}개)`,
    `공감 ${m.reactions}개`,
    `강의 시간 ${recorded(m.durationMinutes, "분")}`,
    `참여자 ${recorded(m.audience, "명")}(최대 동시 ${recorded(m.peakAudience, "명")})`].join("\n");
}

type DraftQuestion = { page: number; text: string; reactions: number; pinned: boolean; answers: readonly string[] };
/** Most-reacted first, each with its answers; RPT-023 leaves answer status out while answers are hidden. */
const questionLines = (questions: readonly { text: string; reactions: number; answers: readonly string[] }[]) =>
  [...questions].sort((a, b) => b.reactions - a.reactions).map((q) => `- ${q.text}${q.reactions ? ` (공감 ${q.reactions})` : ""}${q.answers.map((answer) => `\n  답변: ${answer}`).join("")}`);
const section = (title: string, lines: readonly string[], slide?: number): ReportSection =>
  ({ id: newId(), title: clip(title, REPORT_LIMITS.title), text: clip(lines.filter(Boolean).join("\n\n"), REPORT_LIMITS.sectionText), ...(slide ? { slide } : {}) });
const table = (head: [string, string], rows: readonly [string, string][]) => [`| ${head.join(" | ")} |`, "| --- | --- |", ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");

export type ReportLecture = { title: string; startedAt: string | null; folder: string | null };
const kst = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" });

/**
 * RPT-031 (2026-11-04): the one report format, everything the insight dashboard shows plus the AI's sections:
 * 개요 (lecture facts and the DSH-031 scoreboard) → the AI's sections (shaped by the instructor's request) → 슬라이드별 PIN 질문 흐름
 * (DSH-030) → one section per question type (DSH-035) → one section per slide (DSH-033, with every PIN question).
 * `analysis` null means "수치만으로 시작": the code-built parts only, slides limited to those with questions.
 */
export function draftReport(input: { title: string; metrics: ReportMetrics; analysis: InsightReportBody | null; questions: readonly DraftQuestion[]; lecture?: ReportLecture }): ReportDocument {
  const m = input.metrics, body = input.analysis, none = "기록 없음", started = Date.parse(input.lecture?.startedAt ?? "");
  const pages = Array.from({ length: m.slides }, (_, index) => index + 1);
  const pins = pages.map((page) => input.questions.filter((q) => q.page === page && q.pinned).length);
  const asked = pages.map((page) => input.questions.filter((q) => q.page === page).length);
  const topSlide = asked.indexOf(Math.max(0, ...asked)), pinned = pins.filter(Boolean).length;
  const byId = new Map((body?.questions ?? []).map((q) => [q.id, q]));
  const groups = [...body?.groups ?? []].sort((a, b) => b.questionIds.length - a.questionIds.length);
  const sections = [section("개요", [
    [`- 강의명: ${input.lecture?.title ?? none}`, `- 일시: ${Number.isFinite(started) ? kst.format(started) : none}`,
      `- 진행 시간: ${m.durationMinutes === null ? none : `${m.durationMinutes}분`}`, `- 대상·목적: ${input.lecture ? input.lecture.folder ?? "미분류" : none}`].join("\n"),
    table(["항목", "값"], [["질문", `${m.questions}건 · 공감 ${m.reactions}`], ["최다 슬라이드", asked[topSlide] ? `P.${topSlide + 1} · ${asked[topSlide]}건` : "없음"],
      ["핀 찍힌 슬라이드", `${pinned} / ${m.slides} · 핀 ${m.pins}개`], ["최다 주제", groups[0] ? `${groups[0].title} · ${groups[0].questionIds.length}건` : "없음"]]),
  ])];
  sections.push(...(body?.sections ?? []).map((item) => section(item.title, [item.text])));
  // RPT-037 (2026-11-04): the two graph sections carry no sentence; the graph is the content.
  sections.push({ ...section("슬라이드별 PIN 질문 흐름", []),
    chart: { kind: "line", points: pins.map((value, index) => ({ label: `P.${index + 1}`, value })) } });
  if (groups.length) sections.push({ ...section("질문 유형", []),
    chart: { kind: "bar", points: groups.map((group) => ({ label: group.title, value: group.questionIds.length })) } });
  for (const group of groups) {
    const own = group.questionIds.flatMap((id) => byId.get(id) ?? []);
    const spread = [...new Set(own.map((q) => q.page))].sort((a, b) => a - b).map((page) => `P.${page} (${own.filter((q) => q.page === page).length})`).join(" · ");
    sections.push(section(`질문 유형: ${group.title}`, [group.summary, `- 질문 ${own.length}건 (${m.questions ? Math.round((own.length / m.questions) * 100) : 0}%)\n- 나온 슬라이드: ${spread || "없음"}`,
      own.length ? `대표 질문\n${questionLines(own).slice(0, 5).join("\n")}` : ""]));
  }
  for (const page of pages) {
    const slide = body?.slides.find((item) => item.page === page), own = input.questions.filter((q) => q.page === page);
    if (!slide && !own.length) continue;
    sections.push(section(`슬라이드 ${page}${slide?.topic ? ` · ${slide.topic}` : ""}`, [
      slide ? own.length ? slide.questionSummary : slide.content ?? "" : "",
      (slide?.issues ?? []).map((issue) => `- ${issue.title}: ${issue.summary}`).join("\n"),
      slide?.suggestion ? `제안: ${slide.suggestion}` : "",
      own.length ? `질문 ${own.length}건 (공감순)\n${questionLines(own).join("\n")}` : "",
    ], page));
  }
  return { title: clip(input.title, REPORT_LIMITS.title), metrics: m, sections: sections.slice(0, REPORT_LIMITS.sections) };
}

const text = (value: unknown, limit: number) => {
  if (typeof value !== "string" || value.length > limit) throw new Error("INVALID_DOCUMENT");
  return value;
};
const slideRef = (value: unknown, slides: number) => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > slides) throw new Error("INVALID_DOCUMENT");
  return value as number;
};
function checkTotal(sections: readonly ReportSection[]) {
  if (sections.length > REPORT_LIMITS.sections || sections.reduce((sum, item) => sum + item.title.length + item.text.length, 0) > REPORT_LIMITS.total) throw new Error("INVALID_DOCUMENT");
}

/** Trust boundary for PATCH (RPT-022). Metrics are server-owned: the stored ones are kept, never the client's. */
export function parseReportDocument(value: unknown, stored: ReportDocument): ReportDocument {
  if (!isRecord(value) || !Array.isArray(value.sections)) throw new Error("INVALID_DOCUMENT");
  const ids = new Set<string>();
  const sections = value.sections.map((item): ReportSection => {
    if (!isRecord(item)) throw new Error("INVALID_DOCUMENT");
    const id = text(item.id, REPORT_LIMITS.sectionId);
    if (!id || ids.has(id)) throw new Error("INVALID_DOCUMENT");
    ids.add(id);
    const slide = slideRef(item.slide, stored.metrics.slides);
    const chart = chartRef(item.chart);
    return { id, title: text(item.title, REPORT_LIMITS.title), text: text(item.text, REPORT_LIMITS.sectionText), ...(slide ? { slide } : {}), ...(chart ? { chart } : {}) };
  });
  checkTotal(sections);
  return { title: text(value.title, REPORT_LIMITS.title), metrics: stored.metrics, sections };
}

/** RPT-024: one styled stretch of a section line. */
export type TextRun = { text: string; bold?: true; italic?: true; underline?: true; size?: "big" | "small"; /** http(s) only (RPT-024). */ link?: string };
/** A body line, or a pipe table whose first row is the header. `source` is the raw text the block came from. */
type ReportBlock = { kind: "line"; runs: TextRun[]; source: string } | { kind: "table"; rows: TextRun[][][]; source: string };
const TABLE_LIMITS = { columns: 8, rows: 50 } as const;

/** A link target: an absolute http(s) URL without spaces, quotes, angle brackets or parentheses; anything else stays text. */
export const REPORT_LINK = /^https?:\/\/[^\s()<>"]+$/;
const INLINE = /\*\*(.+?)\*\*|<big>(.+?)<\/big>|<small>(.+?)<\/small>|<i>(.+?)<\/i>|<u>(.+?)<\/u>|\[([^\]\n]+)\]\((https?:\/\/[^\s()<>"]+)\)/g;
/** Matched pairs only, innermost style wins for size; an unmatched marker stays literal text. */
function inlineRuns(text: string, style: Omit<TextRun, "text"> = {}): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), ...style });
    const [, bold, big, small, italic, underline, label, link] = match;
    const next: Omit<TextRun, "text"> = bold !== undefined ? { bold: true } : big !== undefined ? { size: "big" } : small !== undefined ? { size: "small" }
      : italic !== undefined ? { italic: true } : underline !== undefined ? { underline: true } : { link };
    runs.push(...inlineRuns(bold ?? big ?? small ?? italic ?? underline ?? label, { ...style, ...next }));
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), ...style });
  return runs;
}
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
const isTableLine = (line: string | undefined) => line?.trim().startsWith("|") ?? false;
const isRule = (line: string | undefined) => isTableLine(line) && cells(line!).every((cell) => /^:?-{3,}:?$/.test(cell));

const CHART_KINDS: readonly unknown[] = ["line", "bar"] satisfies ChartKind[];
/** RPT-037: a section graph from the client: one of two kinds, at most 600 points (slides), short labels, finite non-negative values. */
function chartRef(value: unknown): ReportChart | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !CHART_KINDS.includes(value.kind) || !Array.isArray(value.points) || value.points.length > 600) throw new Error("INVALID_DOCUMENT");
  return { kind: value.kind as ChartKind, points: value.points.map((point: unknown) => {
    if (!isRecord(point) || !Number.isFinite(point.value) || (point.value as number) < 0) throw new Error("INVALID_DOCUMENT");
    return { label: text(point.label, REPORT_LIMITS.title), value: point.value as number };
  }) };
}

/** RPT-024: shared by the editor and every export. A malformed or oversized table stays as plain lines. */
export function parseReportText(text: string): ReportBlock[] {
  const lines = text.split("\n"), blocks: ReportBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const head = lines[index], columns = cells(head).length;
    if (isTableLine(head) && isRule(lines[index + 1]) && cells(lines[index + 1]).length === columns && columns <= TABLE_LIMITS.columns) {
      let end = index + 2;
      while (isTableLine(lines[end])) end++;
      if (end - index - 2 <= TABLE_LIMITS.rows) {
        const rows = [head, ...lines.slice(index + 2, end)].map((line) => { const row = cells(line); return Array.from({ length: columns }, (_, column) => inlineRuns(row[column] ?? "")); });
        blocks.push({ kind: "table", rows, source: lines.slice(index, end).join("\n") });
        index = end - 1;
        continue;
      }
    }
    blocks.push({ kind: "line", runs: inlineRuns(head), source: head });
  }
  return blocks;
}

/** Outermost first: size tags wrap links, which wrap italic, underline, then bold marks. */
const WRAPS = [["size", (value: string, inner: string) => `<${value}>${inner}</${value}>`], ["link", (value: string, inner: string) => `[${inner}](${value})`],
  ["italic", (_: string, inner: string) => `<i>${inner}</i>`], ["underline", (_: string, inner: string) => `<u>${inner}</u>`],
  ["bold", (_: string, inner: string) => `**${inner}**`]] as const;
/** Inverse of a parsed line: adjacent runs that share a style merge under one marker. */
export function formatReportLine(runs: readonly TextRun[], level = 0): string {
  if (level === WRAPS.length) return runs.map((run) => run.text).join("");
  const [key, wrap] = WRAPS[level];
  let out = "";
  for (let index = 0; index < runs.length;) {
    const value = runs[index][key];
    let end = index;
    while (end < runs.length && runs[end][key] === value) end++;
    const inner = formatReportLine(runs.slice(index, end), level + 1);
    out += value && inner ? wrap(String(value), inner) : inner;
    index = end;
  }
  return out;
}
