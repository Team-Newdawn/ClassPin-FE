"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { groupReportPins, pinCategoryLabels, type ReportCategoryPin } from "@/app/_model/ai-report-categories";
import { ArrowLeft, Check, FileText, MapPin, MessageCircleQuestion, Sparkles } from "@/app/component/icons";
import { LoadingScreen } from "@/app/component/loading-screen";
import { WorkspaceHeader } from "@/app/component/workspace-header";
import type { AiReportEvidenceLevel, AiReportProductStatus } from "@/app/_model/ai-report";
import { useAiReportController } from "./controller";
import styles from "./page.module.css";
import { useExperimentSelection } from "./experiment-controller";
import { experimentOptions,experimentModels } from "./experiment-model";

export default function AiReportPage() {
  const experiment=useExperimentSelection();
  const {
    t, locale, report, view, setView, loading, error, reload, progress, backHref,
    overallEvidence, summary, confusion, unanswered, priorities, narrativeTitle,
    narrativeParagraphs, materials, evidence, evidenceLoading, evidenceError,
    openEvidence, closeEvidence, retrying, retry,
  } = useAiReportController(experiment.run);
  const evidenceTrigger = useRef<HTMLButtonElement | null>(null);
  const showEvidence = (evidenceRef: string, trigger: HTMLButtonElement) => {
    evidenceTrigger.current = trigger;
    void openEvidence(evidenceRef);
  };
  const dismissEvidence = () => {
    closeEvidence();
    queueMicrotask(() => evidenceTrigger.current?.focus());
  };

  if (loading && !report) return <LoadingScreen />;
  if (!report) {
    return <main className={styles.root}><WorkspaceHeader /><div className="ai-report-page"><Link href="/admin/dashboard"><ArrowLeft />{t("folders.backDashboard")}</Link><section className="report-state"><MessageCircleQuestion /><h1>{error ?? t("aiReport.notFound")}</h1><button className="btn primary" type="button" onClick={reload}>{t("aiReport.retryLoad")}</button></section></div></main>;
  }

  const active = report.product_status === "queued" || report.product_status === "analyzing";
  const ready = report.product_status === "ready" || report.product_status === "confirmed";
  const statusLabel = t(`aiReport.status.${report.product_status}` as Parameters<typeof t>[0]);
  const cutoff = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.cutoff_at));

  return (
    <main className={styles.root}>
      <WorkspaceHeader />
      <div className="ai-report-page">
        <Link className="report-back" href={backHref}><ArrowLeft />{t("aiReport.backToFolder")}</Link>
        <header className="report-head">
          <div><span className="report-eyebrow"><Sparkles />AI INSTRUCTOR REPORT</span><h1>{t("aiReport.title")}</h1><p>{report.materials.map((item) => item.title_snapshot).join(" · ")}</p></div>
          <Status status={report.product_status} label={statusLabel} />
        </header>

        {experiment.enabled&&<section className="report-section"><label htmlFor="report-analysis-model">분석 방식</label><select id="report-analysis-model" value={experiment.selected} onChange={event=>{dismissEvidence();experiment.setSelected(event.target.value);}} style={{display:"block",width:"100%",padding:12,marginTop:8}}>{experimentOptions.map(([id,label])=><option key={id} value={id} disabled={id!=="saved"&&!experiment.runs.some(r=>r.id===id)}>{label}</option>)}</select>{experiment.error&&<p role="status">{experiment.error}</p>}{experiment.run&&<p>글자 인식: {experimentModels[experiment.run.ocr]} · 영역 구분: {experimentModels[experiment.run.layout]} · 문맥 분석: {experimentModels[experiment.run.llm]}<br/>실험 초안 · 기존 리포트 형식으로 표시합니다. 그래프는 원본 질문 집계이며 모델 정확도 지표가 아닙니다. 근거 링크는 원본 질문을 확인하는 용도입니다.</p>}</section>}

        <section className="report-metadata" aria-label={t("aiReport.sourceScope")}>
          <Meta label={t("aiReport.sourceScope")} value={`${report.material_count} ${t("aiReport.materials")} · ${report.slide_count} ${t("aiReport.slides")} · ${report.question_count} PIN`} />
          <Meta label={t("aiReport.cutoff")} value={cutoff} />
          <Meta label={t("aiReport.evidenceLevel")} value={t(`aiReport.evidence${capitalize(overallEvidence)}` as Parameters<typeof t>[0])} />
          <Meta label={t("aiReport.revision")} value={report.revisions[0] ? `v${report.revisions[0].revision_no}` : "—"} />
        </section>

        {active && <section className="report-state" aria-live="polite"><Sparkles /><h2>{statusLabel} · {progress}%</h2><div className="report-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div><p>{t("aiReport.progressHint")}</p><small>{t("aiReport.leaveHint")}</small></section>}
        {report.product_status === "failed" && <section className="report-state failed" role="alert"><MessageCircleQuestion /><h2>{statusLabel}</h2><p>{t("aiReport.failedHint")}</p>{report.safe_error_code && <code>{report.safe_error_code}</code>}<button type="button" className="btn primary" disabled={retrying} onClick={() => void retry()}>{retrying ? <span className="spinner" /> : <Sparkles />}{t("aiReport.retry")}</button></section>}
        {error && <div className="report-load-warning" role="status">{error} <button type="button" onClick={reload}>{t("aiReport.retryLoad")}</button></div>}

        {ready && <>
          <div className="report-view-toggle" role="group" aria-label={t("aiReport.title")}>
            <button type="button" aria-pressed={view === "evidence"} onClick={() => setView("evidence")}>{t("aiReport.evidenceView")}</button>
            <button type="button" aria-pressed={view === "narrative"} onClick={() => setView("narrative")}>{t("aiReport.narrativeView")}</button>
          </div>

          {view === "evidence" ? <><Statistics materials={materials} questionCount={report.question_count} slideCount={report.slide_count} priorityCount={priorities.length} locale={locale} /><CategoryChart pins={report.category_pins ?? []} expectedCount={report.question_count} locale={locale} onEvidence={showEvidence} loading={evidenceLoading} /><div className="report-content">
            <EvidenceSection title={t("aiReport.summary")} items={summary} emptyText={t("aiReport.noResult")} evidenceLabels={{ sufficient: t("aiReport.evidenceSufficient"), limited: t("aiReport.evidenceLimited"), insufficient: t("aiReport.evidenceInsufficient") }} icon="summary" onEvidence={showEvidence} evidenceLoading={evidenceLoading} viewEvidenceLabel={t("aiReport.viewEvidence")} />
            <EvidenceSection title={t("aiReport.confusion")} items={confusion} emptyText={t("aiReport.noResult")} evidenceLabels={{ sufficient: t("aiReport.evidenceSufficient"), limited: t("aiReport.evidenceLimited"), insufficient: t("aiReport.evidenceInsufficient") }} onEvidence={showEvidence} evidenceLoading={evidenceLoading} viewEvidenceLabel={t("aiReport.viewEvidence")} />
            <EvidenceSection title={t("aiReport.unanswered")} items={unanswered} emptyText={t("aiReport.noResult")} evidenceLabels={{ sufficient: t("aiReport.evidenceSufficient"), limited: t("aiReport.evidenceLimited"), insufficient: t("aiReport.evidenceInsufficient") }} onEvidence={showEvidence} evidenceLoading={evidenceLoading} viewEvidenceLabel={t("aiReport.viewEvidence")} />
            <EvidenceSection title={t("aiReport.priorities")} items={priorities} emptyText={t("aiReport.noResult")} evidenceLabels={{ sufficient: t("aiReport.evidenceSufficient"), limited: t("aiReport.evidenceLimited"), insufficient: t("aiReport.evidenceInsufficient") }} onEvidence={showEvidence} evidenceLoading={evidenceLoading} viewEvidenceLabel={t("aiReport.viewEvidence")} />
            <ReportSection title={t("aiReport.materialDetails")} icon="material">
              <div className="report-materials">{materials.map((material) => <article key={material.alias || material.title}><h3>{material.title || material.alias}</h3>{material.slides.length ? <ul>{material.slides.map((slide) => <li id={`slide-${material.alias}/${slide.alias}`} key={slide.alias} tabIndex={-1}><span>{slide.number}</span><div><b>{slide.title || slide.alias}</b><p>{slide.summary || t("aiReport.noResult")}</p><small>{slide.regions} regions · {slide.pins} PIN</small></div></li>)}</ul> : <p>{t("aiReport.noResult")}</p>}</article>)}</div>
            </ReportSection>
          </div></> : <section className="report-narrative"><span className="report-eyebrow">CLASS REPORT</span><h2>{narrativeTitle || t("aiReport.title")}</h2>{narrativeParagraphs.length ? narrativeParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>) : summary.map((item) => <p key={item.id}>{item.body}</p>)}</section>}
        </>}
        {evidenceError && <div className="report-load-warning" role="alert">{evidenceError}</div>}
        {evidence && <EvidenceDialog evidence={evidence} title={t("aiReport.evidenceTitle")} regionLabel={t("aiReport.region")} pinLabel={t("aiReport.pinQuestion")} closeLabel={t("aiReport.closeEvidence")} onClose={dismissEvidence} />}
      </div>
    </main>
  );
}

