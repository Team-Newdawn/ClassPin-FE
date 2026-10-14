"use client";

import Image from "next/image";
import { Pencil, Search, Plus, X } from "@/app/component/icons";
import { AdminSearch } from "@/app/component/admin-search";
import { LoadingScreen } from "@/app/component/loading-screen";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import type { TranslationKey } from "@/app/_model/i18n";
import { CLASS_FOLDER_COLOR_OPTIONS, CLASS_FOLDER_PURPOSE_LABEL_MAX, type ClassFolderPurpose } from "@/app/_model/types";
import { FolderCard } from "./component/folder-card";
import { UNFILED_ID, useDashboardController } from "./controller";
import styles from "./page.module.css";

const folderColorOptions = CLASS_FOLDER_COLOR_OPTIONS.map((value) => ({
  value,
  label: (value === 2 ? "folders.colorBlue" : value === 3 ? "folders.colorSky" : value === 1 ? "folders.colorNavy" : "folders.colorSlate") as TranslationKey,
  className: value === 2 ? styles.colorBlue : value === 3 ? styles.colorSky : value === 1 ? styles.colorNavy : styles.colorSlate,
}));;

const folderPurposeOptions: Array<{ value: ClassFolderPurpose; label: TranslationKey; description: TranslationKey }> = [
  { value: "qa", label: "folders.purposeQa", description: "folders.purposeQaDescription" },
  { value: "feedback", label: "folders.purposeFeedback", description: "folders.purposeFeedbackDescription" },
  { value: "education", label: "folders.purposeEducation", description: "folders.purposeEducationDescription" },
  { value: "brainstorming", label: "folders.purposeBrainstorming", description: "folders.purposeBrainstormingDescription" },
  { value: "other", label: "folders.purposeOther", description: "folders.purposeOtherDescription" },
];

import { MaterialUploadDialog } from "@/app/component/material-upload-dialog";

