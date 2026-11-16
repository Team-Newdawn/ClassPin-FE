"use client";

import Image from "next/image";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useLanguage } from "@/app/_controller/provider/language-context";
import styles from "./confirm-dialog.module.css";

/**
 * Modal that confirms a destructive action (folder or report delete, chat reset). Esc and the backdrop close it
 * unless the action is saving. Focus starts on cancel, so Enter never confirms by accident, and returns to the
 * opener on close. `children` sits between the description and the error, e.g. delete options.
 */
export function ConfirmDialog({ title, description, confirm, saving, error, onClose, onConfirm, children }: {
  title: string;
  description: string;
  confirm: { label: string; saving: string };
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("footer button")?.focus();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);

  return <dialog ref={ref} className={styles.root} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || saving) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <span className={styles.icon}><Image src="/assets/design/folder-menu/delete-large.svg" alt="" width={24} height={24} /></span>
    <div><h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p></div>
    {children}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><button type="button" className="btn secondary" disabled={saving} onClick={onClose}>{t("common.cancel")}</button>
      <button type="button" className={styles.confirm} disabled={saving} onClick={onConfirm}>{saving ? confirm.saving : confirm.label}</button></footer>
  </dialog>;
}
