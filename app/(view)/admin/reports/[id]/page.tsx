"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { ArrowLeft, ChevronDown, GripVertical, List, Plus, Send, Sparkles, Square } from "@/app/component/icons";
import { LoadingScreen } from "@/app/component/loading-screen";
import { ReportExportDialog } from "./component/report-export-dialog";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { reportMessage, reportRequest, type SaveState } from "@/app/_controller/use-report";
import { CHAT_QUESTIONS_PER_REPORT, METRIC_NONE, REDRAFTS_PER_REPORT, formatReportLine, metricRows, parseReportText, REPORT_LIMITS, reportDate, type ReportProposal, type ReportSection, type TextRun } from "@/app/_model/report";
import { CHAT_MAX, CHAT_MIN, useReportEditorController } from "./controller";
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
  const html = run.bold ? `<b>${escapeHtml(run.text)}</b>` : escapeHtml(run.text);
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
    const next = { ...style, ...(/^(B|STRONG)$/.test(node.tagName) ? { bold: true as const } : {}) };
    if (size) { delete next.size; if (size >= 4) next.size = "big"; else if (size <= 2) next.size = "small"; }
    node.childNodes.forEach((child) => walk(child, next));
    if (block && current) { lines.push(current); current = null; }
  };
  root.childNodes.forEach((child) => walk(child, {}));
  if (current) lines.push(current);
  return lines.map((line) => typeof line === "string" ? line : formatReportLine(line)).join("\n");
}

/** RPT-103: a section body with visible formatting. The DOM is rebuilt only when the text changes from outside (AI apply, undo, reload). */
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

