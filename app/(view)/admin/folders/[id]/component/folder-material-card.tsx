"use client";

import { Folder, Trash2 } from "@/app/component/icon/icons";
import { useLanguage } from "@/app/_controller/provider/language-context";
import { SlideCanvas } from "@/app/component/slide/slide-canvas";
import { ActionMenu, closeActionMenu } from "@/app/component/control/action-menu";

import type { ClassFolder, ClassSession } from "@/app/_model/core/types";
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
      <Cell className={styles.actions}><div className={styles.controls}><Link className={`btn primary ${styles.start}`} href={`/admin/session/${session.id}`}>{view === "list" && <Image src="/assets/design/play.svg" alt="" width={12} height={12} />}{t("folders.startLive")}</Link>
      <Link className={styles.actionIcon} href={`/admin/session/${session.id}?mode=prepare`} aria-label={t("folders.prepare")} title={t("folders.prepare")}><Image src="/assets/insights/manage.svg" alt="" width={24} height={24} /></Link>

      <ActionMenu name="material-card-actions" className={styles.menu} triggerClassName={`icon-btn ${styles.menuTrigger}`} panelClassName={styles.popover}
        label={`${session.title}: ${t("folders.moveTo")}`} title={t("folders.moveTo")} disabled={moving} busy={moving} floating={view === "list"}>
          <label>
            <span><Folder />{t("folders.moveTo")}</span>
            <select value={session.folderId ?? ""} aria-label={t("folders.moveMaterial", { title: session.title })} disabled={moving} onChange={(event) => onMove(event.target.value)}>
              <option value="">{t("folders.unfiled")}</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <button type="button" className={styles.destructive} onClick={(event) => { closeActionMenu(event.currentTarget); onDelete(); }}><Trash2 />{t("materials.deleteConfirm")}</button>
      </ActionMenu></div></Cell>
    </Root>
  );
}
