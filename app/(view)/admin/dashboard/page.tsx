"use client";

import Image from "next/image";
import Link from "next/link";
import { Folder, FolderPlus, MoreHorizontal, Pencil, Search, Trash2, X } from "@/app/component/icons";
import { AdminSearch } from "@/app/component/admin-search";
import { LoadingScreen } from "@/app/component/loading-screen";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { useLanguage } from "@/app/_controller/language-context";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { SlidePreview } from "@/app/component/slide-preview";
import { UploadProgress } from "@/app/component/upload-progress";
import type { ClassSession } from "@/app/_model/types";
import { UNFILED_ID, useDashboardController } from "./controller";
import styles from "./page.module.css";

export default function DashboardPage() {
  const {
    t, timeAgo, folders, ready, inputRef, folderEditor, folderName, setFolderName, query, setQuery,
    folderError, savingFolder, deletingFolderId, folderActionError, sidebarOpen, toggleSidebar,
    phase, uploadPct, uploadError, slides, total, showPreview, busy, pick, requestUpload,
    submitFolder, openFolderEditor, closeFolderEditor, removeFolder, visibleSummaries
  } = useDashboardController();

  if (!ready) return <LoadingScreen />;

  return (
    <main className={`${styles.root} folder-workspace folder-dashboard-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <FolderTreeSidebar folders={folders} open={sidebarOpen} onToggle={toggleSidebar} />

      <div className="folder-dashboard-content">
        <div className="admin-page folder-dashboard">
          <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />

          <div className="page-head">
            <div><h1>{t("folders.dashboardTitle")}</h1><p>{t("folders.dashboardDescription")}</p></div>
            <div className="folder-dashboard-actions">
              <AdminSearch className="folder-dashboard-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("folders.search")} />
              <button type="button" className="btn folder-upload-button" onClick={requestUpload} disabled={busy}><Image src="/assets/icons/upload_icon.svg" alt="" width={34} height={24} />{t("folders.uploadUnfiled")}</button>
              <button type="button" className="btn primary" onClick={() => openFolderEditor("new")}><Image src="/assets/icons/folder_icon.svg" alt="" width={29} height={24} />{t("folders.newFolder")}</button>
            </div>
          </div>

          {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
          {folderActionError && <div className="session-folder-error" role="alert">{folderActionError}</div>}
          {busy && <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />}
          {showPreview && <SlidePreview slides={slides} total={total} />}

          <section className="folder-section" aria-labelledby="folder-list-title">
            <h2 id="folder-list-title" className="sr-only">{t("folders.myFolders")}</h2>
            {visibleSummaries.length ? (
              <div className="folder-grid">
                {visibleSummaries.map((folder) => <FolderCard key={folder.id} folder={folder} timeAgo={timeAgo} deleting={deletingFolderId === folder.id} onRename={folder.id === UNFILED_ID ? undefined : () => openFolderEditor(folder)} onDelete={folder.id === UNFILED_ID ? undefined : () => void removeFolder(folder)} />)}
              </div>
            ) : <div className="panel folder-empty"><Search /><b>{t("folders.noMatch")}</b><span>{t("folders.changeSearch")}</span></div>}
          </section>
        </div>
      </div>

      {folderEditor && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFolderEditor(); }}>
          <section className="share-modal folder-modal" role="dialog" aria-modal="true" aria-labelledby="folder-editor-title" onKeyDown={(event) => { if (event.key === "Escape") closeFolderEditor(); }}>
            <button type="button" className="modal-close" aria-label={t("folders.closeModal")} onClick={closeFolderEditor} disabled={savingFolder}><X /></button>
            <span className="modal-icon">{folderEditor === "new" ? <FolderPlus /> : <Pencil />}</span>
            <h2 id="folder-editor-title">{t(folderEditor === "new" ? "folders.newFolderTitle" : "folders.renameTitle")}</h2>
            <p>{t(folderEditor === "new" ? "folders.newFolderDescription" : "folders.renameDescription")}</p>
            <form className="folder-form" onSubmit={submitFolder}>
              <label className="folder-field">
                <span>{t("folders.folderName")}</span>
                <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder={t("folders.folderNamePlaceholder")} disabled={savingFolder} />
              </label>
              {folderError && <div className="session-folder-error" role="alert">{folderError}</div>}
              <div className="folder-modal-actions">
                <button type="button" className="btn secondary" onClick={closeFolderEditor} disabled={savingFolder}>{t("folders.cancel")}</button>
                <button type="submit" className="btn primary" disabled={savingFolder || !folderName.trim()}>{savingFolder ? <span className="spinner" /> : folderEditor === "new" ? <FolderPlus /> : <Pencil />}{savingFolder ? t(folderEditor === "new" ? "folders.creating" : "folders.renaming") : t(folderEditor === "new" ? "folders.create" : "folders.renameSave")}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function FolderCard({ folder, timeAgo, deleting, onRename, onDelete }: { folder: { id: string; name: string; createdAt: string; colorIndex: number; sessions: ClassSession[] }; timeAgo: (date: string) => string; deleting: boolean; onRename?: () => void; onDelete?: () => void }) {
  const { t } = useLanguage();
  const slideCount = folder.sessions.reduce((sum, session) => sum + session.slides.length, 0);
  const questionCount = folder.sessions.reduce((sum, session) => sum + session.questions.length, 0);
  const cover = folder.sessions[0]?.slides[0];
  const latest = folder.sessions.reduce((value, session) => Math.max(value, new Date(session.createdAt).getTime()), folder.createdAt ? new Date(folder.createdAt).getTime() : 0);

  return (
    <article className={`folder-card folder-accent-${folder.colorIndex}`}>
      <Link className="folder-card-link" href={`/admin/folders/${folder.id}`} aria-label={t("folders.openFolder", { name: folder.name })}>
        <span className="folder-card-visual" aria-hidden="true">
          <span className="folder-card-paper" />
          <span className={`folder-card-cover ${cover ? "" : "empty"}`}>
            {cover ? <SlideCanvas slide={cover} compact /> : <Folder />}
          </span>
        </span>
        <span className="folder-card-body">
          <span className="folder-card-title"><b>{folder.name}</b></span>
          <span className="folder-card-stats">
            <span><b>{folder.sessions.length}</b>{t("folders.materials")}</span>
            <span><b>{slideCount}</b>{t("common.slide")}</span>
            <span><b>{questionCount}</b>{t("common.question")}</span>
          </span>
          <small className="folder-card-meta">{latest ? t("folders.updated", { time: timeAgo(new Date(latest).toISOString()) }) : t("folders.empty")}</small>
        </span>
      </Link>
      {onRename && onDelete && <details className="folder-card-menu" name="folder-card-actions" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
        <summary className="icon-btn folder-card-menu-trigger" aria-label={t("folders.folderMenu", { name: folder.name })} title={t("folders.folderMenu", { name: folder.name })} aria-disabled={deleting} onClick={(event) => { if (deleting) event.preventDefault(); }}>{deleting ? <span className="spinner dark" /> : <MoreHorizontal />}</summary>
        <div className="folder-card-menu-popover">
          <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onRename(); }}><Pencil />{t("folders.rename")}</button>
          <button type="button" className="destructive" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(); }}><Trash2 />{t("folders.delete")}</button>
        </div>
      </details>}
    </article>
  );
}
