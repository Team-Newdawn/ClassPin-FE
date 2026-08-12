"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { PinAdminShell } from "@/components/pin/admin-shell";
import { useCampaigns } from "@/components/pin/campaign-store";
import { Check, Clock3, Copy, Folder, FolderPlus, Grid2X2, Link2, Pencil, Plus, Search, Share2, Trash2, Upload, Users, X } from "@/components/icons";
import { useLanguage } from "@/components/language-context";
import type { TranslationKey } from "@/lib/i18n";
import { isPdfFile } from "@/lib/pin/pdf-reference";
import { isSessionFolderName, SESSION_FOLDER_NAME_MAX, type Campaign, type SessionFolder } from "@/lib/pin/types";

type Filter = "all" | Campaign["status"];

const filterTranslationKey: Record<Filter, TranslationKey> = {
  all: "common.all",
  live: "pin.status.live",
  ended: "pin.status.ended"
};
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 10 * 1024 * 1024;
const ROOT_FOLDER_DROP_ID = "root";

function imageValidationError(file: File, t: (key: TranslationKey) => string) {
  if (!acceptedImageTypes.has(file.type) && !isPdfFile(file)) return t("pin.admin.validationImageType");
  if (file.size > maxImageBytes) return t("pin.admin.validationImageSize");
  return null;
}

