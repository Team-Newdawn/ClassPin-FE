"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, FileText, Folder, Grid2X2, List, MessageCircleQuestion, Search, Upload } from "@/components/icons";
import { useLanguage } from "@/components/language-context";
import { SlideCanvas } from "@/components/slide-canvas";
import { SlidePreview } from "@/components/slide-preview";
import { StatusBadge } from "@/components/status-badge";
import { useSessions } from "@/components/session-store";
import { UploadProgress } from "@/components/upload-progress";
import { useSlideUpload } from "@/components/use-slide-upload";
import { WorkspaceHeader } from "@/components/workspace-header";
import { categoryBreakdown, countBy, heatLevel, pinRate, resolveRate, slideHeatmap } from "@/lib/stats";
import type { ClassSession } from "@/lib/types";

type PageTab = "materials" | "insights";
type View = "grid" | "list";

export default function FolderPage() {
  const { id } = useParams<{ id: string }>();
  const folderId = id === "unfiled" ? null : id;
  const { t } = useLanguage();
  const { folders, sessions, moveSessionToFolder, ready } = useSessions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<PageTab>("materials");
  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start } = useSlideUpload(folderId);

  const folder = folderId === null ? { id: "unfiled", name: t("folders.unfiled") } : folders.find((item) => item.id === folderId);
  const scopedSessions = useMemo(() => sessions.filter((session) => session.folderId === folderId), [folderId, sessions]);
  const visibleSessions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? scopedSessions.filter((session) => `${session.title} ${session.fileName}`.toLocaleLowerCase().includes(needle)) : scopedSessions;
  }, [query, scopedSessions]);

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  if (!folder) {
    return (
      <main className="folder-workspace">
        <WorkspaceHeader />
        <div className="admin-page folder-page">
          <Link className="folder-breadcrumb" href="/admin/dashboard"><ArrowLeft />{t("folders.backDashboard")}</Link>
          <div className="panel folder-empty"><Folder /><h1>{t("folders.notFound")}</h1><p>{t("folders.notFoundHint")}</p></div>
        </div>
      </main>
    );
  }

  const pick = (file?: File) => {
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

  const move = async (sessionId: string, nextFolderId: string) => {
    setMoveError(null);
    setMovingId(sessionId);
    try {
      await moveSessionToFolder(sessionId, nextFolderId || null);
    } catch {
      setMoveError(t("folders.moveError"));
    } finally {
      setMovingId(null);
    }
  };

  return (
    <main className="folder-workspace">
      <WorkspaceHeader />
      <div className="admin-page folder-page">
        <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />

        <header className="folder-page-head">
          <Link className="folder-breadcrumb" href="/admin/dashboard"><ArrowLeft />{t("folders.backDashboard")}</Link>
          <div className="page-head">
            <div><h1>{folder.name}</h1><p>{t("folders.materialCount", { count: scopedSessions.length })}</p></div>
            <button type="button" className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? <span className="spinner" /> : <Upload />}{busy ? t("materials.converting") : t("materials.upload")}</button>
          </div>
          <div className="page-tabs" role="tablist" aria-label={t("folders.pageTabs")}>
            <button type="button" id="folder-materials-tab" role="tab" aria-selected={tab === "materials"} aria-controls="folder-materials-panel" className={tab === "materials" ? "active" : ""} onClick={() => setTab("materials")}><FileText />{t("folders.materialTab")}</button>
            <button type="button" id="folder-insights-tab" role="tab" aria-selected={tab === "insights"} aria-controls="folder-insights-panel" className={tab === "insights" ? "active" : ""} onClick={() => setTab("insights")}><BarChart3 />{t("nav.insights")}</button>
          </div>
        </header>

        {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
        {busy && <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />}
        {showPreview && <SlidePreview slides={slides} total={total} />}
        {moveError && <div className="session-folder-error" role="alert">{moveError}</div>}

        {tab === "materials" ? (
          <section id="folder-materials-panel" role="tabpanel" aria-labelledby="folder-materials-tab">
            <div className="folder-toolbar">
              <label className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("materials.search")} aria-label={t("materials.search")} /></label>
              <div className="view-toggle" role="group" aria-label={t("folders.viewMode")}>
                <button type="button" className={view === "grid" ? "active" : ""} aria-pressed={view === "grid"} title={t("folders.gridView")} onClick={() => setView("grid")}><Grid2X2 /><span>{t("folders.gridView")}</span></button>
                <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} title={t("folders.listView")} onClick={() => setView("list")}><List /><span>{t("folders.listView")}</span></button>
              </div>
            </div>

            {visibleSessions.length ? (
              <div className={`folder-materials ${view}`}>
                {visibleSessions.map((session) => (
                  <MaterialCard key={session.id} session={session} folders={folders} moving={movingId === session.id} onMove={(nextFolderId) => void move(session.id, nextFolderId)} />
                ))}
              </div>
            ) : (
              <div className="panel folder-empty">
                <MessageCircleQuestion />
                <b>{scopedSessions.length ? t("materials.noMatch") : t("materials.none")}</b>
                <span>{scopedSessions.length ? t("materials.changeSearch") : t("folders.emptyFolderHint")}</span>
                {!scopedSessions.length && <button type="button" className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload />{t("materials.upload")}</button>}
              </div>
            )}
          </section>
        ) : (
          <FolderInsights key={scopedSessions.map((session) => session.id).join("|")} sessions={scopedSessions} />
        )}
      </div>
    </main>
  );
}

