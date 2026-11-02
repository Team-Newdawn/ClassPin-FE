"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { List, Plus, Sparkles, Square, Trash2 } from "@/app/component/icons";
import { LoadingScreen } from "@/app/component/loading-screen";
import { ExportDialog } from "@/app/component/export-dialog";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { reportMessage, reportRequest, type SaveState } from "@/app/_controller/use-report";
import { CHAT_QUESTIONS_PER_REPORT, METRIC_NONE, formatReportLine, parseReportText, REPORT_LIMITS, REPORT_LINK, reportAge, reportDate, type ReportMetrics, CHAT_FILE_ACCEPT, type DraftProgress, type ReportProposal, type ReportSection, type TextRun } from "@/app/_model/report";
import { useReportEditorController } from "./controller";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { ReportSwitcher } from "./component/report-switcher";
import { summarizeEndReport } from "@/app/_model/stats";
import type { ClassSession } from "@/app/_model/types";
import styles from "./page.module.css";

// `next dev` has no AI question limit (the server skips CHAT_LIMIT there).
const unlimited = process.env.NODE_ENV === "development";
const questionsLabel = (left: number) => unlimited ? "질문 제한 없음(개발)" : `남은 질문 ${left}/${CHAT_QUESTIONS_PER_REPORT}`;
const saveLabel: Record<SaveState, string> = { saved: "저장됨", saving: "저장 중", failed: "저장 실패", conflict: "다른 곳에서 수정됨" };
const pad = (value: number) => String(value).padStart(2, "0");
const untitled = (title: string) => title || "제목 없는 섹션";
/** AI answers may emphasize with **bold**; everything else stays plain text. */
const emphasized = (text: string) => text.split(/\*\*([\s\S]+?)\*\*/g).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part);

