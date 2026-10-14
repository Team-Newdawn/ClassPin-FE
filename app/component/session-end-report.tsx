"use client";

import Image from "next/image";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { CLASS_FOLDER_DEFAULT_PURPOSE, type ClassSession } from "@/app/_model/types";
import styles from "./session-end-report.module.css";

import { summarizeEndReport } from "@/app/_model/stats";
import { REPORT_SECTIONS, SummaryError, summarizeReport, toSummaryItems, type ReportSections, type SummaryPurpose } from "@/app/_service/question-summary-service";

const REPORT_SUMMARY_LIMIT = 200;
const CHART_HEIGHT = 300;

export function SessionEndReport({ session, folder }: { session: ClassSession; folder: SummaryPurpose }) {
  const { t, locale } = useLanguage();
  const { counts, unmapped, maximum, topSlides, questionCount, reactionCount } = summarizeEndReport(session.slides.length, session.questions);
  // 공감이 많은 질문부터 최대 200개를 근거 페이지와 함께 보낸다.
  const itemsKey = JSON.stringify(toSummaryItems([...session.questions].sort((a, b) => b.reactionCount - a.reactionCount).slice(0, REPORT_SUMMARY_LIMIT)));
  const [attempt, setAttempt] = useState(0);
  const [summary, setSummary] = useState<{ key: string; status: "done" | "error" | "unconfigured"; report?: ReportSections }>();
  const purpose = folder?.purpose ?? null;
  const purposeLabel = folder?.purposeLabel ?? null;
  // 미분류 자료는 기본 목적(Q&A) 문구를 쓴다.
  const tone = purpose ?? CLASS_FOLDER_DEFAULT_PURPOSE;
  const items = t(`report.items.${tone}`);
  const summaryKey = `${locale}:${attempt}:${purpose}:${purposeLabel}:${itemsKey}`;
  useEffect(() => {
    if (itemsKey === "[]") return;
    let active = true;
    summarizeReport(JSON.parse(itemsKey), locale, purpose && { purpose, purposeLabel }).then(
      (report) => { if (active) setSummary({ key: summaryKey, status: "done", report }); },
      (error) => {
        console.error("End report summary failed", error);
        if (active) setSummary({ key: summaryKey, status: error instanceof SummaryError && error.status === 503 ? "unconfigured" : "error" });
      },
    );
    return () => { active = false; };
  }, [itemsKey, locale, purpose, purposeLabel, summaryKey]);
  const aiState = itemsKey === "[]" ? "empty" : summary?.key === summaryKey ? summary.status : "loading";
  const topPages = topSlides.map((page) => page ?? t("report.unmapped")).join(", ");
  const bars = [...counts.map((count, index) => ({ key: session.slides[index].id, label: String(index + 1), count })), ...(unmapped ? [{ key: "unmapped", label: "–", count: unmapped }] : [])];

  return <main className={styles.root}>
    <header className={styles.topBar}>
      <Link href={`/admin/session/${session.id}`} className={styles.back} aria-label={t("report.back")}><Image src="/assets/design/report-back.svg" width={16} height={16} alt="" /></Link>
      <div className={styles.title}><small>{t("report.kicker")}</small><h1>{session.title}</h1></div>
      <button type="button" className={`btn primary ${styles.pdf}`} onClick={() => window.print()}><Image src="/assets/design/report-download.svg" width={16} height={16} alt="" />{t("report.print")}</button>
    </header>
    <div className={styles.content}>
      <p className={styles.meta}>{t("report.scope")}</p>
      <dl className={styles.metrics}>
        <div><dt>{t("report.questions")}</dt><dd><b>{questionCount}</b>{t("report.unitQuestions")}</dd></div>
        <div><dt>{t("report.empathy")}</dt><dd><b>{reactionCount}</b>{t("report.unitEmpathy")}</dd></div>
        <div><dt>{t("report.topSlide")}</dt><dd>{topPages ? <><b>{topPages}</b>{t("report.unitPage")}</> : <b>—</b>}</dd></div>
      </dl>
      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="report-chart-title">
          <div className={styles.cardHead}><h2 id="report-chart-title">{t("report.bySlide")}</h2><small>{t("report.totalPages", { count: session.slides.length })}</small></div>
          {maximum ? <>
            <ol className={styles.chart} style={{ "--chart-height": `${CHART_HEIGHT}px` } as React.CSSProperties}>
              {bars.map((bar) => <li key={bar.key} data-top={bar.count === maximum || undefined} aria-label={`${bar.label === "–" ? t("report.unmapped") : t("common.slideNumber", { number: bar.label })}: ${bar.count}`}>
                <b aria-hidden="true">{bar.count || "​"}</b>
                <i aria-hidden="true" style={{ height: bar.count ? `${bar.count / maximum * CHART_HEIGHT}px` : "2px" }} />
                <span aria-hidden="true">{bar.label}</span>
              </li>)}
            </ol>
            <p className={styles.chartNote}>{t("report.topPageNote", { pages: topPages })}</p>
          </> : <p className={styles.empty}>{t("report.empty")}</p>}
        </section>
        <section className={styles.aiCard} aria-busy={aiState === "loading"} aria-labelledby="report-ai-title">
          <h2 id="report-ai-title"><Image src="/assets/design/report-sparkle.svg" width={16} height={16} alt="" />{t("report.aiSummary")}</h2>
          {aiState === "done"
            ? <div className={styles.summaryBody} tabIndex={0} aria-label={t("report.aiSummary")}>{REPORT_SECTIONS.filter((section) => summary!.report![section].length).map((section) => <section key={section}><h3>{t(section === "summary" ? "report.ai.summary" : `report.ai.${section}.${tone}`)}</h3><ol>{summary!.report![section].map((line, index) => <li key={index}><span aria-hidden="true">{index + 1}</span>{line}</li>)}</ol></section>)}</div>
            : <p className={styles.summary} role="status">{t(aiState === "empty" ? "report.aiEmpty" : aiState === "loading" ? "report.aiLoading" : aiState === "unconfigured" ? "report.aiUnavailable" : "report.aiError", { items })}</p>}
          {aiState === "error" && <button type="button" className="btn secondary" onClick={() => setAttempt((value) => value + 1)}><RotateCw />{t("report.aiRetry")}</button>}
          {aiState === "done" && <small className={styles.summaryNote}>{t(session.questions.length > REPORT_SUMMARY_LIMIT ? "report.aiBasisTop" : "report.aiBasis", { count: Math.min(session.questions.length, REPORT_SUMMARY_LIMIT), items })}</small>}
        </section>
      </div>
    </div>
  </main>;
}
