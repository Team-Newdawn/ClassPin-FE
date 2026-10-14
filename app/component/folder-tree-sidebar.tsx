"use client";

import Image from "next/image";
import Link from "next/link";
import { useSessions } from "@/app/_controller/session-store";
import { PanelLeftClose, PanelLeftOpen } from "@/app/component/icons";
import { PinLogo } from "@/app/component/pin-logo";
import { WorkspaceAccount } from "@/app/component/workspace-header";
import { useLanguage } from "@/app/_controller/language-context";
import type { ClassFolder } from "@/app/_model/types";
import { useMemo } from "react";
import styles from "./folder-tree-sidebar.module.css";

export function FolderTreeSidebar({ folders, open, activeFolderId, onToggle }: {
  folders: ClassFolder[];
  open: boolean;
  activeFolderId?: string | null;
  onToggle: () => void;
}) {
  const { t } = useLanguage();
  const { sessions } = useSessions();
  const materialCounts = useMemo(() => {
    const counts = new Map<string | null, number>();
    for (const session of sessions) counts.set(session.folderId, (counts.get(session.folderId) ?? 0) + 1);
    return counts;
  }, [sessions]);
  return <aside className={`${styles.root} folder-tree-sidebar ${open ? "" : styles.collapsed}`} aria-label={t("folders.myFolders")}>
    <div className="folder-tree-brand">
      <PinLogo href="/admin/dashboard" />
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label={t(open ? "session.collapseFolders" : "session.expandFolders")}>{open ? <PanelLeftClose /> : <PanelLeftOpen />}</button>
    </div>
    <nav aria-label={t("folders.myFolders")}>
      <Link className={styles.home} href="/admin/dashboard" aria-current={activeFolderId === undefined ? "page" : undefined}>
        <Image src="/assets/design/home.svg" alt="" width={20} height={20} /><span>{t("common.home")}</span>
      </Link>
      <div className="folder-tree-heading"><b>{t("folders.myFolders")}</b><span>{folders.length}</span></div>
      <ul className="folder-tree-list">
        {folders.map((folder) => <li key={folder.id}>
          <Link href={`/admin/folders/${folder.id}`} title={folder.name} aria-label={t("folders.openFolder", { name: folder.name })} aria-current={folder.id === activeFolderId ? "page" : undefined}>
            <span className={[styles.color, styles["color" + folder.colorIndex]].join(" ")} aria-hidden="true" />
            <span className="folder-tree-name">{folder.name}</span>
            <small>{materialCounts.get(folder.id) ?? 0}</small>
          </Link>
        </li>)}
      </ul>
    </nav>
    <WorkspaceAccount className="folder-tree-account" />
  </aside>;
}
