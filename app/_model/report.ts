import type { InsightReportBody } from "./insight-report.ts";

/** docs/instructor-report-authoring.md §3. Shared by the report routes, the editor, and export. */
export type ReportMetrics = {
  at: string; slides: number; questions: number; pins: number;
  reactions: number; durationMinutes: number | null; audience: number | null; peakAudience: number | null;
};
export type ReportSection = { id: string; title: string; text: string; /** 1-based slide number. */ slide?: number };
export type ReportDocument = { title: string; metrics: ReportMetrics; sections: ReportSection[] };
/** AI-proposed edit (RPT-053). `after: null` inserts at the top. */
export type ReportProposal = {
  replace: { id: string; title: string; text: string }[];
  insert: { after: string | null; title: string; text: string; slide?: number }[];
  remove: string[];
};
/** `cleared` turns keep only their slot in the question count; `pending` marks a question whose answer is being written; `proposal` rides on an assistant turn, `applied` once the instructor applied it. */
export type ReportMessage = { role: "user" | "assistant"; text: string; createdAt: string; cleared?: true; pending?: true; proposal?: ReportProposal; applied?: true };
export type ReportStatus = "drafting" | "failed" | "ready";
export type ReportView = {
  id: string; materialId: string; /** Lecture title and source file name captured when the report was created. */ title: string; fileName: string; status: ReportStatus; error: string | null; createdAt: string; updatedAt: string;
  document: ReportDocument | null; canUndo: boolean; messages: ReportMessage[]; questionsLeft: number; redraftsLeft: number;
};

export const REPORT_LIMITS = { sections: 300, title: 200, sectionText: 20_000, total: 500_000, sectionId: 64 } as const;
export const CHAT_QUESTIONS_PER_REPORT = 5;
/** AI redrafts that replace an existing document; `next dev` has no limit. */
export const REDRAFTS_PER_REPORT = 2;

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
/** RPT-023/061: the one metrics table the editor and every export print, so all of them carry the same numbers. */
export function metricRows(m: ReportMetrics): [string, string][] {
  const recorded = (value: number | null, unit: string) => value === null ? METRIC_NONE : `${value}${unit}`;
  return [["슬라이드", `${m.slides}장`], ["질문", `${m.questions}개`], ["PIN", `${m.pins}개`], ["공감", `${m.reactions}개`],
    ["강의 시간", recorded(m.durationMinutes, "분")], ["참여자", recorded(m.audience, "명")], ["최대 동시 참여자", recorded(m.peakAudience, "명")]];
}
/** The draft's own timestamp, not "now": the same document always shows and exports the same date (RPT-064). */
export const reportDate = (m: ReportMetrics) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(m.at));

export function overviewText(m: ReportMetrics) {
  const recorded = (value: number | null, unit: string) => value === null ? "기록 없음" : `${value}${unit}`;
  return [`슬라이드 ${m.slides}장, 질문 ${m.questions}개(위치가 있는 PIN ${m.pins}개)`,
    `공감 ${m.reactions}개`,
    `강의 시간 ${recorded(m.durationMinutes, "분")}`,
    `참여자 ${recorded(m.audience, "명")}(최대 동시 ${recorded(m.peakAudience, "명")})`].join("\n");
}

type DraftQuestion = { page: number; text: string; reactions: number; status: string; answers: readonly string[] };
const STATUS: Record<string, string> = { unanswered: "미답변", answered: "답변됨", resolved: "해결됨" };
/** Most-reacted first, at most `limit`, then "외 n개" (RPT-031). */
function questionLines(questions: readonly DraftQuestion[], limit: number) {
  const top = [...questions].sort((a, b) => b.reactions - a.reactions).slice(0, limit);
  return [...top.map((q) => `- ${q.text} (${[q.reactions ? `공감 ${q.reactions}` : "", STATUS[q.status] ?? q.status].filter(Boolean).join(" · ")})`
    + q.answers.map((answer) => `\n  답변: ${answer}`).join("")),
  ...(questions.length > limit ? [`외 ${questions.length - limit}개`] : [])];
}
const section = (title: string, lines: readonly string[], slide?: number): ReportSection =>
  ({ id: newId(), title: clip(title, REPORT_LIMITS.title), text: clip(lines.filter(Boolean).join("\n\n"), REPORT_LIMITS.sectionText), ...(slide ? { slide } : {}) });

/**
 * RPT-031/033: the first draft. `analysis` null means "수치만으로 시작": the overview plus one section of raw questions per slide
 * that has questions. `questions` is only read in that case; with an analysis the draft quotes the analysis' own question list.
 */
