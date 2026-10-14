"use client";

import Link from "next/link";
import Image from "next/image";
import { Pencil, Trash2 } from "@/app/component/icons";
import { timeAgo } from "@/app/_model/i18n";
import { SlideCanvas } from "@/app/component/slide-canvas";

import { useLanguage } from "@/app/_controller/language-context";
import type { FolderSummary } from "@/app/_model/stats";
import styles from "./folder-card.module.css";

const accentClasses = [styles.accent0, styles.accent1, styles.accent2, styles.accent3, styles.accent4, styles.accent5];

export function FolderCard({ folder, view, deleting, onRename, onDelete }: {
  folder: FolderSummary;
  view: "grid" | "list";
  deleting: boolean;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const { t, locale } = useLanguage();
  const Root = view === "list" ? "tr" : "article";
  const Cell = view === "list" ? "td" : "div";
  const color = ["slate", "navy", "blue", "sky", "navy", "slate"][folder.colorIndex] ?? "blue";
  const updated = <span className={styles.updated} title={t("folders.updatedBasis")}>{folder.updatedAt ? <time dateTime={folder.updatedAt}>{timeAgo(locale, folder.updatedAt)}</time> : "—"}</span>;
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
      <summary className={styles.menuTrigger} aria-label={t("folders.folderMenu", { name: folder.name })} title={t("folders.folderMenu", { name: folder.name })} aria-disabled={deleting} onClick={(event) => { if (deleting) event.preventDefault(); }}>{deleting ? <span className="spinner dark" /> : <Image src="/assets/design/dots.svg" alt="" width={18} height={18} />}</summary>
      <div className={styles.popover}>
        <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onRename(); }}><Pencil />{t("folders.rename")}</button>
        <button type="button" className={styles.destructive} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(); }}><Trash2 />{t("folders.delete")}</button>
      </div>
    </details>
  );

  return (
    <Root className={`${view === "list" ? styles.row : styles.root} ${accentClasses[folder.colorIndex] ?? styles.accent2}`}>
      <Cell className={styles.materialCell}>
        <Link className={styles.link} href={`/admin/folders/${folder.id}`} aria-label={t("folders.openFolder", { name: folder.name })}>
          {view === "grid" ? <span className={styles.visual} aria-hidden="true"><span className={styles.paper} /><span className={styles.cover}>{folder.cover && <SlideCanvas slide={folder.cover} compact />}</span>{!folder.cover && <><i /><i /></>}</span> : <span className={styles.folderIcon}><Image src={`/assets/design/folder-${color}.svg`} alt="" width={18} height={18} /></span>}
          <span className={styles.body}>
            <b className={styles.title}>{folder.name}</b>
            {view === "grid" && <><span className={styles.stats}>{folder.materialCount} {t("folders.materials")} · {folder.slideCount} {t("common.slide")} · {folder.questionCount} {t("common.question")}</span>{updated}</>}
          </span>
        </Link>
      </Cell>
      {view === "list" ? <><td>{folder.materialCount}</td><td>{folder.slideCount}</td><td>{folder.questionCount}</td><td>{updated}</td><td className={styles.menuCell}>{menu}</td></> : menu}
    </Root>
  );
}
