"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import styles from "../../dashboard/component/folder-delete-dialog.module.css";

/**
 * Same modal as FolderDeleteDialog, for a report delete (RPT-011) or a chat reset (RPT-004): Esc and the backdrop close it
 * unless the action is saving. Focus starts on cancel, so Enter never confirms by accident.
 */
export function ReportConfirmDialog({ title, description, confirm, saving, error, onClose, onConfirm }: {
  title: string; description: string; confirm: { label: string; saving: string }; saving: boolean; error: string; onClose: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("footer button")?.focus();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  return <dialog ref={ref} className={styles.root} aria-labelledby="report-confirm-title" aria-describedby="report-confirm-description"
    onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !saving) {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    } }}>
    <span className={styles.icon}><Image src="/assets/design/folder-menu/delete-large.svg" alt="" width={24} height={24} /></span>
    <div><h2 id="report-confirm-title">{title}</h2>
      <p id="report-confirm-description">{description}</p></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><button type="button" className="btn secondary" disabled={saving} onClick={onClose}>취소</button>
      <button type="button" className={styles.delete} disabled={saving} onClick={onConfirm}>{saving ? confirm.saving : confirm.label}</button></footer>
  </dialog>;
}