function capitalize(value: string) { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }

function CategoryChart({ pins, expectedCount, locale, onEvidence, loading }: {
  pins: ReportCategoryPin[]; expectedCount: number; locale: string;
  onEvidence: (ref: string, trigger: HTMLButtonElement) => void; loading: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const groups = groupReportPins(pins);
  const total = groups.reduce((sum, group) => sum + group.pins.length, 0);
  const active = groups.find((group) => group.category === selected) ?? groups[0];
  const lang = locale === "ko" ? "ko" : "en";
  const slices = groups.map((group, index) => {
    const start = groups.slice(0, index).reduce((sum, item) => sum + item.pins.length, 0) / total * 100;
    const end = start + group.pins.length / total * 100;
    return `var(--category-${group.category}) ${start}% ${end}%`;
  });
  return <section className="report-category-panel" aria-label={lang === "ko" ? "PIN 질문 유형 분포" : "PIN question categories"}>
    <h2>{lang === "ko" ? "어떤 질문이 많았나요?" : "What are the questions about?"}</h2>
    <p>{lang === "ko" ? "저장된 질문 유형 기준 · PIN 하나당 하나의 범주로 집계합니다. 범주를 선택하면 질문을 확인할 수 있습니다." : "Based on saved question categories. Each PIN is counted once. Select a category to read its questions."}</p>
    {!total ? <Empty text={lang === "ko" ? "질문 유형 데이터가 아직 없습니다." : "No category data available."} /> : <>
      {total !== expectedCount && <p role="status">{lang === "ko" ? `전체 ${expectedCount}개 중 유형 데이터가 있는 ${total}개 기준입니다.` : `Based on ${total} of ${expectedCount} questions with available category data.`}</p>}
      <div className="report-category-layout">
        <div className="report-donut" role="img" aria-label={groups.map((group) => `${pinCategoryLabels[group.category][lang]} ${group.pins.length}, ${(group.pins.length / total * 100).toFixed(1)}%`).join("; ")} style={{ background: `conic-gradient(${slices.join(",")})` }}><div><b>{total}</b><span>PIN</span></div></div>
        <div className="report-category-legend">{groups.map((group) => <button key={group.category} type="button" aria-pressed={active?.category === group.category} onClick={() => setSelected(group.category)}><i style={{ background: `var(--category-${group.category})` }} /><span>{pinCategoryLabels[group.category][lang]}</span><b>{group.pins.length}</b><small>{(group.pins.length / total * 100).toFixed(1)}%</small></button>)}</div>
        <div className="report-category-questions" aria-live="polite"><h3>{active && pinCategoryLabels[active.category][lang]} · {active?.pins.length}</h3><ul>{active?.pins.map((pin) => <li key={pin.evidenceRef}><button type="button" disabled={loading} onClick={(event) => onEvidence(pin.evidenceRef, event.currentTarget)}><span>{pin.page}p</span><span>{pin.text || (lang === "ko" ? "질문 근거 보기" : "View question evidence")}</span><MapPin /></button></li>)}</ul></div>
      </div>
    </>}
  </section>;
}

function Statistics({ materials, questionCount, slideCount, priorityCount, locale }: {
  materials: ReturnType<typeof useAiReportController>["materials"];
  questionCount: number; slideCount: number; priorityCount: number; locale: string;
}) {
  const ko = locale === "ko";
  const slides = materials.flatMap((material) => material.slides.map((slide) => ({ ...slide, material: material.title, key: `${material.alias}/${slide.alias}` })));
  const known = slides.length === slideCount && slides.every((slide) => Number.isFinite(slide.pins) && slide.pins >= 0);
  const pinned = slides.filter((slide) => slide.pins > 0).length;
  const max = Math.max(1, ...slides.map((slide) => slide.pins));
  const ranking = slides.filter((slide) => slide.pins > 0).sort((a, b) => b.pins - a.pins).slice(0, 5);
  return <section className="report-statistics" aria-label={ko ? "리포트 통계" : "Report statistics"}>
    <div className="report-kpis">
      <Meta label={ko ? "분석 대상 페이지" : "Pages in scope"} value={`${slideCount}`} />
      <Meta label={ko ? "전체 PIN 질문" : "Total PIN questions"} value={`${questionCount}`} />
      <Meta label={ko ? "질문이 있는 페이지" : "Pages with questions"} value={known ? `${pinned} / ${slideCount}` : "—"} />
      <Meta label={ko ? "개선 제안" : "Improvement proposals"} value={`${priorityCount}`} />
    </div>
    <div className="report-charts">
      <section className="report-chart-panel">
        <h2>{ko ? "페이지별 질문 분포" : "Questions by page"}</h2>
        <p>{ko ? "페이지별 PIN 개수 · 막대 높이가 높을수록 질문이 많습니다." : "PIN count per page. Taller bars indicate more questions."}</p>
        {slides.length ? <div className="report-chart-scroll"><div className="report-bars" style={{ minWidth: `${Math.max(340, slides.length * 44)}px` }}>
          {slides.map((slide) => <a key={slide.key} className="report-bar-column" href={`#slide-${slide.key}`} aria-label={`${slide.material}, ${slide.number}p, ${slide.pins} PIN`} title={`${slide.title || slide.alias} · ${slide.pins} PIN`}>
            <span className="report-bar-track"><span className="report-bar" style={{ height: `${slide.pins / max * 100}%` }} /><b>{slide.pins}</b></span>
            <span>{materials.length > 1 ? `${slide.key.split("/")[0]} · ` : ""}{slide.number}p</span>
          </a>)}
        </div></div> : <Empty text={ko ? "페이지별 집계가 아직 없습니다." : "Page statistics are not available yet."} />}
        <small>{ko ? "페이지를 누르면 아래의 분석 상세로 이동합니다." : "Select a page to read its analysis below."}</small>
      </section>
      <section className="report-chart-panel">
        <h2>{ko ? "질문 집중 페이지 TOP 5" : "Top 5 pages by questions"}</h2>
        <p>{ko ? "질문 수 기준 · 같은 수치는 공동 순위로 해석합니다." : "Ordered by question count. Equal counts indicate a tie."}</p>
        <ol className="report-ranking">{ranking.map((slide) => <li key={slide.key}><a href={`#slide-${slide.key}`}><span className="report-page-label">{slide.number}p</span><span><b>{slide.title || slide.alias}</b><small>{materials.length > 1 ? slide.material : (ko ? "전체 질문 중" : "Share of questions")} {questionCount ? `${(slide.pins / questionCount * 100).toFixed(1)}%` : "—"}</small></span><strong>{slide.pins}<small> PIN</small></strong></a></li>)}</ol>
        {!ranking.length && <Empty text={ko ? "집계된 질문이 없습니다." : "No questions recorded."} />}
      </section>
    </div>
    <p className="report-stat-note">{ko ? "분석 시점에 저장된 데이터 기준입니다. 질문 빈도는 이해도 점수나 학습 성과를 의미하지 않습니다." : "Based on the saved analysis snapshot. Question frequency is not a measure of comprehension or learning outcomes."}</p>
  </section>;
}

function Status({ status, label }: { status: AiReportProductStatus; label: string }) {
  return <span className={`report-status ${status}`}>{status === "confirmed" || status === "ready" ? <Check /> : <Sparkles />}{label}</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><b>{value}</b></div>;
}

function ReportSection({ title, icon, children }: { title: string; icon: "summary" | "material"; children: React.ReactNode }) {
  return <section className="report-section"><header>{icon === "summary" ? <Sparkles /> : <FileText />}<h2>{title}</h2></header>{children}</section>;
}

function EvidenceSection({ title, items, emptyText, evidenceLabels, icon = "evidence", onEvidence, evidenceLoading, viewEvidenceLabel }: {
  title: string;
  items: Array<{ id: string; title: string; body: string; evidenceLevel: AiReportEvidenceLevel; evidenceRefs: string[] }>;
  emptyText: string;
  evidenceLabels: Record<AiReportEvidenceLevel, string>;
  icon?: "summary" | "evidence";
  onEvidence: (evidenceRef: string, trigger: HTMLButtonElement) => void;
  evidenceLoading: boolean;
  viewEvidenceLabel: string;
}) {
  return <section className="report-section"><header>{icon === "summary" ? <Sparkles /> : <MapPin />}<h2>{title}</h2><span className="report-section-count">{items.length}</span></header>{items.length ? <div className="evidence-cards">{items.map((item, index) => <details className="report-finding" key={item.id} open={icon === "summary" ? true : undefined}>
    <summary><span className="report-finding-number">{String(index + 1).padStart(2, "0")}</span><h3>{item.title || item.body}</h3><EvidenceBadge level={item.evidenceLevel} label={evidenceLabels[item.evidenceLevel]} /></summary>
    <p>{item.body}</p>
    {item.evidenceRefs.length > 0 && <details className="report-evidence-disclosure"><summary><MapPin />{viewEvidenceLabel}<span>{item.evidenceRefs.length}</span></summary><div className="evidence-links">{item.evidenceRefs.map((ref) => <button key={ref} type="button" disabled={evidenceLoading} aria-label={`${viewEvidenceLabel}: ${ref}`} onClick={(event) => onEvidence(ref, event.currentTarget)}><MapPin />{ref}</button>)}</div></details>}
  </details>)}</div> : <Empty text={emptyText} />}</section>;
}

function EvidenceDialog({ evidence, title, regionLabel, pinLabel, closeLabel, onClose }: { evidence: import("@/app/_model/ai-report").AiReportEvidenceDto; title: string; regionLabel: string; pinLabel: string; closeLabel: string; onClose: () => void }) {
  const box = evidence.region?.bboxNorm;
  const point = pinPoint(evidence.pin?.anchor);
  return <div className="evidence-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-dialog-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}><button type="button" className="evidence-close" onClick={onClose} aria-label={closeLabel}>×</button><header><span className="report-eyebrow"><MapPin />{evidence.evidenceRef}</span><h2 id="evidence-dialog-title">{title}</h2><p>{evidence.materialTitle} · {evidence.slideNumber}p</p></header><div className="evidence-image" role="img" aria-label={`${evidence.materialTitle} ${evidence.slideNumber}p`} style={{ backgroundImage: `url("${evidence.imageUrl.replaceAll('"', "%22")}")` }}>{box && <i className="region-overlay" style={{ left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`, width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%` }} />}{point && <i className="pin-overlay" style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }}><MapPin /></i>}</div>{evidence.region && <article><small>{regionLabel} · {evidence.region.alias}</small><p>{evidence.region.summary}</p></article>}{evidence.pin && <article><small>{pinLabel} · {evidence.pin.questionAlias}</small><p>{evidence.pin.text}</p>{evidence.pin.answers.map((answer, index) => <blockquote key={index}>{answer.body}</blockquote>)}</article>}</section></div>;
}

function pinPoint(anchor: unknown): [number, number] | null {
  if (!anchor || typeof anchor !== "object") return null;
  const value = anchor as { kind?: unknown; coords?: unknown };
  if (value.kind !== "point" || !value.coords || typeof value.coords !== "object") return null;
  const coords = value.coords as { x?: unknown; y?: unknown };
  const point: [number, number] = [Number(coords.x), Number(coords.y)];
  return point.every((item) => Number.isFinite(item) && item >= 0 && item <= 1) ? point : null;
}

function EvidenceBadge({ level, label }: { level: AiReportEvidenceLevel; label: string }) {
  return <span className={`evidence-badge ${level}`}>{label}</span>;
}

function Empty({ text }: { text: string }) { return <p className="report-empty">{text}</p>; }