export default function PinAdminPage() {
  const { t, timeAgo } = useLanguage();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");
  const { ready, campaigns, folders, createCampaign, createFolder, deleteCampaign, deleteFolder, moveCampaign, renameFolder } = useCampaigns();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [sharedCampaign, setSharedCampaign] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [guideText, setGuideText] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [pdfSelected, setPdfSelected] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [folderEditor, setFolderEditor] = useState<SessionFolder | "new" | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [movingCampaignId, setMovingCampaignId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const matchesFilter = filter === "all" || campaign.status === filter;
      const matchesQuery = !normalizedQuery || `${campaign.title} ${campaign.code}`.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [campaigns, filter, query]);

  const groupedSessions = useMemo(() => {
    const byFolder = new Map(folders.map((folder) => [folder.id, [] as Campaign[]]));
    const root: Campaign[] = [];
    visible.forEach((campaign) => {
      const group = campaign.folderId ? byFolder.get(campaign.folderId) : undefined;
      if (group) group.push(campaign);
      else root.push(campaign);
    });
    return { root, byFolder };
  }, [folders, visible]);
  const knownFolderIds = new Set(folders.map((folder) => folder.id));
  const rootSessionCount = campaigns.filter((campaign) => !campaign.folderId || !knownFolderIds.has(campaign.folderId)).length;

  const liveCount = campaigns.filter((campaign) => campaign.status === "live").length;
  const pinCount = campaigns.reduce((sum, campaign) => sum + campaign.pins.length, 0);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const replaceImage = (file: File | null, sourceName = file?.name ?? "", fromPdf = false) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreviewUrl = file && !fromPdf ? URL.createObjectURL(file) : "";
    previewUrlRef.current = nextPreviewUrl;
    setReferenceFile(file);
    setSourceFileName(sourceName);
    setPdfSelected(fromPdf);
    setPreviewUrl(nextPreviewUrl);
  };

  const resetCreateForm = () => {
    setTitle("");
    setGuideText("");
    replaceImage(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeCreate = () => {
    if (submitting) return;
    setCreateOpen(false);
    resetCreateForm();
  };

  const pickImage = (file?: File) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    const error = imageValidationError(file, t);
    if (error) {
      replaceImage(null);
      setFormError(error);
      return;
    }
    replaceImage(file, file.name, isPdfFile(file));
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanGuideText = guideText.trim();
    if (!cleanTitle) {
      setFormError(t("pin.admin.validationTitleRequired"));
      return;
    }
    if (cleanTitle.length > 120) {
      setFormError(t("pin.admin.validationTitleLength"));
      return;
    }
    if (cleanGuideText.length > 300) {
      setFormError(t("pin.admin.validationGuideLength"));
      return;
    }
    if (!referenceFile) {
      setFormError(t("pin.admin.validationImageRequired"));
      return;
    }
    const imageError = imageValidationError(referenceFile, t);
    if (imageError) {
      setFormError(imageError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const campaign = await createCampaign({ title: cleanTitle, guideText: cleanGuideText, referenceFile });
      router.push(`/pin/admin/${campaign.id}`);
    } catch (error) {
      console.error("Campaign creation failed", error);
      setFormError(error instanceof Error && error.message ? error.message : t("pin.admin.createError"));
      setSubmitting(false);
    }
  };

  const joinUrl = sharedCampaign && typeof window !== "undefined"
    ? `${window.location.origin}/pin/join/${sharedCampaign.code}`
    : "";
  const copyJoinUrl = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Campaign join link copy failed", error);
    }
  };
  const closeDelete = () => {
    if (deletingCampaign) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const openFolderEditor = (folder: SessionFolder | "new") => {
    setFolderEditor(folder);
    setFolderName(folder === "new" ? "" : folder.name);
    setFolderError(null);
  };
  const closeFolderEditor = () => {
    if (folderSaving) return;
    setFolderEditor(null);
    setFolderName("");
    setFolderError(null);
  };
  const saveFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!folderEditor || folderSaving) return;
    const name = folderName.trim();
    if (!isSessionFolderName(name)) {
      setFolderError(t("pin.admin.folderNameInvalid"));
      return;
    }
    if (folders.some((folder) => folder.id !== (folderEditor === "new" ? null : folderEditor.id) && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setFolderError(t("pin.admin.folderDuplicate"));
      return;
    }
    setFolderSaving(true);
    setFolderError(null);
    try {
      if (folderEditor === "new") await createFolder(name);
      else await renameFolder(folderEditor.id, name);
      setFolderEditor(null);
      setFolderName("");
    } catch (error) {
      console.error("Session folder save failed", error);
      setFolderError(t("pin.admin.folderSaveError"));
    } finally {
      setFolderSaving(false);
    }
  };
  const removeFolder = async (folder: SessionFolder) => {
    const count = campaigns.filter((campaign) => campaign.folderId === folder.id).length;
    if (!window.confirm(t("pin.admin.folderDeleteConfirm", { folder: folder.name, count }))) return;
    setFolderActionError(null);
    try {
      await deleteFolder(folder.id);
    } catch (error) {
      console.error("Session folder deletion failed", error);
      setFolderActionError(t("pin.admin.folderDeleteError"));
    }
  };
  const moveSession = async (campaignId: string, folderId: string | null) => {
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign || campaign.folderId === folderId || movingCampaignId) return;
    setMovingCampaignId(campaignId);
    setFolderActionError(null);
    try {
      await moveCampaign(campaignId, folderId);
    } catch (error) {
      console.error("Session folder move failed", error);
      setFolderActionError(t("pin.admin.folderMoveError"));
    } finally {
      setMovingCampaignId(null);
      setDragOverFolderId(null);
    }
  };
  const dropSession = (event: DragEvent<HTMLElement>, folderId: string | null) => {
    event.preventDefault();
    const campaignId = event.dataTransfer.getData("text/plain");
    if (campaignId) void moveSession(campaignId, folderId);
  };
  const confirmDelete = async () => {
    if (!deleteTarget || deletingCampaign) return;
    setDeletingCampaign(true);
    setDeleteError(null);
    try {
      await deleteCampaign(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Campaign deletion failed", error);
      setDeleteError(t("pin.admin.deleteError"));
    } finally {
      setDeletingCampaign(false);
    }
  };

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  const renderSessionCards = (sessions: Campaign[]) => <div className="material-grid session-folder-grid">
    {sessions.map((campaign) => (
      <article
        className={`material-card campaign-card ${movingCampaignId === campaign.id ? "moving" : ""}`}
        key={campaign.id}
        draggable={movingCampaignId !== campaign.id}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", campaign.id);
        }}
        onDragEnd={() => setDragOverFolderId(null)}
        title={t("pin.admin.dragSessionHint")}
      >
        <Link className="campaign-card-link" href={`/pin/admin/${campaign.id}`} aria-label={t("pin.admin.openCampaign", { title: campaign.title })}>
          <span className="material-thumb campaign-thumb">
            {campaign.pages[0]?.imageUrl
              ? <img src={campaign.pages[0].imageUrl} alt={t("pin.image.alt", { title: campaign.title })} />
              : <span className="slide-placeholder">{t("pin.image.unavailable")}</span>}
            <em className={`live-badge ${campaign.status}`}><i />{t(campaign.status === "live" ? "pin.status.live" : "pin.status.ended")}</em>
          </span>
          <span className="material-body">
            <b>{campaign.title}</b>
            <small><Clock3 />{t("pin.admin.created", { time: timeAgo(campaign.createdAt) })}</small>
            <span className="material-stats">
              <span><b>{campaign.pins.length}</b>{t("pin.admin.feedback")}</span>
              <span><b>{campaign.code}</b>{t("pin.admin.joinCode")}</span>
            </span>
          </span>
        </Link>
        <div className="session-card-footer">
          <label className="session-card-folder">
            <Folder />
            <select
              value={campaign.folderId && knownFolderIds.has(campaign.folderId) ? campaign.folderId : ""}
              onChange={(event) => void moveSession(campaign.id, event.target.value || null)}
              disabled={movingCampaignId !== null}
              aria-label={t("pin.admin.moveSession", { title: campaign.title })}
            >
              <option value="">{t("pin.admin.unfiled")}</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <span className="campaign-card-actions">
            <button
              className="icon-btn campaign-delete-button"
              onClick={() => {
                setDeleteError(null);
                setDeleteTarget(campaign);
              }}
              aria-label={t("pin.admin.deleteCampaign", { title: campaign.title })}
              title={t("pin.admin.delete")}
            >
              <Trash2 />
            </button>
            <button
              className="icon-btn campaign-share-button"
              onClick={() => {
                setCopied(false);
                setSharedCampaign(campaign);
              }}
              aria-label={t("pin.admin.shareCampaign", { title: campaign.title })}
              title={t("pin.admin.shareJoinLink")}
            >
              <Share2 />
            </button>
          </span>
        </div>
      </article>
    ))}
  </div>;

  return (
    <PinAdminShell>
      <div className="admin-page">
        <div className="page-head">
          <div><h1>{t("pin.admin.title")}</h1><p>{t("pin.admin.description")}</p></div>
          <div className="page-actions">
            <button className="btn secondary" onClick={() => openFolderEditor("new")}><FolderPlus />{t("pin.admin.newFolder")}</button>
            <button className="btn primary" onClick={() => setCreateOpen(true)}><Plus />{t("pin.admin.newCampaign")}</button>
          </div>
        </div>

        <div className="kpi-grid">
          <KpiCard label={t("pin.admin.totalCampaigns")} value={campaigns.length} hint={t("pin.admin.totalCampaignsHint")} />
          <KpiCard label={t("pin.admin.liveCampaigns")} value={liveCount} hint={t("pin.admin.liveCampaignsHint")} />
          <KpiCard label={t("pin.admin.totalFeedback")} value={pinCount} hint={t("pin.admin.totalFeedbackHint")} />
          <KpiCard label={t("pin.admin.endedCampaigns")} value={campaigns.length - liveCount} hint={t("pin.admin.endedCampaignsHint")} />
        </div>

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("pin.admin.searchCampaigns")} /></div>
          <div className="filter-tabs">{(Object.keys(filterTranslationKey) as Filter[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{t(filterTranslationKey[key])}</button>)}</div>
        </div>

        {folderActionError && <div className="session-folder-error" role="alert">{folderActionError}</div>}

        {campaigns.length || folders.length ? (
          <div className="session-folder-list">
            <section
              className={`session-folder ${dragOverFolderId === ROOT_FOLDER_DROP_ID ? "drag-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverFolderId(ROOT_FOLDER_DROP_ID);
              }}
              onDrop={(event) => dropSession(event, null)}
            >
              <header className="session-folder-head">
                <div><Folder /><span><b>{t("pin.admin.unfiled")}</b><small>{t("pin.admin.sessionCount", { count: rootSessionCount })}</small></span></div>
              </header>
              {groupedSessions.root.length
                ? renderSessionCards(groupedSessions.root)
                : <div className="session-folder-empty">{t(rootSessionCount ? "pin.admin.noFolderMatch" : "pin.admin.unfiledDropHint")}</div>}
            </section>

            {folders.map((folder) => {
              const sessions = groupedSessions.byFolder.get(folder.id) ?? [];
              const sessionCount = campaigns.filter((campaign) => campaign.folderId === folder.id).length;
              return <section
                className={`session-folder ${dragOverFolderId === folder.id ? "drag-over" : ""}`}
                key={folder.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverFolderId(folder.id);
                }}
                onDrop={(event) => dropSession(event, folder.id)}
              >
                <header className="session-folder-head">
                  <div><Folder /><span><b>{folder.name}</b><small>{t("pin.admin.sessionCount", { count: sessionCount })}</small></span></div>
                  <span className="session-folder-actions">
                    <button className="icon-btn" onClick={() => openFolderEditor(folder)} aria-label={t("pin.admin.renameFolder", { folder: folder.name })} title={t("pin.admin.renameFolder", { folder: folder.name })}><Pencil /></button>
                    <button className="icon-btn campaign-delete-button" onClick={() => void removeFolder(folder)} aria-label={t("pin.admin.deleteFolder", { folder: folder.name })} title={t("pin.admin.deleteFolder", { folder: folder.name })}><Trash2 /></button>
                  </span>
                </header>
                {sessions.length
                  ? renderSessionCards(sessions)
                  : <div className="session-folder-empty">{t(sessionCount ? "pin.admin.noFolderMatch" : "pin.admin.folderDropHint")}</div>}
              </section>;
            })}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-empty">
              <Grid2X2 />
              <b>{t(campaigns.length ? "pin.admin.noMatch" : "pin.admin.none")}</b>
              <span>{t(campaigns.length ? "pin.admin.changeSearch" : "pin.admin.emptyHint")}</span>
              {!campaigns.length && <button className="btn primary" onClick={() => setCreateOpen(true)}><Plus />{t("pin.admin.newCampaign")}</button>}
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="modal-backdrop" onMouseDown={closeCreate}>
          <div className="share-modal campaign-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-campaign-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={closeCreate} disabled={submitting} aria-label={t("pin.admin.close")}><X /></button>
            <div className="modal-icon"><Plus /></div>
            <h2 id="create-campaign-title">{t("pin.admin.createTitle")}</h2>
            <p>{t("pin.admin.createDescription")}</p>
            <form className="campaign-form" onSubmit={submit}>
              {formError && <div className="upload-error" role="alert">{formError}</div>}
              <label className="campaign-field">
                <span>{t("pin.admin.fieldTitle")} <small>{t("pin.admin.required")}</small></span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={t("pin.admin.titlePlaceholder")} required autoFocus />
                <small>{title.length}/120</small>
              </label>
              <label className="campaign-field">
                <span>{t("pin.admin.fieldGuide")} <small>{t("pin.admin.optional")}</small></span>
                <div className="textarea-wrap">
                  <textarea value={guideText} onChange={(event) => setGuideText(event.target.value)} maxLength={300} placeholder={t("pin.admin.guidePlaceholder")} />
                  <span>{guideText.length}/300</span>
                </div>
              </label>
              <div className="campaign-field">
                <span>{t("pin.admin.fieldImage")} <small>{t("pin.admin.required")}</small></span>
                <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" hidden onChange={(event) => void pickImage(event.target.files?.[0])} />
                <div className="upload-card campaign-image-picker">
                  {previewUrl
                    ? <img className="campaign-image-preview" src={previewUrl} alt={t("pin.admin.selectedImageAlt")} />
                    : <div className="upload-icon"><Upload /></div>}
                  <p>{sourceFileName
                      ? `${sourceFileName}${pdfSelected ? ` · ${t("pin.admin.pdfAllPages")}` : ""}`
                      : t("pin.admin.imageRequirement")}</p>
                  <button className="btn secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={submitting}><Upload />{t(referenceFile ? "pin.admin.chooseDifferentImage" : "pin.admin.chooseImage")}</button>
                </div>
              </div>
              <div className="campaign-form-actions">
                <button className="btn secondary" type="button" onClick={closeCreate} disabled={submitting}>{t("pin.admin.cancel")}</button>
                <button className="btn primary" type="submit" disabled={submitting}>{submitting ? <><span className="spinner" />{t(pdfSelected ? "pin.admin.convertingAndCreating" : "pin.admin.creating")}</> : <><Plus />{t("pin.home.createCampaign")}</>}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {folderEditor && (
        <div className="modal-backdrop" onMouseDown={closeFolderEditor}>
          <div className="share-modal campaign-create-modal session-folder-modal" role="dialog" aria-modal="true" aria-labelledby="session-folder-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={closeFolderEditor} disabled={folderSaving} aria-label={t("pin.admin.close")}><X /></button>
            <div className="modal-icon">{folderEditor === "new" ? <FolderPlus /> : <Pencil />}</div>
            <h2 id="session-folder-editor-title">{t(folderEditor === "new" ? "pin.admin.createFolderTitle" : "pin.admin.renameFolderTitle")}</h2>
            <p>{t("pin.admin.folderDescription")}</p>
            <form className="campaign-form" onSubmit={(event) => void saveFolder(event)}>
              {folderError && <div className="upload-error" role="alert">{folderError}</div>}
              <label className="campaign-field">
                <span>{t("pin.admin.folderName")} <small>{t("pin.admin.required")}</small></span>
                <input value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={SESSION_FOLDER_NAME_MAX} placeholder={t("pin.admin.folderNamePlaceholder")} required autoFocus />
                <small>{[...folderName].length}/{SESSION_FOLDER_NAME_MAX}</small>
              </label>
              <div className="campaign-form-actions">
                <button className="btn secondary" type="button" onClick={closeFolderEditor} disabled={folderSaving}>{t("pin.admin.cancel")}</button>
                <button className="btn primary" type="submit" disabled={folderSaving}>{folderSaving ? <span className="spinner" /> : folderEditor === "new" ? <FolderPlus /> : <Check />}{t(folderSaving ? "pin.admin.folderSaving" : "pin.admin.folderSave")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sharedCampaign && (
        <div className="modal-backdrop" onMouseDown={() => setSharedCampaign(null)}>
          <div className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-campaign-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSharedCampaign(null)} aria-label={t("pin.admin.close")}><X /></button>
            <div className="modal-icon"><Users /></div>
            <h2 id="share-campaign-title">{t("pin.admin.shareTitle")}</h2>
            <p>{t("pin.admin.shareDescription1")}<br />{t("pin.admin.shareDescription2")}</p>
            <div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div>
            <div className="session-code"><span>{t("pin.admin.joinCode")}</span><b>{sharedCampaign.code}</b></div>
            <div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={() => void copyJoinUrl()} aria-label={t("pin.admin.copyJoinLink")}>{copied ? <Check /> : <Copy />}</button></div>
            <button className="btn primary large full" onClick={() => void copyJoinUrl()}>{copied ? <><Check />{t("pin.admin.copied")}</> : <><Copy />{t("pin.admin.copyJoinLink")}</>}</button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDelete(); }}>
          <section className="delete-slide-modal campaign-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-campaign-title" aria-describedby="delete-campaign-description">
            <button type="button" className="modal-close" disabled={deletingCampaign} onClick={closeDelete} aria-label={t("pin.admin.cancel")}><X /></button>
            <span className="delete-slide-icon"><Trash2 /></span>
            <h2 id="delete-campaign-title">{t("pin.admin.deleteTitle")}</h2>
            <p id="delete-campaign-description">{t("pin.admin.deleteDescription", { title: deleteTarget.title })}</p>
            {deleteTarget.pages[0]?.imageUrl && <div className="delete-slide-preview"><img src={deleteTarget.pages[0].imageUrl} alt={t("pin.image.alt", { title: deleteTarget.title })} /></div>}
            <div className="delete-slide-warning"><b>{t("pin.admin.deleteWarning")}</b><span>{t("pin.admin.deleteData", { pages: deleteTarget.pages.length, count: deleteTarget.pins.length })}</span></div>
            {deleteError && <div className="login-error" role="alert">{deleteError} {t("common.tryAgain")}</div>}
            <div className="delete-slide-actions">
              <button type="button" className="btn secondary" disabled={deletingCampaign} onClick={closeDelete}>{t("pin.admin.cancel")}</button>
              <button type="button" className="btn destructive" disabled={deletingCampaign} onClick={() => void confirmDelete()}>{deletingCampaign ? <><span className="spinner" />{t("pin.admin.deleting")}</> : <><Trash2 />{t("pin.admin.deleteConfirm")}</>}</button>
            </div>
          </section>
        </div>
      )}
    </PinAdminShell>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className="kpi-value">{value}</b><small>{hint}</small></div>;
}