export function draftReport(input: { title: string; metrics: ReportMetrics; analysis: InsightReportBody | null; questions: readonly DraftQuestion[] }): ReportDocument {
  const sections = [section("개요", [overviewText(input.metrics)])];
  if (!input.analysis) {
    const pages = [...new Set(input.questions.map((q) => q.page))].sort((a, b) => a - b);
    sections.push(...pages.map((page) => section(`슬라이드 ${page}`, questionLines(input.questions.filter((q) => q.page === page), 10), page)));
  } else {
    const body = input.analysis, byId = new Map(body.questions.map((q) => [q.id, q]));
    sections.push(...body.sections.map((item) => section(item.title, [item.text])));
    for (const group of body.groups) {
      const quoted = group.questionIds.flatMap((id) => byId.get(id) ?? []).slice(0, 5);
      sections.push(section(`주제: ${group.title}`, [group.summary, quoted.length ? `대표 질문\n${quoted.map((q) => `- ${q.text}`).join("\n")}` : ""]));
    }
    for (const slide of body.slides) {
      const own = body.questions.filter((q) => q.page === slide.page);
      sections.push(section(`슬라이드 ${slide.page}${slide.topic ? ` · ${slide.topic}` : ""}`, [
        own.length ? slide.questionSummary : slide.content ?? "",
        (slide.issues ?? []).map((issue) => `- ${issue.title}: ${issue.summary}`).join("\n"),
        slide.suggestion ? `제안: ${slide.suggestion}` : "",
        own.length ? `질문\n${questionLines(own, 10).join("\n")}` : "",
      ], slide.page));
    }
  }
  return { title: clip(input.title, REPORT_LIMITS.title), metrics: input.metrics, sections: sections.slice(0, REPORT_LIMITS.sections) };
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
    return { id, title: text(item.title, REPORT_LIMITS.title), text: text(item.text, REPORT_LIMITS.sectionText), ...(slide ? { slide } : {}) };
  });
  checkTotal(sections);
  return { title: text(value.title, REPORT_LIMITS.title), metrics: stored.metrics, sections };
}

/** Validates the model's `propose_document` input against the current document; throws INVALID_PROPOSAL. */
export function parseReportProposal(value: unknown, document: ReportDocument): ReportProposal {
  try {
    if (!isRecord(value) || !Array.isArray(value.replace) || !Array.isArray(value.insert) || !Array.isArray(value.remove)) throw new Error();
    const ids = new Set(document.sections.map((item) => item.id));
    const known = (id: unknown) => { if (typeof id !== "string" || !ids.has(id)) throw new Error(); return id; };
    const proposal: ReportProposal = {
      replace: value.replace.map((item) => { if (!isRecord(item)) throw new Error();
        return { id: known(item.id), title: text(item.title, REPORT_LIMITS.title), text: text(item.text, REPORT_LIMITS.sectionText) }; }),
      insert: value.insert.map((item) => { if (!isRecord(item)) throw new Error();
        const slide = slideRef(item.slide, document.metrics.slides);
        return { after: item.after === null ? null : known(item.after), title: text(item.title, REPORT_LIMITS.title), text: text(item.text, REPORT_LIMITS.sectionText), ...(slide ? { slide } : {}) }; }),
      remove: value.remove.map(known),
    };
    if (!proposal.replace.length && !proposal.insert.length && !proposal.remove.length) throw new Error();
    checkTotal(applyReportProposal(document, proposal).sections);
    return proposal;
  } catch { throw new Error("INVALID_PROPOSAL"); }
}

/** RPT-054. Ids the document no longer has are skipped, so a proposal stays applicable after unrelated edits. */
export function applyReportProposal(document: ReportDocument, proposal: ReportProposal): ReportDocument {
  const replaced = new Map(proposal.replace.map((item) => [item.id, item])), removed = new Set(proposal.remove);
  const inserted = (after: string | null) => proposal.insert.filter((item) => item.after === after)
    .map(({ title, text, slide }) => ({ id: newId(), title, text, ...(slide ? { slide } : {}) }));
  const sections = [...inserted(null), ...document.sections.flatMap((item) => {
    const own = replaced.get(item.id);
    return [...removed.has(item.id) ? [] : [own ? { ...item, title: own.title, text: own.text } : item], ...inserted(item.id)];
  })];
  return { ...document, sections };
}

/** RPT-054: sections a proposal would overwrite that the instructor edited after `since` (when this tab first saw the proposal). */
export const staleTargets = (proposal: ReportProposal, editedAt: ReadonlyMap<string, number>, since: number) =>
  [...proposal.replace.map((item) => item.id), ...proposal.remove].filter((id) => (editedAt.get(id) ?? -Infinity) > since);

/** RPT-024: one styled stretch of a section line. */
export type TextRun = { text: string; bold?: true; size?: "big" | "small" };
/** A body line, or a pipe table whose first row is the header. `source` is the raw text the block came from. */
type ReportBlock = { kind: "line"; runs: TextRun[]; source: string } | { kind: "table"; rows: TextRun[][][]; source: string };
const TABLE_LIMITS = { columns: 8, rows: 50 } as const;

const INLINE = /\*\*(.+?)\*\*|<big>(.+?)<\/big>|<small>(.+?)<\/small>/g;
/** Matched pairs only, innermost style wins for size; an unmatched marker stays literal text. */
function inlineRuns(text: string, style: Omit<TextRun, "text"> = {}): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), ...style });
    const [, bold, big, small] = match;
    runs.push(...inlineRuns(bold ?? big ?? small, bold !== undefined ? { ...style, bold: true } : { ...style, size: big !== undefined ? "big" : "small" }));
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), ...style });
  return runs;
}
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
const isTableLine = (line: string | undefined) => line?.trim().startsWith("|") ?? false;
const isRule = (line: string | undefined) => isTableLine(line) && cells(line!).every((cell) => /^:?-{3,}:?$/.test(cell));

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

/** Inverse of a parsed line: adjacent runs of one style merge, the size tag wraps the bold marks. */
export function formatReportLine(runs: readonly TextRun[]): string {
  let out = "";
  for (let index = 0; index < runs.length;) {
    const size = runs[index].size;
    let inner = "";
    for (; index < runs.length && runs[index].size === size;) {
      const bold = runs[index].bold;
      let chunk = "";
      for (; index < runs.length && runs[index].size === size && runs[index].bold === bold; index++) chunk += runs[index].text;
      inner += bold && chunk ? `**${chunk}**` : chunk;
    }
    out += size && inner ? `<${size}>${inner}</${size}>` : inner;
  }
  return out;
}
