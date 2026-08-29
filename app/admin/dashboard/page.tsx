"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Folder, FolderPlus, MoreHorizontal, Pencil, Search, Trash2, X } from "@/components/icons";
import { AdminSearch } from "@/components/admin-search";
import { FolderTreeSidebar } from "@/components/folder-tree-sidebar";
import { useLanguage } from "@/components/language-context";
import { SlideCanvas } from "@/components/slide-canvas";
import { useSessions } from "@/components/session-store";
import { SlidePreview } from "@/components/slide-preview";
import { UploadProgress } from "@/components/upload-progress";
import { useSlideUpload } from "@/components/use-slide-upload";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { ClassSession } from "@/lib/types";

const UNFILED_ID = "unfiled";

export default function DashboardPage() {
  const { t, timeAgo } = useLanguage();
  const { folders, sessions, createFolder, renameFolder, deleteFolder, ready } = useSessions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderEditor, setFolderEditor] = useState<"new" | { id: string; name: string } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [query, setQuery] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start } = useSlideUpload(null);

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  const summaries = [
    ...folders.map((folder, colorIndex) => ({ ...folder, colorIndex: colorIndex % 6, sessions: sessions.filter((session) => session.folderId === folder.id) })),
    { id: UNFILED_ID, name: t("folders.unfiled"), createdAt: "", colorIndex: folders.length % 6, sessions: sessions.filter((session) => session.folderId === null) }
  ];
  const needle = query.trim().toLocaleLowerCase();
  const visibleSummaries = needle ? summaries.filter((folder) => folder.name.toLocaleLowerCase().includes(needle)) : summaries;

  const pick = (file?: File) => {
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

  const submitFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folderEditor) return;
    setFolderError(null);
    setSavingFolder(true);
    try {
      if (folderEditor === "new") await createFolder(folderName);
      else await renameFolder(folderEditor.id, folderName);
      setFolderName("");
      setFolderEditor(null);
    } catch {
      setFolderError(t(folderEditor === "new" ? "folders.createError" : "folders.renameError"));
    } finally {
      setSavingFolder(false);
    }
  };

  const openFolderEditor = (folder: "new" | { id: string; name: string }) => {
    setFolderError(null);
    setFolderName(folder === "new" ? "" : folder.name);
    setFolderEditor(folder);
  };

  const removeFolder = async (folder: { id: string; name: string; sessions: ClassSession[] }) => {
    if (deletingFolderId || !window.confirm(t("folders.deleteConfirm", { name: folder.name, count: folder.sessions.length }))) return;
    setDeletingFolderId(folder.id);
    setFolderActionError(null);
    try {
      await deleteFolder(folder.id);
    } catch (error) {
      console.error("Class folder deletion failed", error);
      setFolderActionError(t("folders.deleteError"));
    } finally {
      setDeletingFolderId(null);
    }
  };

  return (
    <main className={`folder-workspace folder-dashboard-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <FolderTreeSidebar folders={folders} open={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} />

      <div className="folder-dashboard-content">
        <WorkspaceHeader showLogo={false} />
        <div className="admin-page folder-dashboard">
          <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />

          <div className="page-head">
            <div><h1>{t("folders.dashboardTitle")}</h1><p>{t("folders.dashboardDescription")}</p></div>
            <div className="folder-dashboard-actions">
              <AdminSearch className="folder-dashboard-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("folders.search")} />
              <button type="button" className="btn folder-upload-button" onClick={() => inputRef.current?.click()} disabled={busy}><Image src="/assets/icons/upload_icon.svg" alt="" width={34} height={24} />{t("folders.uploadUnfiled")}</button>
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
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingFolder) setFolderEditor(null); }}>
          <section className="share-modal folder-modal" role="dialog" aria-modal="true" aria-labelledby="folder-editor-title" onKeyDown={(event) => { if (event.key === "Escape" && !savingFolder) setFolderEditor(null); }}>
            <button type="button" className="modal-close" aria-label={t("folders.closeModal")} onClick={() => setFolderEditor(null)} disabled={savingFolder}><X /></button>
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
                <button type="button" className="btn secondary" onClick={() => setFolderEditor(null)} disabled={savingFolder}>{t("folders.cancel")}</button>
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
