"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Folder, FolderPlus, Plus, Search, Trash2, Upload, X } from "@/components/icons";
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
  const { folders, sessions, createFolder, deleteFolder, ready } = useSessions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [query, setQuery] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start } = useSlideUpload(null);

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  const summaries = [
    ...folders.map((folder) => ({ ...folder, sessions: sessions.filter((session) => session.folderId === folder.id) })),
    { id: UNFILED_ID, name: t("folders.unfiled"), createdAt: "", sessions: sessions.filter((session) => session.folderId === null) }
  ];
  const needle = query.trim().toLocaleLowerCase();
  const visibleSummaries = needle ? summaries.filter((folder) => folder.name.toLocaleLowerCase().includes(needle)) : summaries;

  const pick = (file?: File) => {
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

  const submitFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    setFolderError(null);
    setCreatingFolder(true);
    try {
      await createFolder(folderName);
      setFolderName("");
      setFolderModalOpen(false);
    } catch {
      setFolderError(t("folders.createError"));
    } finally {
      setCreatingFolder(false);
    }
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
    <main className="folder-workspace">
      <WorkspaceHeader />
      <div className="admin-page folder-dashboard">
        <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => pick(event.target.files?.[0])} />

        <div className="page-head">
          <div><h1>{t("folders.dashboardTitle")}</h1><p>{t("folders.dashboardDescription")}</p></div>
          <div className="page-actions">
            <button type="button" className="btn secondary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload />{t("folders.uploadUnfiled")}</button>
            <button type="button" className="btn primary" onClick={() => { setFolderError(null); setFolderModalOpen(true); }}><FolderPlus />{t("folders.newFolder")}</button>
          </div>
        </div>

        {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
        {folderActionError && <div className="session-folder-error" role="alert">{folderActionError}</div>}
        {busy && <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />}
        {showPreview && <SlidePreview slides={slides} total={total} />}

        <section aria-labelledby="folder-list-title">
          <div className="panel-head folder-section-head">
            <div><h2 id="folder-list-title">{t("folders.myFolders")}</h2><p>{t("folders.folderCount", { count: visibleSummaries.length })}</p></div>
            <label className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("folders.search")} aria-label={t("folders.search")} /></label>
          </div>
          {visibleSummaries.length ? (
            <div className="folder-grid">
              {visibleSummaries.map((folder) => <FolderCard key={folder.id} folder={folder} timeAgo={timeAgo} deleting={deletingFolderId === folder.id} onDelete={folder.id === UNFILED_ID ? undefined : () => void removeFolder(folder)} />)}
              <button type="button" className="folder-card folder-card-create" onClick={() => { setFolderError(null); setFolderModalOpen(true); }}>
                <span className="folder-card-create-icon"><Plus /></span>
                <b>{t("folders.newFolder")}</b>
                <small>{t("folders.newFolderHint")}</small>
              </button>
            </div>
          ) : <div className="panel folder-empty"><Search /><b>{t("folders.noMatch")}</b><span>{t("folders.changeSearch")}</span></div>}
        </section>
      </div>

      {folderModalOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingFolder) setFolderModalOpen(false); }}>
          <section className="share-modal folder-modal" role="dialog" aria-modal="true" aria-labelledby="new-folder-title" onKeyDown={(event) => { if (event.key === "Escape" && !creatingFolder) setFolderModalOpen(false); }}>
            <button type="button" className="modal-close" aria-label={t("folders.closeModal")} onClick={() => setFolderModalOpen(false)} disabled={creatingFolder}><X /></button>
            <span className="modal-icon"><FolderPlus /></span>
            <h2 id="new-folder-title">{t("folders.newFolderTitle")}</h2>
            <p>{t("folders.newFolderDescription")}</p>
            <form className="folder-form" onSubmit={submitFolder}>
              <label className="folder-field">
                <span>{t("folders.folderName")}</span>
                <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder={t("folders.folderNamePlaceholder")} disabled={creatingFolder} />
              </label>
              {folderError && <div className="session-folder-error" role="alert">{folderError}</div>}
              <div className="folder-modal-actions">
                <button type="button" className="btn secondary" onClick={() => setFolderModalOpen(false)} disabled={creatingFolder}>{t("folders.cancel")}</button>
                <button type="submit" className="btn primary" disabled={creatingFolder || !folderName.trim()}>{creatingFolder ? <span className="spinner" /> : <FolderPlus />}{creatingFolder ? t("folders.creating") : t("folders.create")}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function FolderCard({ folder, timeAgo, deleting, onDelete }: { folder: { id: string; name: string; createdAt: string; sessions: ClassSession[] }; timeAgo: (date: string) => string; deleting: boolean; onDelete?: () => void }) {
  const { t } = useLanguage();
  const slideCount = folder.sessions.reduce((sum, session) => sum + session.slides.length, 0);
  const questionCount = folder.sessions.reduce((sum, session) => sum + session.questions.length, 0);
  const cover = folder.sessions[0]?.slides[0];
  const latest = folder.sessions.reduce((value, session) => Math.max(value, new Date(session.createdAt).getTime()), folder.createdAt ? new Date(folder.createdAt).getTime() : 0);

  return (
    <article className="folder-card">
      <Link className="folder-card-link" href={`/admin/folders/${folder.id}`} aria-label={t("folders.openFolder", { name: folder.name })}>
        <span className={`folder-card-cover ${cover ? "" : "empty"}`}>
          {cover ? <SlideCanvas slide={cover} compact /> : <Folder />}
        </span>
        <span className="folder-card-body">
          <span className="folder-card-title"><Folder /><b>{folder.name}</b></span>
          <span className="folder-card-stats">
            <span><b>{folder.sessions.length}</b>{t("folders.materials")}</span>
            <span><b>{slideCount}</b>{t("common.slide")}</span>
            <span><b>{questionCount}</b>{t("common.question")}</span>
          </span>
          <small className="folder-card-meta">{latest ? t("folders.updated", { time: timeAgo(new Date(latest).toISOString()) }) : t("folders.empty")}</small>
        </span>
      </Link>
      {onDelete && <button type="button" className="icon-btn folder-card-delete" onClick={onDelete} disabled={deleting} aria-label={t("folders.deleteFolder", { name: folder.name })} title={t("folders.deleteFolder", { name: folder.name })}>{deleting ? <span className="spinner dark" /> : <Trash2 />}</button>}
    </article>
  );
}
