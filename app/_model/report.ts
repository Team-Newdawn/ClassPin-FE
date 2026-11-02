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
export type ReportMessage = { role: "user" | "assistant"; text: string; createdAt: string; cleared?: true; pending?: true; proposal?: ReportProposal; applied?: true;
  /** RPT-057: name of the file sent with this question; the file itself is never stored. */ file?: string };
/** RPT-057: one file per question, sent to the AI for that question only. Claude takes images up to 5MB. */
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024, CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,application/pdf,image/png,image/jpeg,text/plain,text/markdown,text/csv";
export type ReportStatus = "drafting" | "failed" | "ready";
/**
 * RPT-036 (Figma ClassPin 2227:2258): the form the instructor picks. `prompt` steers the AI's body sections; `evidence` says which
 * code-built sections follow them (topic groups; all slides or only those with questions). `blank` never calls the AI.
 */
export const REPORT_TEMPLATES = {
  // RPT-036 보고용: fixed five-section layout (reportLayout); the AI writes only the participation reading, conclusion and follow-ups.
  executive: { label: "보고용", hint: "강의 결과를 담당자·상사에게 보고하는 개조식 문서", groups: false, slides: "none",
    prompt: "이번 리포트는 보고용이다. 독자는 강의를 듣지 않은 기관 담당자·상사·고객사이며, 읽고 결과를 확인한 뒤 후속 조치를 정한다. "
      + "아래 sections 일반 규칙보다 이 지시가 우선한다. sections는 정확히 3개를 이 순서로 쓴다: 1) title '참여 결과', text는 참여 수치(코드가 따로 넣는다)를 해석하는 1~2줄, "
      + "2) title '결론', text는 이번 강의에서 확인된 것 3줄 이내, 3) title '후속 조치 제안', text는 담당자가 승인·결정할 수 있는 조치 최대 3개이며 각 줄을 '- '로 시작한다. "
      + "모든 문장과 groups의 summary는 개조식(~함, ~임 같은 명사형 종결)으로 쓴다. 슬라이드별 상세, 질문 원문 나열, 답변 여부, 다른 강의와의 비교, '성공적' 같은 단정은 쓰지 않는다. 전체가 A4 1~2장에 들어가게 짧게 쓴다." },
  improvement: { label: "수업 개선용", hint: "질문이 몰린 슬라이드와 개선 제안 중심", groups: true, slides: "asked",
    prompt: "이번 리포트는 수업 개선용이다. 질문이 몰린 슬라이드와 그 이유, 다음 강의에서 바꿀 점을 중심으로 섹션 3~5개를 쓴다." },
  summary: { label: "한 장 요약", hint: "한 페이지에 숫자와 요약만 담기", groups: false, slides: "none",
    prompt: "이번 리포트는 한 장 요약이다. A4 한 장에 들어가도록 핵심 숫자와 요약만 섹션 2~3개, 섹션마다 5줄 이내로 쓴다." },
  blank: { label: "빈 문서에서 시작", hint: "AI 챗과 대화하며 처음부터 작성", groups: false, slides: "none", prompt: "" },
} as const;
export type ReportTemplate = keyof typeof REPORT_TEMPLATES;
export const isReportTemplate = (value: unknown): value is ReportTemplate => typeof value === "string" && Object.hasOwn(REPORT_TEMPLATES, value);
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
  id: string; materialId: string; /** null: made before templates, its form chosen by the AI (RPT-035). */ template: ReportTemplate | null; /** Lecture title and source file name captured when the report was created. */ title: string; fileName: string; status: ReportStatus; error: string | null; createdAt: string; updatedAt: string;
  document: ReportDocument | null; canUndo: boolean; messages: ReportMessage[]; questionsLeft: number;
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
export function draftReport(input: { title: string; metrics: ReportMetrics; analysis: InsightReportBody | null; questions: readonly DraftQuestion[]; template?: ReportTemplate | null;
  /** RPT-036 보고용 개요; absent for older callers. */ lecture?: ReportLecture }): ReportDocument {
  const sections = [section("개요", [overviewText(input.metrics)])], form = input.template ? REPORT_TEMPLATES[input.template] : null;
  if (input.template === "executive" && input.analysis) {
    sections.splice(0, 1, ...reportLayout(input.metrics, input.analysis, input.lecture));
  } else if (input.template === "blank" && !input.analysis) {
    // RPT-036: the overview only; the instructor writes the rest, with the AI chat.
  } else if (!input.analysis) {
    const pages = [...new Set(input.questions.map((q) => q.page))].sort((a, b) => a - b);
    sections.push(...pages.map((page) => section(`슬라이드 ${page}`, questionLines(input.questions.filter((q) => q.page === page), 10), page)));
  } else {
    const body = input.analysis, byId = new Map(body.questions.map((q) => [q.id, q]));
    sections.push(...body.sections.map((item) => section(item.title, [item.text])));
    for (const group of form && !form.groups ? [] : body.groups) {
      const quoted = group.questionIds.flatMap((id) => byId.get(id) ?? []).slice(0, 5);
      sections.push(section(`주제: ${group.title}`, [group.summary, quoted.length ? `대표 질문\n${quoted.map((q) => `- ${q.text}`).join("\n")}` : ""]));
    }
    for (const slide of form?.slides === "none" ? [] : body.slides) {
      const own = body.questions.filter((q) => q.page === slide.page);
      if (form?.slides === "asked" && !own.length) continue;
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

export type ReportLecture = { title: string; startedAt: string | null; folder: string | null };
const kst = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" });
/**
 * RPT-036 보고용: 개요 · 참여 결과 · 청중 관심사 Top 3 · 결론 · 후속 조치 제안, in this order and with these titles.
 * Numbers come from code; the AI's three sections are taken by position, whatever it titled them.
 */
function reportLayout(m: ReportMetrics, body: InsightReportBody, lecture?: ReportLecture): ReportSection[] {
  const none = "기록 없음", ai = (index: number) => body.sections[index]?.text ?? "";
  const started = Date.parse(lecture?.startedAt ?? "");
  const pinned = body.slides.filter((slide) => slide.metrics.positioned > 0).length;
  const byId = new Map(body.questions.map((q) => [q.id, q]));
  const top = [...body.groups].sort((a, b) => b.questionIds.length - a.questionIds.length).slice(0, 3);
  return [
    section("개요", [[`- 강의명: ${lecture?.title ?? none}`, `- 일시: ${Number.isFinite(started) ? kst.format(started) : none}`,
      `- 진행 시간: ${m.durationMinutes === null ? none : `${m.durationMinutes}분`}`, `- 대상·목적: ${lecture ? lecture.folder ?? "미분류" : none}`].join("\n")]),
    section("참여 결과", [[`- 참여자: ${m.audience === null ? none : `${m.audience}명${m.peakAudience === null ? "" : `(최대 동시 ${m.peakAudience}명)`}`}`,
      `- 질문: ${m.questions}건${m.audience ? `(1인당 ${(m.questions / m.audience).toFixed(1)}건)` : ""}`,
      `- 핀이 찍힌 슬라이드: ${pinned}/${m.slides}장${m.slides ? `(${Math.round((pinned / m.slides) * 100)}%)` : ""}`,
      `- 공감: ${m.reactions}개`].join("\n"), ai(0)]),
    section("청중 관심사 Top 3", top.length ? top.map((group, index) => {
      const quote = group.questionIds.flatMap((id) => byId.get(id) ?? []).sort((a, b) => b.reactions - a.reactions)[0];
      return [`${index + 1}. **${group.title}** (질문 ${group.questionIds.length}건)`, group.summary && `   - ${group.summary}`, quote && `   - 대표 질문: "${quote.text}"`].filter(Boolean).join("\n");
    }) : ["- 질문이 주제로 묶이지 않음"]),
    section("결론", [ai(1)]),
    section("후속 조치 제안", [ai(2)]),
  ];
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

/** Trust boundary for the analysis export (DSH-042): the caller's own numbers and text, checked for shape and size only. */
export function parseExportDocument(value: unknown): ReportDocument {
  const m = isRecord(value) && isRecord(value.metrics) ? value.metrics : null;
  if (!m || typeof m.at !== "string" || !Number.isFinite(Date.parse(m.at))) throw new Error("INVALID_DOCUMENT");
  const count = (item: unknown) => { if (!Number.isInteger(item) || (item as number) < 0) throw new Error("INVALID_DOCUMENT"); return item as number; };
  const recorded = (item: unknown) => item === null ? null : count(item);
  return parseReportDocument(value, { title: "", sections: [], metrics: { at: m.at, slides: count(m.slides), questions: count(m.questions), pins: count(m.pins),
    reactions: count(m.reactions), durationMinutes: recorded(m.durationMinutes), audience: recorded(m.audience), peakAudience: recorded(m.peakAudience) } });
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
