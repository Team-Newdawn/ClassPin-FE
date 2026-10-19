"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { CLASS_FOLDER_COLOR_OPTIONS, normalizeClassFolderName } from "@/app/_model/types";
import { timeAgo } from "@/app/_model/i18n";
import { SlideCanvas } from "@/app/component/slide-canvas";

import { useLanguage } from "@/app/_controller/language-context";
import type { FolderSummary } from "@/app/_model/stats";
import styles from "./folder-card.module.css";

const accentClasses = [styles.accent0, styles.accent1, styles.accent2, styles.accent3, styles.accent4, styles.accent5];

export function FolderCard({ folder, view, deleting, pinned, canCopyLink, onRename, onDelete, onPin, onColor, onCopyLink }: {
  folder: FolderSummary;
  view: "grid" | "list";
  deleting: boolean;
  pinned: boolean;
  canCopyLink: boolean;
  onRename?: (name: string) => Promise<void>;
  onDelete?: () => void;
  onPin?: () => void;
  onColor?: (index: number) => void;
  onCopyLink?: () => void;
}) {
  const { t, locale } = useLanguage();
  const [draft, setDraft] = useState<string | null>(null);
  const [renameError, setRenameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const Root = view === "list" ? "tr" : "article";
  const Cell = view === "list" ? "td" : "div";
  const color = ["slate", "navy", "blue", "sky", "navy", "slate"][folder.colorIndex] ?? "blue";
  const updated = <span className={styles.updated} title={t("folders.updatedBasis")}>{folder.updatedAt ? <time dateTime={folder.updatedAt}>{timeAgo(locale, folder.updatedAt)}</time> : "—"}</span>;
  const finishRename = async (name: string) => {
    if (savingRef.current || !onRename) return;
    savingRef.current = true;
    setSaving(true);
    setRenameError(false);
    try {
      const normalized = normalizeClassFolderName(name);
      if (normalized !== folder.name) await onRename(normalized);
      setDraft(null);
    } catch {
      setRenameError(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally { savingRef.current = false; setSaving(false); }
  };
  const closeMenu = (element: HTMLElement) => {
    const details = element.closest("details");
    details?.removeAttribute("open");
    details?.querySelector("summary")?.focus();
  };
  const icon = (name: string) => <Image src={`/assets/design/folder-menu/${name}.svg`} alt="" width={name === "check" ? 10 : 16} height={name === "check" ? 10 : 16} />;
  const menu = onRename && onDelete && (
    <details className={styles.menu} name="folder-card-actions"
      onToggle={(event) => {
        const panel = event.currentTarget.lastElementChild as HTMLElement;
        if (!event.currentTarget.open) { panel.removeAttribute("style"); return; }
        if (view !== "list") return;
        const rect = event.currentTarget.getBoundingClientRect();
        Object.assign(panel.style, { position: "fixed", top: `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - panel.offsetHeight - 12))}px`, left: `${Math.max(12, Math.min(rect.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 12))}px`, right: "auto" });
      }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
      <summary className={styles.menuTrigger} aria-label={t("folders.folderMenu", { name: folder.name })} title={t("folders.folderMenu", { name: folder.name })} aria-disabled={deleting || saving} onClick={(event) => { if (deleting || saving) event.preventDefault(); }}>{deleting ? <span className="spinner dark" /> : <Image src="/assets/design/dots.svg" alt="" width={18} height={18} />}</summary>
      <div className={styles.popover}>
        <Link href={`/admin/folders/${folder.id}`}>{icon("open")}{t("folders.openMenu")}</Link>
        <button type="button" onClick={(event) => { closeMenu(event.currentTarget); setRenameError(false); setDraft(folder.name); }}>{icon("rename")}{t("folders.rename")}</button>
        <button type="button" aria-pressed={pinned} title={t("folders.browserPreference")} onClick={(event) => { closeMenu(event.currentTarget); onPin?.(); }}>{icon("pin")}{t(pinned ? "folders.unpin" : "folders.pin")}</button>
        <button type="button" disabled={!canCopyLink} title={!canCopyLink ? t("folders.noLiveLink") : undefined} onClick={(event) => { closeMenu(event.currentTarget); onCopyLink?.(); }}>{icon("link")}{t("folders.copyLiveLink")}</button>
        <div className={styles.colors}><span>{t("folders.folderColor")}</span><div role="group" aria-label={t("folders.folderColor")}>
          {CLASS_FOLDER_COLOR_OPTIONS.map((index) => <button key={index} type="button" className={accentClasses[index]} aria-pressed={folder.colorIndex === index} aria-label={t(index === 2 ? "folders.colorBlue" : index === 3 ? "folders.colorSky" : index === 1 ? "folders.colorNavy" : "folders.colorSlate")} title={t("folders.browserPreference")} onClick={(event) => { closeMenu(event.currentTarget); onColor?.(index); }}>{folder.colorIndex === index && icon("check")}</button>)}
        </div></div>
        <button type="button" className={styles.destructive} onClick={(event) => { closeMenu(event.currentTarget); onDelete(); }}>{icon("delete")}{t("folders.delete")}</button>
      </div>
    </details>
  );

  return (
    <Root className={`${view === "list" ? styles.row : styles.root} ${accentClasses[folder.colorIndex] ?? styles.accent2}`}>
      <Cell className={styles.materialCell}>
        <div className={styles.link}>
          <Link className={styles.openLink} href={`/admin/folders/${folder.id}`} aria-label={t("folders.openFolder", { name: folder.name })} />
          {view === "grid" ? <span className={styles.visual} aria-hidden="true"><span className={styles.paper} /><span className={styles.cover}>{folder.cover && <SlideCanvas slide={folder.cover} compact />}</span>{!folder.cover && <><i /><i /></>}</span> : <span className={styles.folderIcon}><Image src={`/assets/design/folder-${color}.svg`} alt="" width={18} height={18} /></span>}
          <span className={styles.body}>
            {draft !== null ? <input ref={inputRef} autoFocus className={styles.renameInput} value={draft} disabled={saving} maxLength={80} aria-label={t("folders.folderName")} aria-invalid={renameError} aria-describedby={renameError ? `rename-error-${folder.id}` : undefined}
              onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
              onChange={(event) => { setDraft(event.target.value); setRenameError(false); }}
              onBlur={(event) => void finishRename(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setDraft(null); setRenameError(false); } }} /> : <b className={styles.title}>{pinned && <Image src="/assets/design/folder-menu/pin.svg" alt={t("folders.pin")} width={16} height={16} />}{folder.name}</b>}
            {renameError && <span id={`rename-error-${folder.id}`} className={styles.renameError} role="alert">{t("folders.renameError")}</span>}
            {view === "grid" && <><span className={styles.stats}>{folder.materialCount} {t("folders.materials")} · {folder.slideCount} {t("common.slide")} · {folder.questionCount} {t("common.question")}</span>{updated}</>}
          </span>
        </div>
      </Cell>
      {view === "list" ? <><td>{folder.materialCount}</td><td>{folder.slideCount}</td><td>{folder.questionCount}</td><td>{updated}</td><td className={styles.menuCell}>{menu}</td></> : menu}
    </Root>
  );
}
