"use client";

import Image from "next/image";
import { FolderPlus, Pencil, Search, X } from "@/app/component/icons";
import { AdminSearch } from "@/app/component/admin-search";
import { LoadingScreen } from "@/app/component/loading-screen";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { SlidePreview } from "@/app/component/slide-preview";
import { UploadProgress } from "@/app/component/upload-progress";
import { FolderCard } from "./component/folder-card";
import { UNFILED_ID, useDashboardController } from "./controller";
import styles from "./page.module.css";

export default function DashboardPage() {
  const {
    t, folders, ready, inputRef, folderEditor, folderName, setFolderName, query, setQuery,
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
                {visibleSummaries.map((folder) => <FolderCard key={folder.id} folder={folder} deleting={deletingFolderId === folder.id} onRename={folder.id === UNFILED_ID ? undefined : () => openFolderEditor(folder)} onDelete={folder.id === UNFILED_ID ? undefined : () => void removeFolder(folder)} />)}
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