const SIZES = [["크게", "5", "big"], ["보통", "3", undefined], ["작게", "2", "small"]] as const;
/** RPT-103: styles the last selection made in any section body, so keyboard users can select, then tab here. */
function FormatBar() {
  const saved = useRef<Range | null>(null);
  const [state, setState] = useState<{ bold: boolean; size?: "big" | "small" } | null>(null);
  useEffect(() => {
    const track = () => {
      const selection = getSelection(), node = selection?.rangeCount ? selection.anchorNode : null;
      const element = node instanceof Element ? node : node?.parentElement;
      if (!element?.closest("[data-rich-text]")) return;
      saved.current = selection!.getRangeAt(0).cloneRange();
      const size = Number(element.closest("font[size]")?.getAttribute("size") ?? 3);
      setState({ bold: Boolean(element.closest("b,strong")), size: size >= 4 ? "big" : size <= 2 ? "small" : undefined });
    };
    document.addEventListener("selectionchange", track);
    return () => document.removeEventListener("selectionchange", track);
  }, []);
  const apply = (command: string, value?: string) => {
    const range = saved.current, start = range?.startContainer;
    const host = (start instanceof Element ? start : start?.parentElement)?.closest<HTMLElement>("[data-rich-text]");
    if (!range || !host?.isContentEditable) return;
    host.focus({ preventScroll: true }); getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
    document.execCommand("styleWithCSS", false, "false"); document.execCommand(command, false, value);
  };
  // preventDefault on mousedown keeps the body's selection when a button is clicked.
  return <div role="toolbar" aria-label="본문 서식" className={styles.formatBar} onMouseDown={(event) => event.preventDefault()}>
    <button type="button" aria-pressed={state?.bold ?? false} disabled={!state} aria-label="굵게" title="굵게 (Ctrl/⌘+B)" onClick={() => apply("bold")}><b>B</b></button>
    {SIZES.map(([label, value, size]) => <button key={label} type="button" aria-pressed={Boolean(state) && state?.size === size} disabled={!state} onClick={() => apply("fontSize", value)}>{label}</button>)}
  </div>;
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
    ? <main className={styles.missing}><p role="alert">{c.loadError}</p><Link className="btn secondary" href="/admin/insights">인사이트로</Link></main>
    : <LoadingScreen />;
  // A failed redraft keeps the previous document, which stays editable (only drafting locks it).
  const editable = Boolean(doc) && report.status !== "drafting", locked = busy || !editable, canChat = editable && !busy;

  return <main className={styles.root}>
    <header className={styles.header}>
      <Link className={styles.back} href="/admin/insights"><ArrowLeft aria-hidden="true" />인사이트</Link>
      <button type="button" className={styles.iconButton} aria-expanded={c.tocOpen} aria-controls="report-toc" aria-label={c.tocOpen ? "목차 닫기" : "목차 열기"} onClick={c.toggleToc}><List /></button>
      <h1>{doc?.title || report.title}</h1>
      {editable && <span role="status" className={styles.saveState} data-state={c.saveState}>{saveLabel[c.saveState]}</span>}
      <div className={styles.actions}>
        <button type="button" className="btn secondary" disabled={!editable || busy || Boolean(pending) || (report.redraftsLeft < 1 && !unlimited)} onClick={() => c.redraft()}
          title={unlimited ? "초안 다시 만들기 제한 없음(개발)" : `남은 횟수 ${report.redraftsLeft}/${REDRAFTS_PER_REPORT}`}>
          초안 다시 만들기{unlimited ? "" : ` ${report.redraftsLeft}/${REDRAFTS_PER_REPORT}`}</button>
        <button type="button" className="btn primary" aria-haspopup="dialog" disabled={!editable} onClick={() => c.setExportOpen(true)}>내보내기<ChevronDown aria-hidden="true" /></button>
      </div>
    </header>
    {c.conflict && <div role="alert" className={styles.banner}>
      <p>다른 곳에서 수정됨. 이 화면의 내용으로 저장하거나, 최신 내용을 불러오세요(불러오면 이 화면에서 고친 내용은 사라집니다).</p>
      <button type="button" className="btn primary" onClick={c.keepMine}>내 내용으로 저장</button>
      <button type="button" className="btn secondary" onClick={c.loadLatest}>최신 내용 불러오기</button>
    </div>}
    {c.error && <div role="alert" className={styles.banner} data-tone="error"><p>{c.error}</p></div>}

    <div className={styles.body} style={{ "--chat-width": `${c.chatWidth}px` } as React.CSSProperties}>
      {c.tocOpen && <nav id="report-toc" className={styles.toc} aria-label="목차">
        <ol>{sections.map((section, index) => <li key={section.id}>
          <button type="button" aria-current={c.active?.id === section.id ? "location" : undefined} onClick={() => c.goToSection(section.id)}><span>{pad(index + 1)}</span>{untitled(section.title)}</button>
        </li>)}</ol>
      </nav>}

      <section className={styles.doc} aria-label="리포트 문서" onScroll={c.trackSection}>
        {doc && editable && !locked && <FormatBar />}
        <article className={styles.paper}>
          {report.status === "drafting" && <>
            <p role="status" className={styles.progress}>AI가 자료와 질문을 읽고 초안을 만드는 중입니다. 보통 1분 안에 끝나며, 창을 닫아도 계속됩니다.</p>
            <progress className={styles.progressBar} aria-label="초안 생성 중" />
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void c.cancel()}>{busy ? "취소하는 중…" : "초안 생성 취소"}</button>
            {[0, 1, 2].map((index) => <div key={index} className={styles.skeleton} aria-hidden="true"><span /><span /><span /></div>)}
          </>}
          {report.status === "failed" && doc && <div role="alert" className={styles.retry}>
            <p>{reportMessage(report.error)} 아래 문서는 그대로 남아 있습니다.</p>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => c.redraft()}>다시 시도</button>
          </div>}
          {report.status === "failed" && !doc && <div role="alert" className={styles.failed}>
            <p>{reportMessage(report.error)}</p>
            <div><button type="button" className="btn primary" disabled={busy} onClick={() => c.redraft()}>다시 시도</button>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => c.redraft(true)}>수치만으로 시작</button></div>
          </div>}
          {doc && editable && <>
            <p className={styles.label}>OhPin 리포트</p>
            <GrowingText rows={1} className={styles.title} onKeyDown={singleLine} value={doc.title} maxLength={REPORT_LIMITS.title} aria-label="리포트 제목" placeholder="리포트 제목" readOnly={locked} onChange={(event) => c.setTitle(event.target.value)} />
            <p className={styles.meta}>{report.fileName.normalize("NFC")} · {reportDate(doc.metrics)}</p>
            <dl className={styles.metrics}>{metricRows(doc.metrics).map(([label, value]) => <div key={label}>
              <dt>{label}</dt><dd className={value === METRIC_NONE ? styles.none : undefined}>{value}</dd>
            </div>)}</dl>
            {sections.map((section, index) => {
              const number = pad(index + 1), slide = section.slide ? material?.slides[section.slide - 1] : undefined;
              return <section key={section.id} id={`section-${section.id}`} data-section={section.id} className={styles.section} aria-label={`섹션 ${number}`}>
                <GrowingText rows={1} id={`section-title-${section.id}`} className={styles.sectionTitle} onKeyDown={singleLine} value={section.title} maxLength={REPORT_LIMITS.title} placeholder="섹션 제목"
                  aria-label={`섹션 ${number} 제목`} readOnly={locked} onChange={(event) => c.updateSection(section.id, { title: event.target.value })} />
                {section.slide && <p className={styles.slideRef}>슬라이드 {section.slide}</p>}
                {slide && <div className={styles.slide}><SlideCanvas slide={slide} compact /></div>}
                <RichText value={section.text} label={`섹션 ${number} 본문`} readOnly={locked} onChange={(text) => c.updateSection(section.id, { text })} />
              </section>;
            })}
            {!locked && sections.length < REPORT_LIMITS.sections && <button type="button" className={`btn secondary ${styles.add}`} onClick={c.addSection}><Plus />섹션 추가</button>}
          </>}
        </article>
      </section>

      <aside className={styles.chat} data-open={c.chatOpen} aria-label="AI 채팅">
        <div className={styles.resizer} role="separator" aria-orientation="vertical" aria-label="AI 채팅 패널 크기 조절" aria-valuemin={CHAT_MIN} aria-valuemax={CHAT_MAX}
          aria-valuenow={c.chatWidth} tabIndex={0} onPointerDown={c.startResize} onPointerMove={c.resize} onPointerUp={c.endResize} onPointerCancel={c.endResize} onKeyDown={c.resizeByKeyboard}><GripVertical /></div>
        <div className={styles.chatHead}>
          <button type="button" className={styles.sheetToggle} aria-expanded={c.chatOpen} aria-controls="report-chat-body" onClick={c.toggleChat}><Sparkles aria-hidden="true" />AI 채팅 · {questionsLabel(report.questionsLeft)}</button>
          <h2><Sparkles aria-hidden="true" />AI 채팅</h2>
          {report.messages.length > 0 && <button type="button" className="btn tertiary" disabled={Boolean(pending) || busy} onClick={c.reset}>새 대화</button>}
        </div>
        <div id="report-chat-body" className={styles.chatBody}>
          <div role="log" aria-label="AI 대화 기록" aria-busy={Boolean(pending)} className={styles.log}>
            {!report.messages.length && !pending && <p className={styles.hint}>문서와 강의 데이터를 근거로 답합니다. 문서를 고쳐 달라고 하면 변경안을 제안합니다.</p>}
            {report.messages.map((message, index) => message.role === "user"
              ? <p key={index} className={styles.user}>{message.text}</p>
              : <article key={index} className={styles.answer} aria-label="AI 답변">{emphasized(message.text)}
                {message.proposal && <ProposalCard proposal={message.proposal} sections={sections} applied={Boolean(message.applied)} canUndo={report.canUndo}
                  disabled={!canChat || Boolean(pending)} onApply={() => c.apply(index)} onUndo={() => void c.undo()} />}</article>)}
            {pending && <><p className={styles.user}>{pending.question}</p>
              <article className={`${styles.answer} ${styles.streaming}`} aria-label="AI 답변">{pending.answer ? emphasized(pending.answer) : "답변을 준비하는 중…"}</article></>}
            <div ref={chatEnd} />
          </div>
          <p className="sr-only" role="status">{c.answerStatus}</p>
          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void c.submit(); }}>
            <GrowingText rows={1} value={c.draft} maxLength={2000} disabled={!canChat} placeholder="질문하거나 수정을 요청하세요"
              aria-label="AI에게 질문하거나 수정 요청 (Enter로 보내기, Shift+Enter로 줄바꿈)" onChange={(event) => c.setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className={styles.composerFoot}>
              <span>{questionsLabel(report.questionsLeft)}</span>
              {pending
                // preventDefault: React reuses this node as the submit button before the click's default action would resend.
                ? <button type="button" className={styles.send} aria-label="답변 중지" onClick={(event) => { event.preventDefault(); c.stopChat(); }}><Square /></button>
                : <button className={styles.send} aria-label="보내기" disabled={!canChat || !c.draft.trim() || (report.questionsLeft < 1 && !unlimited)}><Send /></button>}
            </div>
          </form>
        </div>
      </aside>
    </div>
    {c.exportOpen && <ReportExportDialog reportId={report.id} title={doc?.title || report.title} request={reportRequest} beforeExport={c.flush} onClose={() => c.setExportOpen(false)} />}
  </main>;
}
