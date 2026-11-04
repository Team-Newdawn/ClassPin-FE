"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { List, Sparkles, Square } from "@/app/component/icons";
import { LoadingScreen } from "@/app/component/loading-screen";
import { ExportDialog } from "@/app/component/export-dialog";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { reportMessage, reportRequest } from "@/app/_controller/use-report";
import { chartSvg } from "@/app/_model/report-chart";
import { CHAT_QUESTIONS_PER_REPORT, METRIC_NONE, parseReportText, reportDate, type ReportMetrics, CHAT_FILE_ACCEPT, type DraftProgress, type ReportSection, type TextRun } from "@/app/_model/report";
import { useReportEditorController } from "./controller";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { ReportSwitcher } from "./component/report-switcher";
import { ReportConfirmDialog } from "../component/report-confirm-dialog";
import { summarizeEndReport } from "@/app/_model/stats";
import type { ClassSession } from "@/app/_model/types";
import styles from "./page.module.css";

// `next dev` has no AI question limit (the server skips CHAT_LIMIT there).
const unlimited = process.env.NODE_ENV === "development";
const questionsLabel = (left: number) => unlimited ? "질문 제한 없음(개발)" : `남은 질문 ${left}/${CHAT_QUESTIONS_PER_REPORT}`;
const pad = (value: number) => String(value).padStart(2, "0");
const untitled = (title: string) => title || "제목 없는 섹션";
/** AI answers may emphasize with **bold**; everything else stays plain text. */
/** RPT-058: what the AI receives with a question; the menu shows the label and a one-line hint. */
const DATA_MODES = [{ value: true, label: "슬라이드·질문 데이터 포함", hint: "슬라이드 이미지와 질문 원문도 함께 보내요" },
  { value: false, label: "문서만 사용", hint: "리포트 문서만 보내요. 답이 빠르고 짧아요" }] as const;
const emphasized = (text: string) => text.split(/\*\*([\s\S]+?)\*\*/g).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part);

