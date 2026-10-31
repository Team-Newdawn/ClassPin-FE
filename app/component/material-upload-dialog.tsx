"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { useLanguage } from "@/app/_controller/language-context";
import { useMaterialUpload } from "@/app/_controller/use-material-upload";
import { trapDialogFocus } from "@/app/component/dialog-focus";
import styles from "./material-upload-dialog.module.css";

export function MaterialUploadDialog({ folderId = null, onClose }: { folderId?: string | null; onClose: () => void }) {
  const { t, locale } = useLanguage();
  const { folders, targetFolder, setTargetFolder, items, hide, busy, upload } = useMaterialUpload(folderId);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  const completed = items.filter((item) => item.phase === "done").length;
  return <div className={styles.backdrop} onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="material-upload-title" aria-describedby="material-upload-hint" onKeyDown={(event) => { trapDialogFocus(event); if (event.key === "Escape" && !busy) onClose(); }}>
      <header className={styles.header}>
        <span className={styles.headerIcon}><Image src="/assets/design/upload.svg" alt="" width={22} height={22} /></span>
        <div><h2 id="material-upload-title">{t("upload.title")}</h2><p>{t("upload.subtitle")}</p></div>
        <button type="button" className={styles.close} disabled={busy} onClick={onClose} aria-label={t("common.close")}><X /></button>
      </header>
      <input ref={input} type="file" accept=".pdf,.ppt,.pptx" multiple hidden disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} />
      <button type="button" className={styles.dropzone} disabled={busy} onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}>
        <Image src="/assets/design/upload.svg" alt="" width={22} height={22} /><b>{t("upload.dropHint")} <span>{t("upload.select")}</span></b><small>PDF · PPT · PPTX</small>
      </button>
      {items.length > 0 && <ul className={styles.items} aria-live="polite">{items.map((item) => <li key={item.id} className={item.phase === "done" ? styles.complete : ""}>
        <span className={styles.fileIcon}><Image src={item.phase === "done" ? "/assets/design/check.svg" : "/assets/design/file.svg"} alt="" width={18} height={18} /></span>
        <div className={styles.file}><b title={item.file.name}>{item.file.name}</b><span>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.file.size / (item.file.size >= 1e6 ? 1e6 : 1e3))}{item.file.size >= 1e6 ? "MB" : "KB"} · {item.phase === "done" ? t("upload.readySlides", { count: item.slideCount ?? 0 }) : t(`upload.queue.${item.phase}`)}{item.phase === "uploading" ? ` ${item.progress}%` : ""}</span></div>
        <button type="button" className={styles.remove} disabled={busy} onClick={() => hide(item.id)} aria-label={t("upload.hideFile", { name: item.file.name })}><X /></button>
        {(item.phase === "uploading" || item.phase === "processing") && <progress max={100} value={item.phase === "uploading" ? item.progress : undefined} aria-label={t("upload.fileProgress", { name: item.file.name })} />}
        {item.error && <div className={styles.error} role="alert">{item.error}<button type="button" disabled={busy} onClick={() => void upload([item.file], item.id)}>{t("common.retry")}</button></div>}
      </li>)}</ul>}
      <label className={styles.folder}>{t("upload.saveFolder")}<select value={targetFolder ?? ""} disabled={busy || items.length > 0} aria-describedby="upload-folder-hint" onChange={(event) => setTargetFolder(event.target.value || null)}><option value="">{t("folders.unfiled")}</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><small id="upload-folder-hint">{t("upload.folderHint")}</small></label>
      <footer className={styles.footer}><p id="material-upload-hint">{t("upload.immediateHint")}</p><div><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>{t("common.cancel")}</button><button type="button" className="btn primary" disabled={busy} onClick={() => items.length ? onClose() : input.current?.click()}>{busy ? t("materials.converting") : completed ? t("upload.completedFiles", { count: completed }) : items.length ? t("common.confirm") : t("upload.title")}</button></div></footer>
    </section>
  </div>;
}
