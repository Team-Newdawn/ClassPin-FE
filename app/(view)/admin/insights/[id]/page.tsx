"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { ChevronDown, ChevronLeft, ChevronRight, Download, MessageCircleQuestion, Sparkles } from "@/app/component/icons";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { ExportDialog } from "@/app/component/export-dialog";
import { reportRequest } from "@/app/_controller/use-report";
import { useLanguage } from "@/app/_controller/language-context";
import { EXPORT_LABELS, EXPORT_PARTS, useInsightsController, type ExportPart, type Section } from "./controller";
import type { TranslationKey } from "@/app/_model/i18n";
import { lectureWhen, PinFlow, ScoreBoard } from "./component/lecture-overview";
import shell from "../shell.module.css";
import styles from "./page.module.css";

const EXPORT_HINTS = { overview: "insight.hint.overview", flow: "insight.hint.flow", slides: "insight.hint.slides", questions: "insight.hint.questions" } as const satisfies Record<ExportPart, TranslationKey>;

export default function InsightsPage() {
  const c = useInsightsController();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [closed, setClosed] = useState<ReadonlySet<Section>>(new Set());
  const frame = (body: ReactNode) => <main className={`${shell.shell} ${c.sidebarOpen ? "" : shell.collapsed}`}>
    <FolderTreeSidebar folders={c.folders} open={c.sidebarOpen} onToggle={c.toggleSidebar} />
    <div className={shell.root}>{c.error && <p className={`${shell.error}`} role="alert">{t("insight.loadError", { error: c.error })}</p>}{body}</div>
  </main>;
  if (!c.session) return frame(c.ready ? <p className={shell.empty}>{t("insight.notFound")}</p> : <p role="status" className={shell.empty}>{t("insight.loading")}</p>);
  if (c.loading) return frame(<p role="status" className={shell.empty}>{t("insight.loading")}</p>);

  const { session } = c;
  /** DSH-046: the AI result is on its way; shimmering lines (bars for question types) under one spoken status line. */
  const waiting = (lines: number, bars = false) => <div className={styles.waiting}>
    <p role="status">{t("insight.analyzing")}</p>
    <div className={`${styles.skeleton} ${bars ? styles.skeletonBars : ""}`} aria-hidden="true">{Array.from({ length: lines }, (_, line) => <i key={line} />)}</div>
  </div>;
  // DSH-041: the report home opens with this material preselected (RPT-012).
  const reportHref = session.materialId ? `/admin/reports?material=${session.materialId}` : "/admin/reports";
  const card = (id: Section, title: string, sub: string, body: ReactNode) => <section className={styles.card} aria-labelledby={`${id}-title`}>
    <div className={styles.cardHead}>
      {/* DSH-045: every section folds from its title; open by default, not remembered. */}
      <div><h2 id={`${id}-title`}><button type="button" className={styles.toggle} aria-expanded={!closed.has(id)} aria-controls={`${id}-body`}
        onClick={() => setClosed((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; })}>{title}<ChevronDown aria-hidden="true" /></button></h2><p>{sub}</p></div>
      <button type="button" className={styles.export} onClick={() => c.openExport(id)} aria-label={t("insight.exportPart", { title })}><Download aria-hidden="true" />{t("insight.export")}</button>
    </div>
    <div id={`${id}-body`} className={styles.cardBody} hidden={closed.has(id)}>
      {/* DSH-046: the question summary waits for the AI result instead of flashing a fallback sentence. */}
      {id !== "overview" && id !== "slides" && !(id === "questions" && c.analyzing) && <p className={styles.summary}><span><Sparkles aria-hidden="true" />{t("insight.summary")}</span>{c.summaries[id]}</p>}
      {body}
    </div>
  </section>;

  return frame(<>
    <header className={styles.header}>
      <Link href="/admin/insights" className={styles.back} aria-label={t("insight.backToList")}><ChevronLeft aria-hidden="true" /></Link>
      <div className={styles.titleCol}>
        <nav aria-label={t("insight.breadcrumb")} className={styles.crumbs}><Link href="/admin/insights">{t("nav.insights")}</Link>{c.folderName && <span>{c.folderName}</span>}<span aria-current="page">{session.title}</span></nav>
        <div className={styles.titleRow}>
          <h1 title={session.title}>{session.title}</h1>
          {c.siblings.length > 1 && <label className={styles.switch}><ChevronDown aria-hidden="true" />
            <select value={session.id} onChange={(event) => router.push(`/admin/insights/${event.target.value}`)} aria-label={t("insight.switchMaterial")}>
              {c.siblings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>}
        </div>
      </div>
      <p className={styles.meta}>{[lectureWhen(c.date, locale), c.minutes !== null && t("insight.minutes", { count: c.minutes })].filter(Boolean).join(" · ")}</p>
      <div className={styles.actions}>
        {/* Figma ClassPin 2235:2476. */}
        <Link className={`btn secondary ${styles.aiButton}`} href={reportHref}><Image src="/assets/design/spark.svg" alt="" width={14} height={14} />{t("insight.createReport")}</Link>
        <button type="button" className="btn primary" onClick={() => c.openExport()}><Download aria-hidden="true" />{t("insight.exportAll")}</button>
      </div>
    </header>

    {card("overview", t("insight.part.overview"), t("insight.sub.overview"), <ScoreBoard board={c.board} />)}

    {card("flow", t("insight.part.flow"), t("insight.sub.flow"), <PinFlow perSlide={c.perSlide} />)}

    {card("slides", t("insight.part.slides"), t("insight.sub.slides"), !c.slide ? <p className={styles.empty}>{t("insight.noSlides")}</p> : <div className={styles.split}>
      <div className={styles.viewer}>
        <SlideCanvas slide={c.slide} showPins={false}>
          {c.slidePins.map((question) => <span key={question.id} className={styles.pinDot} style={{ left: `${question.x! * 100}%`, top: `${question.y! * 100}%` }} aria-hidden="true" />)}
        </SlideCanvas>
        <div className={styles.pager}>
          <button type="button" className={styles.pageButton} disabled={c.index === 0} onClick={() => c.select(c.index - 1)} aria-label={t("session.previousSlide")}><ChevronLeft aria-hidden="true" /></button>
          <span><b>{c.index + 1}</b> / {c.slideCount}</span>
          <button type="button" className={styles.pageButton} disabled={c.index >= c.slideCount - 1} onClick={() => c.select(c.index + 1)} aria-label={t("session.nextSlide")}><ChevronRight aria-hidden="true" /></button>
        </div>
        <ul className={styles.thumbs}>{session.slides.map((slide, index) => <li key={slide.id}>
          <button type="button" aria-pressed={index === c.index} aria-label={t("common.slideNumber", { number: index + 1 })} onClick={() => c.select(index)}>
            <span className={styles.mini}><SlideCanvas slide={slide} compact showPins={false} /></span><small>P.{index + 1}</small>
          </button>
        </li>)}</ul>
      </div>
      <div className={styles.slideSide}>
        <h3 className={styles.slideTitle}><span className={styles.chip}>P.{c.index + 1}</span>{c.slide.title || t("common.slideNumber", { number: c.index + 1 })}</h3>
        {/* DSH-040: counts live in the PIN flow chart above; this side is the slide's analysis and its PINs. */}
        {!c.slidePins.length ? <p className={styles.empty}>{t("insight.noPins")}</p> : <>
          <h4 className={styles.sideHead}>{t("insight.contentAnalysis")}</h4>
          {c.slideSummary ? <p className={styles.summary}><span><Sparkles aria-hidden="true" />{t("insight.aiSummary")}</span>{c.slideSummary}</p>
            : c.analyzing ? waiting(2) : <p className={styles.hint}>{c.slideNote}</p>}
          <div className={styles.listHead}><h4>PIN <span>{c.slidePins.length}</span></h4><small>{t("student.sortByEmpathy")}</small></div>
          <ul className={styles.slideQuestions}>{c.slidePins.map((question) => <li key={question.id}>
            <MessageCircleQuestion aria-hidden="true" /><p>{question.text}</p><small>{t("insight.empathy", { count: question.reactionCount })}</small>
          </li>)}</ul>
        </>}
      </div>
    </div>)}

    {card("questions", t("insight.part.questions"), t("insight.sub.questions"), <div className={styles.split}>
      <div className={styles.types}>
        <h3>{t("insight.questionTypes")}</h3>
        {c.types?.length ? <ul>{c.types.map((type) => <li key={type.key}>
          <button type="button" aria-pressed={c.detail?.key === type.key} onClick={() => c.pick(type.key)}>
            <span className={styles.typeRow}><span>{type.title}</span><small>{t("common.cases", { count: type.count })} · {type.percent}%</small></span>
            <i aria-hidden="true"><span style={{ width: `${c.types![0].count ? (type.count / c.types![0].count) * 100 : 0}%` }} /></i>
          </button>
        </li>)}</ul> : c.analyzing ? waiting(5, true) : <p className={styles.empty} role="status">{c.typesNote}</p>}
      </div>
      <div className={styles.typeSide}>
        {c.analyzing && <div className={styles.skeleton} aria-hidden="true">{[0, 1, 2, 3].map((line) => <i key={line} />)}</div>}
        {c.detail && <>
          <h4 className={styles.sideHead}>{c.detail.title} <span>{t("common.cases", { count: c.detail.count })}</span></h4>
          {c.detail.summary && <p className={styles.summary}><span><Sparkles aria-hidden="true" />{t("insight.aiSummary")}</span>{c.detail.summary}</p>}
          <p className={styles.hint}>{t("insight.typeSlides", { slides: c.detail.slides })}</p>
          <div className={styles.listHead}><h4>{t("insight.typeQuestions")} <span>{c.detail.questions.length}</span></h4><small>{t("student.sortByEmpathy")}</small></div>
          <ul className={styles.slideQuestions}>{c.detail.questions.map((question) => <li key={question.id}>
            <span className={styles.chip}>P.{question.slideIndex + 1}</span><p>{question.text}</p><small>{t("insight.empathy", { count: question.reactionCount })}</small>
          </li>)}</ul>
        </>}
      </div>
    </div>)}

    {c.exporting && <ExportDialog title={t(c.exporting.all ? "insight.exportAll" : "insight.export")} subtitle={session.title} reloadKey={c.exporting.parts.join()} onClose={c.closeExport}
      load={(format, signal) => reportRequest(`/api/admin/insights/export?format=${format}&preview=1`, { method: "POST", signal,
        body: JSON.stringify({ document: c.exportDocument(c.exporting!.parts), fileName: session.fileName }) })}
      options={<fieldset className={styles.exportParts}><legend>{t("insight.exportParts")}</legend>
        {EXPORT_PARTS.map((part) => {
          const checked = c.exporting!.parts.includes(part);
          // The last checked item stays: an export needs at least one.
          return <label key={part}><input type="checkbox" checked={checked} disabled={checked && c.exporting!.parts.length === 1} onChange={() => c.toggleExport(part)} />
            <span><b>{t(EXPORT_LABELS[part])}</b><small>{t(EXPORT_HINTS[part])}</small></span></label>;
        })}
      </fieldset>}
      note={t("insight.exportNote")}
      actions={<Link className={`btn secondary ${styles.aiButton}`} href={reportHref}><Sparkles aria-hidden="true" />{t("insight.continueReport")}</Link>} />}
  </>);
}
