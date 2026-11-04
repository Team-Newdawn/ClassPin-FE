"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import styles from "../../dashboard/component/folder-delete-dialog.module.css";

/** Same modal as FolderDeleteDialog: Esc and backdrop close it unless the delete is saving. */
export function ReportDeleteDialog({ title, saving, error, onClose, onDelete }: {
  title: string; saving: boolean; error: string; onClose: () => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("footer button")?.focus();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  return <dialog ref={ref} className={styles.root} aria-labelledby="report-delete-title" aria-describedby="report-delete-description"
    onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !saving) {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    } }}>
    <span className={styles.icon}><Image src="/assets/design/folder-menu/delete-large.svg" alt="" width={24} height={24} /></span>
    <div><h2 id="report-delete-title">‘{title}’ 리포트를 삭제할까요?</h2>
      <p id="report-delete-description">리포트 문서와 AI 대화가 모두 지워지고 되돌릴 수 없어요. 강의 데이터는 그대로 남아 다시 만들 수 있어요.</p></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><button type="button" className="btn secondary" disabled={saving} onClick={onClose}>취소</button>
      <button type="button" className={styles.delete} disabled={saving} onClick={onDelete}>{saving ? "삭제하는 중…" : "삭제"}</button></footer>
  </dialog>;
}