/** Titles wrap like the PDF heading but stay one paragraph: Enter does not add a line. */
const singleLine = (event: React.KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter") event.preventDefault(); };
/** Grows with its text: CSS field-sizing where supported, otherwise its scroll height on every value change. */
function GrowingText(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node || CSS.supports("field-sizing", "content")) return;
    node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={box} rows={2} {...props} />;
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
// Legacy <font size> is what execCommand("fontSize") writes, so typed and loaded text share one markup: 5 big, 3 normal, 2 small.
const runsHtml = (runs: readonly TextRun[]) => runs.map((run) => {
  let html = escapeHtml(run.text);
  if (run.bold) html = `<b>${html}</b>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<i>${html}</i>`;
  // A read-only body follows its links in a new tab; an editable one never follows them.
  if (run.link) html = `<a href="${escapeHtml(run.link)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
  return run.size ? `<font size="${run.size === "big" ? 5 : 2}">${html}</font>` : html;
}).join("");
/** RPT-024 to editor HTML, built only from parsed and escaped text. Every line ends in <br>; a table is a read-only island that keeps its source. */
function bodyHtml(text: string) {
  if (!text) return "";
  const blocks = parseReportText(text);
  return blocks.map((block) => block.kind === "line" ? `${runsHtml(block.runs)}<br>`
    : `<div contenteditable="false" data-table="${escapeHtml(block.source)}"><table>${block.rows.map((row, index) =>
      `<tr>${row.map((cell) => index ? `<td>${runsHtml(cell)}</td>` : `<th>${runsHtml(cell)}</th>`).join("")}</tr>`).join("")}</table></div>`).join("")
    // Lets the caret land after a trailing table or on a trailing empty line.
    + (blocks.at(-1)!.kind === "table" || blocks.at(-1)!.source === "" ? "<br>" : "");
}
/** Editor DOM back to RPT-024 text: <br> ends a line, blocks (div, p, a table island) start their own. */
function bodyText(root: HTMLElement) {
  const lines: (TextRun[] | string)[] = [];
  let current: TextRun[] | null = null;
  const walk = (node: Node, style: Omit<TextRun, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) { (current ??= []).push({ text: node.textContent ?? "", ...style }); return; }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") { lines.push(current ?? []); current = null; return; }
    const table = node.dataset.table, block = table !== undefined || /^(DIV|P)$/.test(node.tagName);
    if (block && current) { lines.push(current); current = null; }
    if (table !== undefined) { lines.push(...table.split("\n")); return; }
    const size = Number(node.tagName === "FONT" ? node.getAttribute("size") : NaN);
    const tag = node.tagName, href = tag === "A" ? node.getAttribute("href") ?? "" : "";
    const next = { ...style, ...(/^(B|STRONG)$/.test(tag) && { bold: true as const }), ...(/^(I|EM)$/.test(tag) && { italic: true as const }),
      ...tag === "U" && { underline: true as const }, ...REPORT_LINK.test(href) && { link: href } };
    if (size) { delete next.size; if (size >= 4) next.size = "big"; else if (size <= 2) next.size = "small"; }
    node.childNodes.forEach((child) => walk(child, next));
    if (block && current) { lines.push(current); current = null; }
  };
  root.childNodes.forEach((child) => walk(child, {}));
  if (current) lines.push(current);
  return lines.map((line) => typeof line === "string" ? line : formatReportLine(line)).join("\n");
}

/** RPT-103: a section body with visible formatting. The DOM is rebuilt only when the text changes from outside (AI apply, undo, reload). */
const skeleton = (key: number) => <div key={key} className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div>;
const DRAFT_STEP = { render: "슬라이드를 준비하는 중", slides: "슬라이드를 분석하는 중", body: "슬라이드 분석을 마쳤어요. 본문을 쓰는 중" } as const;

/** RPT-032: the running draft's step, then its slide sections (read-only) while the body is still being written. */
function DraftProgressView({ progress, busy, onCancel }: { progress: DraftProgress | null; busy: boolean; onCancel: () => void }) {
  const preview = progress?.step === "body" ? progress.preview.sections : [];
  return <>
    <p role="status" className={styles.progress}>{progress ? DRAFT_STEP[progress.step] + (progress.step === "slides" ? ` (${progress.done}/${progress.total}장)` : "") + ". "
      : "AI가 자료와 질문을 읽고 초안을 만드는 중입니다. "}보통 1분 안에 끝나며, 창을 닫아도 계속됩니다.</p>
    {progress?.step === "slides" ? <progress className={styles.progressBar} aria-label="슬라이드 분석 진행률" value={progress.done} max={progress.total} />
      : <progress className={styles.progressBar} aria-label="초안 생성 중" />}
    <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>{busy ? "취소하는 중…" : "초안 생성 취소"}</button>
    {!preview.length ? [0, 1, 2].map(skeleton) : <>
      {/* The body sections go between the overview and the slide sections, as in the finished document. */}
      {[preview[0], null, ...preview.slice(1)].map((section, index) => section
        ? <section key={section.id} className={styles.section} aria-label={`미리보기: ${section.title}`}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
          <RichText value={section.text} label={`${section.title} 본문 미리보기`} readOnly onChange={() => {}} />
        </section>
        : skeleton(index))}
    </>}
  </>;
}

function RichText({ value, onChange, readOnly, label }: { value: string; onChange: (text: string) => void; readOnly: boolean; label: string }) {
  const box = useRef<HTMLDivElement>(null), emitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (box.current && value !== emitted.current) { box.current.innerHTML = bodyHtml(value); emitted.current = value; }
  }, [value]);
  const emit = () => {
    const text = bodyText(box.current!);
    // The textarea's maxLength: refuse the edit rather than save a section the server rejects.
    if (text.length > REPORT_LIMITS.sectionText) { document.execCommand("undo"); return; }
    emitted.current = text; onChange(text);
  };
  return <div ref={box} className={styles.text} role="textbox" aria-multiline="true" aria-label={label} aria-readonly={readOnly || undefined}
    contentEditable={!readOnly} suppressContentEditableWarning data-rich-text onInput={emit}
    // One markup for line breaks (<br>), never the browser's paragraph <div>s.
    onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); document.execCommand("insertLineBreak"); } }}
    // RPT-103: pasted or dropped formatting is dropped; tables only come from the AI.
    onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); }}
    onDrop={(event) => event.preventDefault()} />;
}

const STYLES = [["5", "제목"], ["3", "본문"], ["2", "작게"]] as const;
const editorIcon = (name: string, size = 16) => <Image src={`/assets/design/report-editor/${name}.svg`} alt="" width={size} height={size} />;
/** The start of the caret's line: just after the last <br> or table island before it, else the body's start. */
function lineStart(host: HTMLElement, caret: Range) {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT,
    { acceptNode: (node) => node.nodeName === "BR" || (node as HTMLElement).dataset.table !== undefined ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
  const start = document.createRange(), probe = document.createRange();
  start.setStart(host, 0);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    probe.setStartAfter(node);
    if (probe.compareBoundaryPoints(Range.START_TO_START, caret) > 0) break;
    start.setStartAfter(node);
  }
  return start;
}

/**
 * RPT-103/111 (Figma ClassPin 2224:2357): text style, bold and a "- " list item act on the last selection made in any section
 * body, so keyboard users can select, then tab here. Tables stay AI-only: the table button asks the AI chat for one.
 */
function FormatBar({ onTable, tableDisabled }: { onTable: () => void; tableDisabled: boolean }) {
  const saved = useRef<Range | null>(null);
  const [state, setState] = useState<{ bold: boolean; italic: boolean; underline: boolean; linked: boolean; size: "5" | "3" | "2" } | null>(null);
  const [linking, setLinking] = useState(false), [url, setUrl] = useState(""), [urlError, setUrlError] = useState("");
  useEffect(() => {
    const track = () => {
      const selection = getSelection(), node = selection?.rangeCount ? selection.anchorNode : null;
      const element = node instanceof Element ? node : node?.parentElement;
      if (!element?.closest("[data-rich-text]")) return;
      saved.current = selection!.getRangeAt(0).cloneRange();
      const size = Number(element.closest("font[size]")?.getAttribute("size") ?? 3);
      setState({ bold: Boolean(element.closest("b,strong")), italic: Boolean(element.closest("i,em")), underline: Boolean(element.closest("u")),
        linked: Boolean(element.closest("a")), size: size >= 4 ? "5" : size <= 2 ? "2" : "3" });
    };
    document.addEventListener("selectionchange", track);
    return () => document.removeEventListener("selectionchange", track);
  }, []);
  const restore = () => {
    const range = saved.current, start = range?.startContainer;
    const host = (start instanceof Element ? start : start?.parentElement)?.closest<HTMLElement>("[data-rich-text]");
    if (!range || !host?.isContentEditable) return null;
    host.focus({ preventScroll: true }); getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
    return { host, range };
  };
  const apply = (command: string, value?: string) => {
    if (!restore()) return;
    document.execCommand("styleWithCSS", false, "false"); document.execCommand(command, false, value);
  };
  const bullet = () => {
    const target = restore();
    if (!target) return;
    getSelection()!.removeAllRanges(); getSelection()!.addRange(lineStart(target.host, target.range));
    document.execCommand("insertText", false, "- ");
  };
  /** RPT-024: http(s) only. A collapsed caret inserts the address itself as the link text. */
  const addLink = () => {
    const target = url.trim();
    if (!REPORT_LINK.test(target) || !URL.canParse(target)) { setUrlError("http:// 또는 https://로 시작하는 주소를 넣어 주세요."); return; }
    const selected = restore();
    if (!selected) return;
    if (selected.range.collapsed) document.execCommand("insertHTML", false, `<a href="${escapeHtml(target)}">${escapeHtml(target)}</a>`);
    else document.execCommand("createLink", false, target);
    setLinking(false); setUrl(""); setUrlError("");
  };
  const unlink = () => {
    const selected = restore(), start = selected?.range.startContainer;
    const anchor = (start instanceof Element ? start : start?.parentElement)?.closest("a");
    if (!anchor) return;
    const range = document.createRange(); range.selectNode(anchor);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range); document.execCommand("unlink");
  };
  const closeLink = () => { setLinking(false); setUrl(""); setUrlError(""); };
  // preventDefault on mousedown keeps the body's selection when a button is clicked; the select and the address field need theirs.
  return <div role="toolbar" aria-label="본문 서식" className={styles.formatBar}
    onMouseDown={(event) => { if (!(event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)) event.preventDefault(); }}>
    <span className={styles.styleSelect}>
      <select aria-label="글자 스타일" disabled={!state} value={state?.size ?? "3"} onChange={(event) => apply("fontSize", event.target.value)}>
        {STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>{editorIcon("chev", 12)}</span>
    <i aria-hidden="true" />
    <button type="button" aria-pressed={state?.bold ?? false} disabled={!state} aria-label="굵게" title="굵게 (Ctrl/⌘+B)" onClick={() => apply("bold")}><b>B</b></button>
    <button type="button" aria-pressed={state?.italic ?? false} disabled={!state} aria-label="기울임" title="기울임 (Ctrl/⌘+I)" onClick={() => apply("italic")}><em>I</em></button>
    <button type="button" aria-pressed={state?.underline ?? false} disabled={!state} aria-label="밑줄" title="밑줄 (Ctrl/⌘+U)" onClick={() => apply("underline")}><u>U</u></button>
    <i aria-hidden="true" />
    <button type="button" disabled={!state} aria-label="글머리 기호 넣기" title="글머리 기호" onClick={bullet}>{editorIcon("list")}</button>
    <button type="button" disabled={tableDisabled} aria-label="AI에게 표로 정리 요청" title="표는 AI가 만들어요" onClick={onTable}>{editorIcon("table")}</button>
    <button type="button" aria-pressed={state?.linked ?? false} disabled={!state} aria-label={state?.linked ? "링크 빼기" : "링크 넣기"} title={state?.linked ? "링크 빼기" : "링크"}
      aria-expanded={state?.linked ? undefined : linking} onClick={() => state?.linked ? unlink() : setLinking(!linking)}>{editorIcon("link")}</button>
    {linking ? <form className={styles.linkForm} onSubmit={(event) => { event.preventDefault(); addLink(); }}>
      <input autoFocus type="url" inputMode="url" value={url} placeholder="https://" aria-label="링크 주소" aria-invalid={Boolean(urlError) || undefined} aria-describedby={urlError ? "report-link-error" : undefined}
        onChange={(event) => { setUrl(event.target.value); setUrlError(""); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeLink(); } }} />
      <button type="submit">넣기</button><button type="button" onClick={closeLink}>취소</button>
      {urlError && <span id="report-link-error" role="alert">{urlError}</span>}
    </form> : <span className={styles.formatHint}>문서를 직접 클릭해서 수정할 수도 있어요</span>}
  </div>;
}

/**
 * RPT-102 (Figma ClassPin 2224:2401/2417): four KPI cards from the document's snapshot metrics, then the three slides with the
 * most questions. Slides with PINs and the bars come from the live material (the lecture has ended), so they are editor-only.
 */
function DocSummary({ metrics, material }: { metrics: ReportMetrics; material: ClassSession | undefined }) {
  const pinned = material ? new Set(material.questions.filter((question) => question.x !== null).map((question) => question.slideIndex)).size : null;
  const counts = material ? summarizeEndReport(material.slides.length, material.questions).counts : [];
  const top = counts.map((count, index) => ({ count, index })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count || a.index - b.index).slice(0, 3);
  const kpis: [string | null, string][] = [[`${metrics.questions}`, "총 질문"], [metrics.audience === null ? null : `${metrics.audience}`, "참여자"],
    [pinned === null ? null : `${pinned} / ${metrics.slides}`, "핀이 찍힌 슬라이드"], [`${metrics.reactions}`, "공감 수"]];
  return <>
    <dl className={styles.kpis}>{kpis.map(([value, label]) => <div key={label}>
      <dd className={value === null ? styles.none : undefined}>{value ?? METRIC_NONE}</dd><dt>{label}</dt></div>)}</dl>
    {top.length > 0 && <figure className={styles.bars}>
      <figcaption>질문이 몰린 슬라이드</figcaption>
      <ol>{top.map(({ count, index }, rank) => <li key={index}>
        <span className={styles.page}>P.{index + 1}</span>
        <span className={styles.barTitle} title={material!.slides[index]?.title}>{material!.slides[index]?.title || `슬라이드 ${index + 1}`}</span>
        <span className={styles.track} aria-hidden="true"><span data-top={rank === 0 || undefined} style={{ width: `${(count / top[0].count) * 100}%` }} /></span>
        <b>{count}건</b>
      </li>)}</ol>
    </figure>}
  </>;
}

function ProposalCard({ proposal, sections, applied, canUndo, disabled, onApply, onUndo }: {
  proposal: ReportProposal; sections: ReportSection[]; applied: boolean; canUndo: boolean; disabled: boolean; onApply: () => void; onUndo: () => void;
}) {
  const current = (id: string) => untitled(sections.find((section) => section.id === id)?.title ?? "");
  const summary = [proposal.replace.length && `${proposal.replace.length}개 수정`, proposal.insert.length && `${proposal.insert.length}개 추가`,
    proposal.remove.length && `${proposal.remove.length}개 삭제`].filter(Boolean).join(" · ");
  return <div className={styles.proposal}>
    <b>변경안 · 섹션 {summary}</b>
    <ul>
      {proposal.replace.map((item) => <li key={`r-${item.id}`}>수정: {untitled(item.title)}</li>)}
      {proposal.insert.map((item, index) => <li key={`i-${index}`}>추가: {untitled(item.title)}</li>)}
      {proposal.remove.map((id) => <li key={`d-${id}`}>삭제: {current(id)}</li>)}
    </ul>
    {applied
      ? <p>적용됨 · <button type="button" className="btn tertiary" disabled={!canUndo || disabled} onClick={onUndo}>되돌리기</button></p>
      : <button type="button" className="btn primary" disabled={disabled} onClick={onApply}>문서에 적용</button>}
  </div>;
}

export default function ReportEditorPage() {
  const c = useReportEditorController();
  const { report, doc, sections, material, pending, busy } = c;
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [pending, report?.messages]);

  if (!report) return c.loadError
    ? <main className={styles.missing}><p role="alert">{c.loadError}</p><Link className="btn secondary" href="/admin/reports">리포트 목록으로</Link></main>
    : <LoadingScreen />;
  // Only drafting locks the document; a report with one stays editable whatever its status.
  const editable = Boolean(doc) && report.status !== "drafting", locked = busy || !editable, canChat = editable && !busy;

  return <main className={`${styles.root} ${c.sidebarOpen ? "" : styles.collapsed}`}>
    <FolderTreeSidebar folders={c.folders} open={c.sidebarOpen} onToggle={c.toggleSidebar} />
    {/* RPT-100/105, Figma ClassPin 2224:2222: the document canvas and the AI chat are two rounded boxes. */}
    <div className={styles.workspace} data-chat={c.chatOpen || undefined}>
    <section className={styles.canvas} aria-label="리포트 작성">
    <header className={styles.header}>
      <button type="button" className={styles.iconButton} aria-expanded={c.tocOpen} aria-controls="report-toc" aria-label={c.tocOpen ? "목차 닫기" : "목차 열기"} onClick={c.toggleToc}><List /></button>
      <ReportSwitcher reportId={report.id} materialId={report.materialId} title={doc?.title || report.title} />
      {editable && <span role="status" className={styles.saveState} data-state={c.saveState}>{c.saveState === "saved" ? reportAge(report.updatedAt) : saveLabel[c.saveState]}</span>}
      <div className={styles.actions}>
        {/* RPT-043: one server-side step; undoing again restores the newer document. Typing keeps the browser's own undo. */}
        <button type="button" className={styles.iconButton} aria-label="AI 변경 되돌리기" title="AI 변경 되돌리기" disabled={!editable || busy || !report.canUndo || c.undone} onClick={c.undo}>{editorIcon("undo")}</button>
        <button type="button" className={`${styles.iconButton} ${styles.redo}`} aria-label="AI 변경 다시 적용" title="AI 변경 다시 적용" disabled={!editable || busy || !report.canUndo || !c.undone} onClick={c.undo}>{editorIcon("undo")}</button>
        <button type="button" className={`btn secondary ${styles.share}`} aria-haspopup="dialog" disabled={!editable} onClick={() => c.setExportOpen(true)}>{editorIcon("share")}공유</button>
        {!c.chatOpen && <button id="report-chat-open" type="button" className={`${styles.iconButton} ${styles.openChat}`} aria-expanded={false} aria-controls="report-chat" aria-label="AI 리포트 도우미 열기" title="AI 리포트 도우미" onClick={c.toggleChat}>
          <Image src="/assets/design/spark.svg" alt="" width={14} height={14} /></button>}
      </div>
    </header>
    {c.conflict && <div role="alert" className={styles.banner}>
      <p>다른 곳에서 수정됨. 이 화면의 내용으로 저장하거나, 최신 내용을 불러오세요(불러오면 이 화면에서 고친 내용은 사라집니다).</p>
      <button type="button" className="btn primary" onClick={c.keepMine}>내 내용으로 저장</button>
      <button type="button" className="btn secondary" onClick={c.loadLatest}>최신 내용 불러오기</button>
    </div>}
    {c.error && <div role="alert" className={styles.banner} data-tone="error"><p>{c.error}</p></div>}

    {doc && editable && !locked && <FormatBar tableDisabled={!canChat || Boolean(pending)} onTable={() => {
          if (!c.chatOpen) c.toggleChat();
          c.setDraft("이 섹션의 핵심 수치와 비교 내용을 표로 정리해줘.");
          document.getElementById("report-chat-input")?.focus();
        }} />}
    <div className={styles.canvasBody}>
      {c.tocOpen && <nav id="report-toc" className={styles.toc} aria-label="목차">
        <ol>{sections.map((section, index) => <li key={section.id}>
          <button type="button" aria-current={c.active?.id === section.id ? "location" : undefined} onClick={() => c.goToSection(section.id)}><span>{pad(index + 1)}</span>{untitled(section.title)}</button>
        </li>)}</ol>
      </nav>}

      <section className={styles.doc} aria-label="리포트 문서" onScroll={c.trackSection}>

        <article className={styles.paper}>
          {report.status === "drafting" && <DraftProgressView progress={report.progress ?? null} busy={busy} onCancel={() => void c.cancel()} />}
          {report.status === "failed" && !doc && <div role="alert" className={styles.failed}>
            <p>{reportMessage(report.error)}</p>
            <div><button type="button" className="btn primary" disabled={busy} onClick={() => c.retry()}>다시 시도</button>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => c.retry(true)}>수치만으로 시작</button></div>
          </div>}
          {doc && editable && <>
            <p className={styles.label}>{report.template !== "blank" && editorIcon("spark", 11)}{report.template === "blank" ? "강의 리포트" : "AI 강의 리포트"}</p>
            <GrowingText rows={1} className={styles.title} onKeyDown={singleLine} value={doc.title} maxLength={REPORT_LIMITS.title} aria-label="리포트 제목" placeholder="리포트 제목" readOnly={locked} onChange={(event) => c.setTitle(event.target.value)} />
            <p className={styles.meta}>{[reportDate(doc.metrics), doc.metrics.durationMinutes !== null && `진행 ${doc.metrics.durationMinutes}분`,
              doc.metrics.audience !== null && `참여 ${doc.metrics.audience}명`, `질문 ${doc.metrics.questions}건`].filter(Boolean).join(" · ")}</p>
            <DocSummary metrics={doc.metrics} material={material} />
            {sections.map((section, index) => {
              const number = pad(index + 1), slide = section.slide ? material?.slides[section.slide - 1] : undefined;
              const edited = c.edited.has(section.id);
              return <section key={section.id} id={`section-${section.id}`} data-section={section.id} className={styles.section} data-edited={edited || undefined} aria-label={`섹션 ${number}`}>
                {edited && <p className={styles.editedTag}>{editorIcon("spark", 11)}방금 AI가 수정함</p>}
                <div className={styles.sectionHead}><span aria-hidden="true">{index + 1}.</span><GrowingText rows={1} id={`section-title-${section.id}`} className={styles.sectionTitle} onKeyDown={singleLine} value={section.title} maxLength={REPORT_LIMITS.title} placeholder="섹션 제목"
                  aria-label={`섹션 ${number} 제목`} readOnly={locked} onChange={(event) => c.updateSection(section.id, { title: event.target.value })} />{!locked && <button type="button" className={styles.removeSection} aria-label={`섹션 ${number} 삭제`} title="섹션 삭제" onClick={() => c.removeSection(section.id)}><Trash2 aria-hidden="true" /></button>}</div>
                {section.slide && <p className={styles.slideRef}>슬라이드 {section.slide}</p>}
                {slide && <div className={styles.slide}><SlideCanvas slide={slide} compact /></div>}
                <RichText value={section.text} label={`섹션 ${number} 본문`} readOnly={locked} onChange={(text) => c.updateSection(section.id, { text })} />
              </section>;
            })}
            {c.removed && <p role="status" className={styles.removedNote}>‘{untitled(c.removed.section.title)}’ 섹션을 지웠어요.
              <button id="report-restore-section" type="button" className="btn tertiary" disabled={locked} onClick={c.restoreSection}>되돌리기</button></p>}
            {!locked && sections.length < REPORT_LIMITS.sections && <button type="button" className={`btn secondary ${styles.add}`} onClick={c.addSection}><Plus />섹션 추가</button>}
          </>}
        </article>
      </section>

    </div>
    </section>

      <aside id="report-chat" className={styles.chat} data-open={c.chatOpen} aria-label="AI 리포트 도우미">
        <div className={styles.chatHead}>
          <button type="button" className={styles.sheetToggle} aria-expanded={c.chatOpen} aria-controls="report-chat-body" onClick={c.toggleChat}><Sparkles aria-hidden="true" />AI 리포트 도우미 · {questionsLabel(report.questionsLeft)}</button>
          <h2><span className={styles.avatar}><Image src="/assets/design/spark.svg" alt="" width={14} height={14} /></span>AI 리포트 도우미</h2>
          {report.messages.length > 0 && <button type="button" className="btn tertiary" disabled={Boolean(pending) || busy} onClick={c.reset}>새 대화</button>}
          <button type="button" className={`${styles.iconButton} ${styles.closeChat}`} aria-expanded aria-controls="report-chat" aria-label="AI 리포트 도우미 닫기" title="닫기" onClick={c.toggleChat}>
            <Image src="/assets/design/report-chat/panel-collapse.svg" alt="" width={16} height={16} /></button>
        </div>
        <div id="report-chat-body" className={styles.chatBody}>
          <div role="log" aria-label="AI 대화 기록" aria-busy={Boolean(pending)} className={styles.log}>
            {!report.messages.length && !pending && <p className={styles.hint}>문서와 강의 데이터를 근거로 답합니다. 문서를 고쳐 달라고 하면 변경안을 제안합니다.</p>}
            {report.messages.map((message, index) => message.role === "user"
              ? <p key={index} className={styles.user}>{message.file && <span className={styles.sentFile}><Image src="/assets/design/report-chat/doc.svg" alt="" width={12} height={12} />{message.file.normalize("NFC")}</span>}{message.text}</p>
              : <article key={index} className={styles.answer} aria-label="AI 답변">{emphasized(message.text)}
                {message.proposal && <ProposalCard proposal={message.proposal} sections={sections} applied={Boolean(message.applied)} canUndo={report.canUndo}
                  disabled={!canChat || Boolean(pending)} onApply={() => c.apply(index)} onUndo={() => void c.undo()} />}</article>)}
            {pending && <><p className={styles.user}>{pending.question}</p>
              <article className={`${styles.answer} ${styles.streaming}`} aria-label="AI 답변">{pending.answer ? emphasized(pending.answer) : "답변을 준비하는 중…"}</article></>}
            <div ref={chatEnd} />
          </div>
          <p className="sr-only" role="status">{c.answerStatus}</p>
          {/* Figma ClassPin 2224:2305 (suggestions) and 2224:2313 (composer). */}
          {canChat && !pending && <div className={styles.suggestions} role="group" aria-label="추천 요청">
            {c.suggestions.map((item) => <button key={item.label} type="button" onClick={() => { c.setDraft(item.prompt); document.getElementById("report-chat-input")?.focus(); }}>{item.label}</button>)}
          </div>}
          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void c.submit(); }}>
            {c.file && <span className={styles.fileChip}><Image src="/assets/design/report-chat/doc.svg" alt="" width={12} height={12} /><span title={c.file.name}>{c.file.name.normalize("NFC")}</span>
              <button type="button" aria-label={`첨부 파일 ${c.file.name.normalize("NFC")} 빼기`} disabled={Boolean(pending)} onClick={c.clearFile}><Image src="/assets/design/report-chat/x.svg" alt="" width={12} height={12} /></button></span>}
            {c.fileError && <p role="alert" className={styles.fileError}>{c.fileError}</p>}
            <GrowingText id="report-chat-input" rows={1} value={c.draft} maxLength={2000} disabled={!canChat} placeholder="리포트를 어떻게 바꿀까요?"
              aria-label="AI에게 질문하거나 수정 요청 (Enter로 보내기, Shift+Enter로 줄바꿈)" onChange={(event) => c.setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className={styles.composerFoot}>
              <label className={styles.attach} title="파일 첨부 (PDF·이미지·텍스트)">
                <input type="file" className="sr-only" accept={CHAT_FILE_ACCEPT} disabled={!canChat || Boolean(pending)} aria-label="파일 첨부 (PDF, PNG·JPG, TXT·MD·CSV, 10MB 이하)"
                  onChange={(event) => { c.pickFile(event.target.files?.[0]); event.target.value = ""; }} />
                <Image src="/assets/design/report-chat/attach.svg" alt="" width={16} height={16} /></label>
              <span className={styles.dataChip}>
                <select value={c.withData ? "with" : "without"} disabled={!canChat || Boolean(pending)} aria-label="AI에 보낼 강의 데이터" onChange={(event) => c.setWithData(event.target.value === "with")}>
                  <option value="with">슬라이드·질문 데이터 포함</option><option value="without">문서만 사용</option>
                </select><Image src="/assets/design/report-chat/chev.svg" alt="" width={12} height={12} /></span>
              <span className={styles.left}>{questionsLabel(report.questionsLeft)}</span>
              {pending
                // preventDefault: React reuses this node as the submit button before the click's default action would resend.
                ? <button type="button" className={styles.send} aria-label="답변 중지" onClick={(event) => { event.preventDefault(); c.stopChat(); }}><Square /></button>
                : <button className={styles.send} aria-label="보내기" disabled={!canChat || !c.draft.trim() || (report.questionsLeft < 1 && !unlimited)}><Image src="/assets/design/report-chat/up.svg" alt="" width={16} height={16} /></button>}
            </div>
          </form>
        </div>
      </aside>
    </div>
    {c.exportOpen && <ExportDialog title="리포트 내보내기" subtitle={doc?.title || report.title} onClose={() => c.setExportOpen(false)}
      // RPT-060: unsaved edits are saved first, so the export is the document on screen.
      load={async (format, signal) => { await c.flush(); return reportRequest(`/api/admin/reports/${report.id}/export?format=${format}&preview=1`, { signal }); }}
      options={<section className={styles.exportDesign}><h3>리포트 디자인</h3><div><b>기본 디자인</b><p>현재 리포트 디자인을 그대로 사용합니다.</p></div></section>} />}
  </main>;
}
