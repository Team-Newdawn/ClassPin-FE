"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Folder, Grid2X2, List, MessageCircleQuestion, Trash2, X } from "@/app/component/icons";
import { AdminSearch } from "@/app/component/admin-search";

import { useInsightReports } from "@/app/_controller/use-insight-reports";
import { FolderMaterialCard } from "./component/folder-material-card";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { LoadingScreen } from "@/app/component/loading-screen";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { WorkspaceHeader } from "@/app/component/workspace-header";
import { useFolderController } from "./controller";
import styles from "./page.module.css";

import { MaterialUploadDialog } from "@/app/component/material-upload-dialog";

export default function FolderPage() {
  const insightReports = useInsightReports();
  const {
    t, folderId, folders, ready, uploadOpen, closeUpload, view, setView, sidebarOpen, toggleSidebar,
    query, setQuery,
    movingId, moveError, deleteTarget, deletingSession, deleteError,
    folder, scopedSessions,
    visibleSessions, requestUpload, move, openDelete, closeDelete, confirmDelete
  } = useFolderController();
 const materialCards = visibleSessions.map((session) => <FolderMaterialCard key={session.id} session={session} reportId={insightReports.find((report) => report.materialIds.includes(session.materialId ?? "") && ["ready", "confirmed"].includes(report.status))?.id} folders={folders} view={view} moving={movingId === session.id} onMove={(nextFolderId) => void move(session.id, nextFolderId)} onDelete={() => openDelete(session)} />);

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

        <div className="admin-page folder-page">


        <header className="folder-page-head">
          <Link className="folder-breadcrumb" href="/admin/dashboard"><ArrowLeft />{t("folders.backDashboard")}</Link>
          <div className="page-head">
            <div><h1>{folder.name}</h1><p>{t("folders.materialCount", { count: scopedSessions.length })}</p></div>
            <div className="folder-detail-actions">
              <AdminSearch className="folder-detail-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("materials.search")} />
              <button type="button" className="btn primary folder-detail-upload-button" onClick={requestUpload}><Image src="/assets/icons/upload_icon.svg" alt="" width={24} height={17} />{t("materials.upload")}</button>
            </div>
          </div>
        </header>

        {moveError && <div className="session-folder-error" role="alert">{moveError}</div>}

          <section id="folder-materials-panel">
            <div className="folder-toolbar">
              <div className="view-toggle" role="group" aria-label={t("folders.viewMode")}>
                <button type="button" className={view === "grid" ? "active" : ""} aria-pressed={view === "grid"} title={t("folders.gridView")} onClick={() => setView("grid")}><Grid2X2 /><span>{t("folders.gridView")}</span></button>
                <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} title={t("folders.listView")} onClick={() => setView("list")}><List /><span>{t("folders.listView")}</span></button>
              </div>
            </div>

            <div className="folder-material-workspace">
              {visibleSessions.length ? (
                <div className={view === "list" ? "folder-material-list" : "folder-materials grid"}>
 {view === "list" ? <><div className="material-table-scroll" onScroll={(event) => event.currentTarget.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"))}><table className="material-table" aria-label={t("folders.materialTab")}><thead><tr><th scope="col">{t("folders.materialTab")}</th><th scope="col">{t("common.slide")}</th><th scope="col">{t("common.question")}</th><th scope="col">{t("folders.lastLecture")}</th><th scope="col"><span className="sr-only">{t("folders.startLive")}</span></th></tr></thead><tbody>{materialCards}</tbody></table></div><button type="button" className="material-list-upload" onClick={requestUpload}>{t("folders.uploadHere")}</button></> : materialCards}
 </div>
              ) : (
                <div className="panel folder-empty">
                  <MessageCircleQuestion />
                  <b>{scopedSessions.length ? t("materials.noMatch") : t("materials.none")}</b>
                  <span>{scopedSessions.length ? t("materials.changeSearch") : t("folders.emptyFolderHint")}</span>
                  {!scopedSessions.length && <button type="button" className="btn primary folder-detail-upload-button" onClick={requestUpload}><Image src="/assets/icons/upload_icon.svg" alt="" width={24} height={17} />{t("materials.upload")}</button>}
                </div>
              )}
            </div>
          </section>
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
      {uploadOpen && <MaterialUploadDialog folderId={folderId} onClose={closeUpload} />}
    </main>
  );
}