function MaterialCard({ session, folders, moving, onMove }: { session: ClassSession; folders: { id: string; name: string }[]; moving: boolean; onMove: (folderId: string) => void }) {
  const { t } = useLanguage();
  const unanswered = countBy(session.questions, "unanswered");

  return (
    <article className="material-card folder-material-card">
      <Link className="material-card-link" href={`/admin/session/${session.id}`} aria-label={t("folders.openMaterial", { title: session.title })}>
        <span className="material-thumb"><SlideCanvas slide={session.slides[0]} compact /><em className={`live-badge ${session.status}`}><i />{session.status === "live" ? t("common.live") : t("common.ended")}</em></span>
        <span className="material-body">
          <b>{session.title}</b>
          <small><FileText />{session.fileName}</small>
          <span className="material-stats"><span><b>{session.slides.length}</b>{t("common.slide")}</span><span><b>{session.questions.length}</b>{t("common.question")}</span><span className={unanswered ? "alert" : ""}><b>{unanswered}</b>{t("status.unanswered")}</span></span>
        </span>
      </Link>
      <label className="material-move">
        <Folder />
        <span>{t("folders.moveTo")}</span>
        <select value={session.folderId ?? ""} aria-label={t("folders.moveMaterial", { title: session.title })} disabled={moving} onChange={(event) => onMove(event.target.value)}>
          <option value="">{t("folders.unfiled")}</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
        {moving && <span className="spinner dark" aria-label={t("folders.moving")} />}
      </label>
    </article>
  );
}

