"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, FileText, Folder, Grid2X2, List, MessageCircleQuestion, Trash2, X } from "@/app/component/icons";
import { AdminSearch } from "@/app/component/admin-search";
import { FolderMaterialCard } from "./component/folder-material-card";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { LoadingScreen } from "@/app/component/loading-screen";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { SlidePreview } from "@/app/component/slide-preview";
import { StatusBadge } from "@/app/component/status-badge";
import { UploadProgress } from "@/app/component/upload-progress";
import { WorkspaceHeader } from "@/app/component/workspace-header";
import { heatLevel } from "@/app/_model/stats";
import { questionCategoryClass, questionMarkerEmoji, type ClassSession } from "@/app/_model/types";
import { useFolderController, useFolderInsightsController } from "./controller";
import styles from "./page.module.css";

export default function FolderPage() {
  const {
    t, folderId, folders, ready, inputRef, tab, setTab, view, setView, sidebarOpen, toggleSidebar,
    query, setQuery, movingId, moveError, deleteTarget, deletingSession, deleteError,
    phase, uploadPct, uploadError, slides, total, showPreview, busy, folder, scopedSessions,
    visibleSessions, pick, requestUpload, move, openDelete, closeDelete, confirmDelete
  } = useFolderController();

  if (!ready) return <LoadingScreen />;

  if (!folder) {
    return (
      <main className={`${styles.root} folder-workspace`}>
        <WorkspaceHeader />
        <div className="admin-page folder-page">
          <Link className="folder-breadcrumb" href="/admin/dashboard"><ArrowLeft />{t("folders.backDashboard")}</Link>
          <div className="panel folder-empty"><Folder /><h1>{t("folders.notFound")}</h1><p>{t("folders.notFoundHint")}</p></div>
        </div>
      </main>
    );
  }

  return (
    <main className={`${styles.root} folder-workspace folder-dashboard-shell folder-detail-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <FolderTreeSidebar folders={folders} open={sidebarOpen} activeFolderId={folderId} onToggle={toggleSidebar} />
      <div className="folder-dashboard-content">
        <WorkspaceHeader showLogo={false} />
        <div className="admin-page folder-page">
        <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />

        <header className="folder-page-head">
          <Link className="folder-breadcrumb" href="/admin/dashboard"><ArrowLeft />{t("folders.backDashboard")}</Link>
          <div className="page-head">
            <div><h1>{folder.name}</h1><p>{t("folders.materialCount", { count: scopedSessions.length })}</p></div>
            <div className="folder-detail-actions">
              <AdminSearch className="folder-detail-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("materials.search")} />
              <button type="button" className="btn primary folder-detail-upload-button" onClick={requestUpload} disabled={busy}>{busy ? <span className="spinner" /> : <Image src="/assets/icons/upload_icon.svg" alt="" width={24} height={17} />}{busy ? t("materials.converting") : t("materials.upload")}</button>
            </div>
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
              <div className="view-toggle" role="group" aria-label={t("folders.viewMode")}>
                <button type="button" className={view === "grid" ? "active" : ""} aria-pressed={view === "grid"} title={t("folders.gridView")} onClick={() => setView("grid")}><Grid2X2 /><span>{t("folders.gridView")}</span></button>
                <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} title={t("folders.listView")} onClick={() => setView("list")}><List /><span>{t("folders.listView")}</span></button>
              </div>
            </div>

            {visibleSessions.length ? (
              <div className={`folder-materials ${view}`}>
                {visibleSessions.map((session) => (
                  <FolderMaterialCard key={session.id} session={session} folders={folders} moving={movingId === session.id} onMove={(nextFolderId) => void move(session.id, nextFolderId)} onDelete={() => openDelete(session)} />
                ))}
              </div>
            ) : (
              <div className="panel folder-empty">
                <MessageCircleQuestion />
                <b>{scopedSessions.length ? t("materials.noMatch") : t("materials.none")}</b>
                <span>{scopedSessions.length ? t("materials.changeSearch") : t("folders.emptyFolderHint")}</span>
                {!scopedSessions.length && <button type="button" className="btn primary folder-detail-upload-button" onClick={requestUpload} disabled={busy}>{busy ? <span className="spinner" /> : <Image src="/assets/icons/upload_icon.svg" alt="" width={24} height={17} />}{busy ? t("materials.converting") : t("materials.upload")}</button>}
              </div>
            )}
          </section>
        ) : (
          <FolderInsights key={scopedSessions.map((session) => session.id).join("|")} sessions={scopedSessions} />
        )}
        </div>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDelete(); }}>
          <section className="delete-slide-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-material-title" aria-describedby="delete-material-description" onKeyDown={(event) => { if (event.key === "Escape") closeDelete(); }}>
            <button type="button" className="modal-close" disabled={deletingSession} onClick={closeDelete} aria-label={t("folders.cancel")}><X /></button>
            <span className="delete-slide-icon"><Trash2 /></span>
            <h2 id="delete-material-title">{t("materials.deleteTitle")}</h2>
            <p id="delete-material-description">{t("materials.deleteDescription", { title: deleteTarget.title })}</p>
            {deleteTarget.slides[0] && <div className="delete-slide-preview"><SlideCanvas slide={deleteTarget.slides[0]} compact /><span>{deleteTarget.fileName}</span></div>}
            <div className="delete-slide-warning"><b>{t("materials.deleteWarning")}</b><span>{t("materials.deleteData", { slides: deleteTarget.slides.length, questions: deleteTarget.questions.length })}</span></div>
            {deleteError && <div className="login-error" role="alert">{deleteError} {t("common.tryAgain")}</div>}
            <div className="delete-slide-actions">
              <button type="button" className="btn secondary" disabled={deletingSession} onClick={closeDelete}>{t("folders.cancel")}</button>
              <button type="button" className="btn destructive" disabled={deletingSession} onClick={() => void confirmDelete()}>{deletingSession ? <><span className="spinner" />{t("materials.deleting")}</> : <><Trash2 />{t("materials.deleteConfirm")}</>}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function FolderInsights({ sessions }: { sessions: ClassSession[] }) {
  const {
    t, timeAgo, selectedScope, setScope, questions, settingsFor, categoryLabel, unanswered,
    hotspots, maxHeat, categories, maxCategory, openQuestions, pinRate, resolveRate, resolved
  } = useFolderInsightsController(sessions);

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
        <Kpi label={t("insights.pinRate")} value={`${pinRate}%`} hint={t("insights.pinRateHint")} />
        <Kpi label={t("dashboard.resolveRate")} value={`${resolveRate}%`} hint={t("common.resolvedCount", { count: resolved })} tone="success" />
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
                  <span className="cat-head"><em className={`category ${questionCategoryClass(settingsFor(item.key), item.key)}`}>{item.label}</em><b>{item.count}</b></span>
                  <span className="cat-track"><i className={`cat-fill ${questionCategoryClass(settingsFor(item.key), item.key)}`} style={{ width: `${maxCategory ? (item.count / maxCategory) * 100 : 0}%` }} /></span>
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
                <span><em className={`category ${questionCategoryClass(session.questionCategories, question.category)}`}>{questionMarkerEmoji(question.marker) && <i aria-hidden="true">{questionMarkerEmoji(question.marker)}</i>}{categoryLabel(question.category)}</em></span>
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