export default function DashboardPage() {
  const {
    t, displayName, view, setView, sort, setSort, folders, ready, uploadOpen, closeUpload, folderEditor, folderName, setFolderName, folderColorIndex,
    setFolderColorIndex, folderPurpose, setFolderPurpose, folderPurposeLabel, setFolderPurposeLabel, query, setQuery,
    folderError, savingFolder, deletingFolderId, folderActionError, sidebarOpen, toggleSidebar,
    requestUpload,
    submitFolder, openFolderEditor, closeFolderEditor, removeFolder, visibleSummaries
  } = useDashboardController();

  if (!ready) return <LoadingScreen />;
  const selectedPurpose = folderPurposeOptions.find((option) => option.value === folderPurpose) ?? folderPurposeOptions[0];

  const folderCards = visibleSummaries.map((folder) => <FolderCard key={folder.id} folder={folder} view={view} deleting={deletingFolderId === folder.id} onRename={folder.id === UNFILED_ID ? undefined : () => openFolderEditor(folder)} onDelete={folder.id === UNFILED_ID ? undefined : () => void removeFolder(folder)} />);

  return (
    <main className={`${styles.root} folder-workspace folder-dashboard-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <FolderTreeSidebar folders={folders} open={sidebarOpen} onToggle={toggleSidebar} />

      <div className="folder-dashboard-content">
        <div className="admin-page folder-dashboard">


          <div className="page-head">
            <div><h1>{t("folders.greeting", { name: displayName })}</h1><p>{t("folders.dashboardDescription")}</p></div>
            <div className="folder-dashboard-actions">
              <AdminSearch className="folder-dashboard-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("folders.search")} />
              <button type="button" className="btn folder-upload-button" onClick={requestUpload}><Image src="/assets/icons/upload_icon.svg" alt="" width={34} height={24} />{t("folders.uploadUnfiled")}</button>
              <button type="button" className="btn primary" onClick={() => openFolderEditor("new")}><Image src="/assets/icons/folder_icon.svg" alt="" width={29} height={24} />{t("folders.newFolder")}</button>
            </div>
          </div>

          {folderActionError && <div className="session-folder-error" role="alert">{folderActionError}</div>}


          <section className="folder-section" aria-labelledby="folder-list-title">
            <div className={styles.listHeader}>
              <h2 id="folder-list-title">{t("folders.lectureFolders")} · {visibleSummaries.length}</h2>
              <div className={styles.listControls}>
                <select className={styles.sort} value={sort} onChange={(event) => setSort(event.target.value as "recent" | "name")} aria-label={t("folders.sort")} title={t("folders.updatedBasis")}>
                  <option value="recent">{t("folders.sortRecent")}</option><option value="name">{t("folders.sortName")}</option>
                </select>
                <div className={styles.viewToggle} role="group" aria-label={t("folders.viewMode")}>
                  {(["grid", "list"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} title={t(mode === "grid" ? "folders.gridView" : "folders.listView")}><Image src={`/assets/design/${mode}.svg`} alt={t(mode === "grid" ? "folders.gridView" : "folders.listView")} width={16} height={16} /></button>)}
                </div>
              </div>
            </div>
            {visibleSummaries.length ? view === "list" ? (
              <div className={styles.folderList}>
                <div className={styles.tableScroll} onScroll={(event) => event.currentTarget.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"))}>
                  <table className={styles.folderTable} aria-labelledby="folder-list-title">
                    <colgroup><col /><col style={{ width: 106 }} /><col style={{ width: 116 }} /><col style={{ width: 106 }} /><col style={{ width: 146 }} /><col style={{ width: 56 }} /></colgroup>
                    <thead><tr><th scope="col">{t("folders.folderLabel")}</th><th scope="col">{t("folders.materials")}</th><th scope="col">{t("common.slide")}</th><th scope="col">{t("common.question")}</th><th scope="col" title={t("folders.updatedBasis")}>{t("folders.updated")}</th><th scope="col"><span className="sr-only">{t("folders.folderActions")}</span></th></tr></thead>
                    <tbody>{folderCards}</tbody>
                  </table>
                </div>
                {!query && <button type="button" className={styles.addFolderRow} onClick={() => openFolderEditor("new")}>+ {t("folders.createNew")}</button>}
              </div>
            ) : (
              <div className="folder-grid">
                {folderCards}
                {!query && <button type="button" className={styles.newFolderTile} onClick={() => openFolderEditor("new")}><Plus /><span>{t("folders.create")}</span></button>}
              </div>
            ) : <div className="panel folder-empty"><Search /><b>{t("folders.noMatch")}</b><span>{t("folders.changeSearch")}</span></div>}
          </section>
        </div>
      </div>

      {folderEditor && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFolderEditor(); }}>
          <section className={`share-modal folder-modal ${folderEditor === "new" ? styles.createModal : ""}`} role="dialog" aria-modal="true" aria-labelledby="folder-editor-title" aria-describedby="folder-editor-description" onKeyDown={(event) => { if (event.key === "Escape") closeFolderEditor(); }}>
            {folderEditor !== "new" && <button type="button" className="modal-close" aria-label={t("folders.closeModal")} onClick={closeFolderEditor} disabled={savingFolder}><X /></button>}
            {folderEditor === "new" ? (
              <header className={styles.createModalHeader}>
                <h2 id="folder-editor-title">{t("folders.newFolderTitle")}</h2>
                <p id="folder-editor-description">{t("folders.newFolderDescription")}</p>
              </header>
            ) : (
              <>
                <span className="modal-icon"><Pencil /></span>
                <h2 id="folder-editor-title">{t("folders.renameTitle")}</h2>
                <p id="folder-editor-description">{t("folders.renameDescription")}</p>
              </>
            )}
            <form className={`folder-form ${folderEditor === "new" ? styles.createForm : ""}`} onSubmit={submitFolder}>
              <label className="folder-field">
                <span>{t("folders.folderName")}</span>
                <input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder={t("folders.folderNamePlaceholder")} disabled={savingFolder} />
              </label>
              {folderEditor === "new" && (
                <>
                  <fieldset className={styles.optionGroup}>
                    <legend>{t("folders.folderColor")}</legend>
                    <div className={styles.colorOptions}>
                      {folderColorOptions.map((option) => (
                        <label className={styles.colorOption} key={option.value}>
                          <input className="sr-only" type="radio" name="folder-color" value={option.value} checked={folderColorIndex === option.value} onChange={() => setFolderColorIndex(option.value)} disabled={savingFolder} aria-label={t(option.label)} />
                          <span className={`${styles.colorSwatch} ${option.className}`} aria-hidden="true" />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className={styles.optionGroup} aria-describedby={folderPurpose === "other" ? undefined : "folder-purpose-description"}>
                    <legend>{t("folders.folderPurpose")}</legend>
                    <div className={styles.purposeOptions}>
                      {folderPurposeOptions.map((option) => (
                        <label className={styles.purposeOption} key={option.value}>
                          <input className="sr-only" type="radio" name="folder-purpose" value={option.value} checked={folderPurpose === option.value} onChange={() => setFolderPurpose(option.value)} disabled={savingFolder} />
                          <span>{t(option.label)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {folderPurpose === "other" ? (
                    <input className={styles.purposeLabelInput} value={folderPurposeLabel} onChange={(event) => setFolderPurposeLabel(event.target.value)} maxLength={CLASS_FOLDER_PURPOSE_LABEL_MAX} placeholder={t("folders.purposeOtherLabelPlaceholder")} aria-label={t("folders.purposeOtherLabel")} disabled={savingFolder} />
                  ) : (
                    <p id="folder-purpose-description" className={styles.purposeDescription} aria-live="polite">{t(selectedPurpose.description)}</p>
                  )}
                </>
              )}
              {folderError && <div className="session-folder-error" role="alert">{folderError}</div>}
              <div className="folder-modal-actions">
                <button type="button" className="btn secondary" onClick={closeFolderEditor} disabled={savingFolder}>{t("folders.cancel")}</button>
                <button type="submit" className="btn primary" disabled={savingFolder || !folderName.trim()}>{savingFolder ? <span className="spinner" /> : folderEditor !== "new" && <Pencil />}{savingFolder ? t(folderEditor === "new" ? "folders.creating" : "folders.renaming") : t(folderEditor === "new" ? "folders.create" : "folders.renameSave")}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {uploadOpen && <MaterialUploadDialog onClose={closeUpload} />}
    </main>
  );
}