function FolderInsights({ sessions }: { sessions: ClassSession[] }) {
  const { t, categoryLabel, timeAgo } = useLanguage();
  const [scope, setScope] = useState("all");
  const selectedScope = scope === "all" || sessions.some((session) => session.id === scope) ? scope : "all";
  const selectedSessions = selectedScope === "all" ? sessions : sessions.filter((session) => session.id === selectedScope);
  const questions = selectedSessions.flatMap((session) => session.questions);
  const unanswered = countBy(questions, "unanswered");
  const hotspots = slideHeatmap(selectedSessions);
  const maxHeat = hotspots[0]?.count ?? 0;
  const categories = categoryBreakdown(questions, categoryLabel);
  const maxCategory = categories[0]?.count ?? 0;
  const openQuestions = selectedSessions
    .flatMap((session) => session.questions.filter((question) => question.status === "unanswered").map((question) => ({ question, session })))
    .sort((a, b) => new Date(b.question.createdAt).getTime() - new Date(a.question.createdAt).getTime());

  return (
    <section id="folder-insights-panel" role="tabpanel" aria-labelledby="folder-insights-tab" className="folder-insights">
      <div className="folder-insight-scopes" role="group" aria-label={t("folders.insightScope")}>
        <button type="button" aria-pressed={selectedScope === "all"} onClick={() => setScope("all")}>{t("folders.insightAll")}</button>
        {sessions.map((session) => (
          <button key={session.id} type="button" aria-pressed={selectedScope === session.id} onClick={() => setScope(session.id)} title={session.fileName}>{session.title}</button>
        ))}
      </div>

      <div className="kpi-grid">
        <Kpi label={t("insights.aggregatedQuestions")} value={questions.length} hint={t("insights.fromSlides", { count: hotspots.length })} />
        <Kpi label={t("dashboard.unanswered")} value={unanswered} hint={questions.length ? t("dashboard.percentTotal", { percent: Math.round((unanswered / questions.length) * 100) }) : t("dashboard.noQuestions")} tone={unanswered ? "warning" : undefined} />
        <Kpi label={t("insights.pinRate")} value={`${pinRate(questions)}%`} hint={t("insights.pinRateHint")} />
        <Kpi label={t("dashboard.resolveRate")} value={`${resolveRate(questions)}%`} hint={t("common.resolvedCount", { count: countBy(questions, "resolved") })} tone="success" />
      </div>

      <div className="section-grid">
        <section className="panel">
          <div className="panel-head"><div><h2>{t("insights.hotspots")}</h2><p>{t("insights.hotspotsHint")}</p></div></div>
          {hotspots.length ? (
            <ul className="heat-list">
              {hotspots.slice(0, 8).map((item) => (
                <li key={`${item.sessionId}-${item.slideIndex}`}>
                  <Link className="heat-row" href={`/admin/session/${item.sessionId}?slide=${item.slideIndex}`}>
                    <span className="heat-slide">{t("common.page", { number: item.slideIndex + 1 })}</span>
                    <span className="heat-title"><b>{item.title}</b><small>{item.sessionTitle}</small></span>
                    <span className="heat-track"><i className={`heat-fill ${heatLevel(item.count, maxHeat)}`} style={{ width: `${maxHeat ? (item.count / maxHeat) * 100 : 0}%` }} /></span>
                    <span className="heat-count">{t("common.cases", { count: item.count })}{item.unanswered > 0 && <em>{t("common.unansweredCount", { count: item.unanswered })}</em>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty message={t("dashboard.noAggregate")} hint={t("insights.noDensityHint")} />}
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>{t("insights.questionTypes")}</h2><p>{t("insights.categoryDistribution")}</p></div></div>
          {categories.length ? (
            <ul className="cat-list">
              {categories.map((item) => (
                <li key={item.key}>
                  <span className="cat-head"><em className={`category ${item.key}`}>{item.label}</em><b>{item.count}</b></span>
                  <span className="cat-track"><i className={`cat-fill ${item.key}`} style={{ width: `${maxCategory ? (item.count / maxCategory) * 100 : 0}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <Empty message={t("insights.noCategories")} hint={t("insights.noCategoriesHint")} />}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>{t("insights.openQuestions")}</h2><p>{t("insights.waitingAnswers", { count: openQuestions.length })}</p></div></div>
        {openQuestions.length ? (
          <div className="question-table flat">
            <div className="table-head"><span>{t("common.slide")}</span><span>{t("common.question")}</span><span>{t("common.category")}</span><span>{t("common.status")}</span><span>{t("common.createdAt")}</span><span /></div>
            {openQuestions.slice(0, 8).map(({ question, session }) => (
              <Link className="table-row" key={question.id} href={`/admin/session/${session.id}?tab=questions`}>
                <span className="slide-cell"><b>{question.slideIndex + 1}</b><small>{session.title}</small></span>
                <span className="question-text">{question.text}</span>
                <span><em className={`category ${question.category}`}>{categoryLabel(question.category)}</em></span>
                <span><StatusBadge status={question.status} /></span>
                <span className="muted">{timeAgo(question.createdAt)}</span>
                <span><ArrowRight /></span>
              </Link>
            ))}
          </div>
        ) : <Empty message={t("insights.noOpenQuestions")} hint={t("insights.allAnswered")} />}
      </section>
    </section>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone?: "warning" | "success" }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className={`kpi-value ${tone ?? ""}`}>{value}</b><small>{hint}</small></div>;
}

function Empty({ message, hint }: { message: string; hint: string }) {
  return <div className="panel-empty"><MessageCircleQuestion /><b>{message}</b><span>{hint}</span></div>;
}
