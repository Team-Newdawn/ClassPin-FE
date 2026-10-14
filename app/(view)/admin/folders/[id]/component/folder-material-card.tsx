"use client";

import { Folder, Trash2 } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { SlideCanvas } from "@/app/component/slide-canvas";

import type { ClassFolder, ClassSession } from "@/app/_model/types";
import styles from "./folder-material-card.module.css";

import Link from "next/link";
import Image from "next/image";

export function FolderMaterialCard({ session, folders, view, moving, onMove, onDelete }: {
  session: ClassSession;
  folders: ClassFolder[];
  view: "grid" | "list";
  moving: boolean;
  onMove: (folderId: string) => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();

  const Root = view === "list" ? "tr" : "article";
  const Cell = view === "list" ? "td" : "div";
  return (
    <Root className={`${styles.root} ${styles[view]}`}>
      <Cell className={styles.material}><Link className={styles.link} href={`/admin/session/${session.id}?mode=prepare`} aria-label={t("folders.selectMaterial", { title: session.title })}>
        <span className={styles.thumb}>{session.slides[0] && <SlideCanvas slide={session.slides[0]} compact />}</span>
        <span className={styles.body}>
          <b title={session.title}>{session.title}</b>
          <small className={styles.fileName} title={session.fileName}>{session.fileName}</small>
          <span className={styles.stats}>
            <span>{session.slides.length} {t("common.slide")}</span>
            <span>{t("common.question")} {session.questions.length}</span>

          </span>
        </span>
      </Link></Cell>
      {view === "list" && <><td className={styles.metric}>{session.slides.length}</td><td className={styles.metric}>{session.questions.length}</td><td className={styles.lastLecture}><span aria-label={t("folders.lastLectureUnknown")}>—</span></td></>}
      <Cell className={styles.actions}><div className={styles.controls}><Link className="btn secondary" href={`/admin/session/${session.id}?mode=prepare`}>{t("folders.prepare")}</Link><Link className="btn primary" href={`/admin/session/${session.id}`}>{view === "list" && <Image src="/assets/design/play.svg" alt="" width={12} height={12} />}{t("folders.startLive")}</Link>

      <details className={styles.menu} name="material-card-actions" onToggle={(event) => {
        if (view !== "list" || !event.currentTarget.open) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const panel = event.currentTarget.lastElementChild as HTMLElement;
        Object.assign(panel.style, { position: "fixed", top: `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 12))}px`, left: `${Math.max(12, Math.min(rect.right - 210, window.innerWidth - 222))}px`, right: "auto" });
      }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
        <summary className={`icon-btn ${styles.menuTrigger}`} aria-label={`${session.title}: ${t("folders.moveTo")}`} title={t("folders.moveTo")} aria-disabled={moving} onClick={(event) => { if (moving) event.preventDefault(); }}>{moving ? <span className="spinner dark" /> : <Image src="/assets/design/dots.svg" alt="" width={16} height={16} />}</summary>
        <div className={styles.popover}>
          <label>
            <span><Folder />{t("folders.moveTo")}</span>
            <select value={session.folderId ?? ""} aria-label={t("folders.moveMaterial", { title: session.title })} disabled={moving} onChange={(event) => onMove(event.target.value)}>
              <option value="">{t("folders.unfiled")}</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <button type="button" className={styles.destructive} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(); }}><Trash2 />{t("materials.deleteConfirm")}</button>
        </div>
      </details></div></Cell>
    </Root>
  );
}