/** The chat input grows with its text: CSS field-sizing where supported, otherwise its scroll height on every value change. */
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
// Sizes map to <font size>: 5 big, 3 normal, 2 small.
const runsHtml = (runs: readonly TextRun[]) => runs.map((run) => {
  let html = escapeHtml(run.text);
  if (run.bold) html = `<b>${html}</b>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<i>${html}</i>`;
  // Links open in a new tab.
  if (run.link) html = `<a href="${escapeHtml(run.link)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
  return run.size ? `<font size="${run.size === "big" ? 5 : 2}">${html}</font>` : html;
}).join("");
/** RPT-024 to HTML, built only from parsed and escaped text. Every line ends in <br>. */
function bodyHtml(text: string) {
  if (!text) return "";
  const blocks = parseReportText(text);
  return blocks.map((block) => block.kind === "line" ? `${runsHtml(block.runs)}<br>`
    : `<div><table>${block.rows.map((row, index) =>
      `<tr>${row.map((cell) => index ? `<td>${runsHtml(cell)}</td>` : `<th>${runsHtml(cell)}</th>`).join("")}</tr>`).join("")}</table></div>`).join("");
}
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
          <ReportText value={section.text} />
        </section>
        : skeleton(index))}
    </>}
  </>;
}

/** RPT-008: a section body, read-only. bodyHtml escapes every piece of text it builds from. */
const ReportText = ({ value }: { value: string }) => <div className={styles.text} dangerouslySetInnerHTML={{ __html: bodyHtml(value) }} />;

const editorIcon = (name: string, size = 16) => <Image src={`/assets/design/report-editor/${name}.svg`} alt="" width={size} height={size} />;
/** RPT-037: the same SVG the file exports embed; chartSvg escapes every label. */
function ReportChart({ chart, title }: { chart: NonNullable<ReportSection["chart"]>; title: string }) {
  return chart.points.length ? <figure className={styles.chart} dangerouslySetInnerHTML={{ __html: chartSvg(chart.points, chart.kind, title).svg }} /> : null;
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

export default function ReportEditorPage() {
  const c = useReportEditorController();
  const { report, doc, sections, material, pending, busy } = c;
  const chatEnd = useRef<HTMLDivElement>(null), dataButton = useRef<HTMLButtonElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [pending, report?.messages]);

  if (!report) return c.loadError
    ? <main className={styles.missing}><p role="alert">{c.loadError}</p><Link className="btn secondary" href="/admin/reports">리포트 목록으로</Link></main>
    : <LoadingScreen />;
  // RPT-008: a report is read-only; it can be asked about once it has a document and no draft is running.
  const ready = Boolean(doc) && report.status !== "drafting", canChat = ready && !busy;

  return <main className={`${styles.root} ${c.sidebarOpen ? "" : styles.collapsed}`}>
    <FolderTreeSidebar folders={c.folders} open={c.sidebarOpen} onToggle={c.toggleSidebar} />
    {/* RPT-100/105, Figma ClassPin 2224:2222: the document canvas and the AI chat are two rounded boxes. */}
    <div className={styles.workspace} data-chat={c.chatOpen || undefined}>
    <section className={styles.canvas} aria-label="리포트">
    <header className={styles.header}>
      <button type="button" className={styles.iconButton} aria-expanded={c.tocOpen} aria-controls="report-toc" aria-label={c.tocOpen ? "목차 닫기" : "목차 열기"} onClick={c.toggleToc}><List /></button>
      <ReportSwitcher reportId={report.id} materialId={report.materialId} title={doc?.title || report.title} />
      <div className={styles.actions}>
        <button type="button" className={`btn secondary ${styles.share}`} aria-haspopup="dialog" disabled={!ready} onClick={() => c.setExportOpen(true)}>{editorIcon("share")}공유</button>
        {!c.chatOpen && <button id="report-chat-open" type="button" className={`${styles.iconButton} ${styles.openChat}`} aria-expanded={false} aria-controls="report-chat" aria-label="AI 리포트 도우미 열기" title="AI 리포트 도우미" onClick={c.toggleChat}>
          <Image src="/assets/design/spark.svg" alt="" width={14} height={14} /></button>}
      </div>
    </header>
    {c.error && <div role="alert" className={styles.banner} data-tone="error"><p>{c.error}</p></div>}

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
          {doc && ready && <>
            <p className={styles.label}>{editorIcon("spark", 11)}AI 강의 리포트</p>
            <h1 className={styles.title}>{doc.title}</h1>
            <p className={styles.meta}>{[reportDate(doc.metrics), doc.metrics.durationMinutes !== null && `진행 ${doc.metrics.durationMinutes}분`,
              doc.metrics.audience !== null && `참여 ${doc.metrics.audience}명`, `질문 ${doc.metrics.questions}건`].filter(Boolean).join(" · ")}</p>
            <DocSummary metrics={doc.metrics} material={material} />
            {sections.map((section, index) => {
              const slide = section.slide ? material?.slides[section.slide - 1] : undefined;
              return <section key={section.id} id={`section-${section.id}`} data-section={section.id} className={styles.section} tabIndex={-1} aria-labelledby={`section-title-${section.id}`}>
                <div className={styles.sectionHead}><span aria-hidden="true">{index + 1}.</span><h2 id={`section-title-${section.id}`} className={styles.sectionTitle}>{untitled(section.title)}</h2></div>
                {section.slide && <p className={styles.slideRef}>슬라이드 {section.slide}</p>}
                {slide && <div className={styles.slide}><SlideCanvas slide={slide} compact /></div>}
                {section.chart && <ReportChart chart={section.chart} title={section.title} />}
                <ReportText value={section.text} />
              </section>;
            })}
          </>}
        </article>
      </section>

    </div>
    </section>

      <aside id="report-chat" className={styles.chat} data-open={c.chatOpen} aria-label="AI 리포트 도우미">
        <div className={styles.chatHead}>
          <button type="button" className={styles.sheetToggle} aria-expanded={c.chatOpen} aria-controls="report-chat-body" onClick={c.toggleChat}><Sparkles aria-hidden="true" />AI 리포트 도우미 · {questionsLabel(report.questionsLeft)}</button>
          <h2><span className={styles.avatar}><Image src="/assets/design/spark.svg" alt="" width={14} height={14} /></span>AI 리포트 도우미</h2>
          {report.messages.length > 0 && <button type="button" className="btn tertiary" aria-haspopup="dialog" disabled={Boolean(pending) || busy} onClick={() => setResetOpen(true)}>새 대화</button>}
          <button type="button" className={`${styles.iconButton} ${styles.closeChat}`} aria-expanded aria-controls="report-chat" aria-label="AI 리포트 도우미 닫기" title="닫기" onClick={c.toggleChat}>
            <Image src="/assets/design/report-chat/panel-collapse.svg" alt="" width={16} height={16} /></button>
        </div>
        <div id="report-chat-body" className={styles.chatBody}>
          <div role="log" aria-label="AI 대화 기록" aria-busy={Boolean(pending)} className={styles.log}>
            {!report.messages.length && !pending && <p className={styles.hint}>리포트와 강의 데이터를 근거로 질문에 답합니다. 리포트 문서는 고치지 않아요.</p>}
            {report.messages.map((message, index) => message.role === "user"
              ? <p key={index} className={styles.user}>{message.file && <span className={styles.sentFile}><Image src="/assets/design/report-chat/doc.svg" alt="" width={12} height={12} />{message.file.normalize("NFC")}</span>}{message.text}</p>
              : <article key={index} className={styles.answer} aria-label="AI 답변">{emphasized(message.text)}</article>)}
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
            <GrowingText id="report-chat-input" rows={1} value={c.draft} maxLength={2000} disabled={!canChat} placeholder="리포트에 대해 무엇이든 물어보세요"
              aria-label="AI에게 질문 (Enter로 보내기, Shift+Enter로 줄바꿈)" onChange={(event) => c.setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className={styles.composerFoot}>
              <label className={styles.attach} title="파일 첨부 (PDF·이미지·텍스트)">
                <input type="file" className="sr-only" accept={CHAT_FILE_ACCEPT} disabled={!canChat || Boolean(pending)} aria-label="파일 첨부 (PDF, PNG·JPG, TXT·MD·CSV, 10MB 이하)"
                  onChange={(event) => { c.pickFile(event.target.files?.[0]); event.target.value = ""; }} />
                <Image src="/assets/design/report-chat/attach.svg" alt="" width={16} height={16} /></label>
              {/* RPT-058: a popover menu (Escape and outside clicks close it), opening upward from the composer. */}
              <button ref={dataButton} type="button" className={styles.dataChip} popoverTarget="report-data-menu" aria-haspopup="menu" disabled={!canChat || Boolean(pending)}
                aria-label={`AI에 보낼 강의 데이터: ${DATA_MODES.find((mode) => mode.value === c.withData)!.label}`} onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect(), menu = document.getElementById("report-data-menu");
                  if (menu) Object.assign(menu.style, { left: `${Math.max(8, Math.min(box.left, window.innerWidth - 268))}px`, bottom: `${window.innerHeight - box.top + 6}px` });
                }}><span>{DATA_MODES.find((mode) => mode.value === c.withData)!.label}</span><Image src="/assets/design/report-chat/chev.svg" alt="" width={12} height={12} /></button>
              <div id="report-data-menu" popover="auto" className={styles.dataMenu} role="menu" aria-label="AI에 보낼 강의 데이터"
                onToggle={(event) => { if (event.newState === "open") event.currentTarget.querySelector<HTMLElement>("[aria-checked=true]")?.focus(); }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  event.preventDefault();
                  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")], index = items.indexOf(document.activeElement as HTMLElement);
                  items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
                }}>
                {DATA_MODES.map((mode) => <button key={mode.label} type="button" role="menuitemradio" aria-checked={c.withData === mode.value} onClick={(event) => {
                  c.setWithData(mode.value); event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); dataButton.current?.focus();
                }}><span aria-hidden="true">{c.withData === mode.value ? "✓" : ""}</span><span><b>{mode.label}</b><small>{mode.hint}</small></span></button>)}
              </div>
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
    {resetOpen && <ReportConfirmDialog title="새 대화를 시작할까요?" description={`지금까지의 대화가 지워지고 되돌릴 수 없어요. 남은 질문 수(${questionsLabel(report.questionsLeft)})는 그대로예요.`}
      confirm={{ label: "새 대화", saving: "지우는 중…" }} saving={busy} error="" onClose={() => setResetOpen(false)}
      onConfirm={() => void c.reset().then(() => setResetOpen(false))} />}
    {c.exportOpen && <ExportDialog title="리포트 내보내기" subtitle={doc?.title || report.title} onClose={() => c.setExportOpen(false)}
      load={(format, signal) => reportRequest(`/api/admin/reports/${report.id}/export?format=${format}&preview=1`, { signal })}
      options={<section className={styles.exportDesign}><h3>리포트 디자인</h3><div><b>기본 디자인</b><p>현재 리포트 디자인을 그대로 사용합니다.</p></div></section>} />}
  </main>;
}
