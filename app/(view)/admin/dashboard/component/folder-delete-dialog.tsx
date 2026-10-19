"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLanguage } from "@/app/_controller/language-context";
import type { FolderSummary } from "@/app/_model/stats";
import styles from "./folder-delete-dialog.module.css";

export function FolderDeleteDialog({ folder, saving, error, onClose, onDelete }: {
  folder: FolderSummary;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: (contents: boolean) => void;
}) {
  const { t, locale } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  const [contents, setContents] = useState(false);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("footer button")?.focus();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  return <dialog ref={ref} className={styles.root} aria-labelledby="folder-delete-title" aria-describedby="folder-delete-description"
    onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !saving) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <span className={styles.icon}><Image src="/assets/design/folder-menu/delete-large.svg" alt="" width={24} height={24} /></span>
    <div><h2 id="folder-delete-title">‘{folder.name}’ {t("folders.deleteTitle")}</h2>
      <p id="folder-delete-description">{locale === "ko" ? `폴더 안에 자료 ${folder.materialCount}개와 지난 강의의 질문 ${folder.questionCount}개가 있어요.` : `${folder.materialCount} materials and ${folder.questionCount} questions are in this folder.`}</p></div>
    <fieldset disabled={saving} className={styles.options}><legend className="sr-only">{t("folders.delete")}</legend>
      {[false, true].map((all) => <label key={String(all)} className={`${styles.option} ${all ? styles.danger : ""}`}>
        <input type="radio" name="delete-folder-contents" checked={contents === all} onChange={() => setContents(all)} />
        <span><b>{t(all ? "folders.deleteAll" : "folders.deleteOnly")}</b><small>{t(all ? "folders.deleteAllHint" : "folders.deleteOnlyHint")}</small></span>
      </label>)}
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><button autoFocus type="button" className="btn secondary" disabled={saving} onClick={onClose}>{t("folders.cancel")}</button>
      <button type="button" className={styles.delete} disabled={saving} onClick={() => onDelete(contents)}>{saving ? t("folders.deleting") : t("folders.delete")}</button></footer>
  </dialog>;
}
