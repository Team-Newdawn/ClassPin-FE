"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";

import { summarizeFolders, type FolderSummary } from "@/app/_model/stats";
import { normalizeClassFolderColorIndex, CLASS_FOLDER_DEFAULT_COLOR_INDEX, CLASS_FOLDER_DEFAULT_PURPOSE, CLASS_UNFILED_COLOR_INDEX, type ClassFolder, type ClassFolderPurpose } from "@/app/_model/types";

import { useAuth } from "@/app/_controller/auth-context";
import { useBrowserPreferences } from "@/app/_controller/use-browser-preferences";
export const UNFILED_ID = "unfiled";

export function useDashboardController() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const { folders, sessions, createFolder, updateFolder, deleteFolder, deleteSession, ready } = useSessions();
  const [folderPreferences, saveFolderPreferences] = useBrowserPreferences<Record<string, { pinned?: boolean; colorIndex?: number }>>("folders");
  const liveFolderIds = useMemo(() => new Set(sessions.filter((session) => session.status === "live").map((session) => session.folderId)), [sessions]);
  const [folderToDelete, setFolderToDelete] = useState<FolderSummary | null>(null);
  const [folderNotice, setFolderNotice] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderEditor, setFolderEditor] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderColorIndex, setFolderColorIndex] = useState(CLASS_FOLDER_DEFAULT_COLOR_INDEX);
  const [folderPurpose, setFolderPurpose] = useState<ClassFolderPurpose>(CLASS_FOLDER_DEFAULT_PURPOSE);
  const [folderPurposeLabel, setFolderPurposeLabel] = useState("");
  const [query, setQuery] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const summaries = useMemo(() => summarizeFolders(folders, sessions, {
    id: UNFILED_ID,
    name: t("folders.unfiled"),
    createdAt: "",
    colorIndex: CLASS_UNFILED_COLOR_INDEX,
    purpose: CLASS_FOLDER_DEFAULT_PURPOSE
  }), [folders, sessions, t]);
  const visibleSummaries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return summaries.map((folder) => ({ ...folder, colorIndex: normalizeClassFolderColorIndex(folderPreferences[folder.id]?.colorIndex ?? folder.colorIndex) })).filter((folder) => folder.name.toLocaleLowerCase().includes(needle)).sort((a, b) => Number(folderPreferences[b.id]?.pinned === true) - Number(folderPreferences[a.id]?.pinned === true) || (sort === "name" ? a.name.localeCompare(b.name) : (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0)));
  }, [query, sort, summaries, folderPreferences]);



  const submitFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderEditor) return;
    setFolderError(null);
    setSavingFolder(true);
    try {
      const input = { name: folderName, colorIndex: folderColorIndex, purpose: folderPurpose, purposeLabel: folderPurposeLabel };
      await createFolder(input);
      setFolderName("");
      setFolderEditor(false);
    } catch {
      setFolderError(t("folders.createError"));
    } finally {
      setSavingFolder(false);
    }
  };

  const openFolderEditor = () => {
    setFolderError(null);
    setFolderName("");
    setFolderColorIndex(CLASS_FOLDER_DEFAULT_COLOR_INDEX);
    setFolderPurpose(CLASS_FOLDER_DEFAULT_PURPOSE);
    setFolderPurposeLabel("");
    setFolderEditor(true);
  };

  const closeFolderEditor = () => {
    if (!savingFolder) setFolderEditor(false);
  };

  const changeFolderAppearance = (folder: FolderSummary, patch: { pinned?: boolean; colorIndex?: number }) => {
    setFolderActionError(null);
    try { saveFolderPreferences({ [folder.id]: { ...folderPreferences[folder.id], ...patch } }); }
    catch { setFolderActionError(t("folders.appearanceError")); }
  };

  const copyFolderLink = async (folder: FolderSummary) => {
    const live = sessions.filter((item) => item.folderId === folder.id && item.status === "live")
      .sort((a, b) => (Date.parse(b.startedAt ?? b.createdAt) || 0) - (Date.parse(a.startedAt ?? a.createdAt) || 0))[0];
    if (!live) return;
    setFolderActionError(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${encodeURIComponent(live.code)}`);
      setFolderNotice(t("folders.linkCopied"));
    } catch { setFolderActionError(t("folders.copyError")); }
  };

  const removeFolder = async (contents: boolean) => {
    if (!folderToDelete || deletingFolderId) return;
    setDeletingFolderId(folderToDelete.id);
    setFolderActionError(null);
    try {
      if (contents) for (const session of sessions.filter((item) => item.folderId === folderToDelete.id)) await deleteSession(session.id);
      await deleteFolder(folderToDelete.id);
      setFolderToDelete(null);
    } catch (error) {
      console.error("Class folder deletion failed", error);
      setFolderActionError(t(contents ? "folders.partialDeleteError" : "folders.deleteError"));
    } finally { setDeletingFolderId(null); }
  };

  return {
    t,
    displayName: profile?.displayName ?? t("nav.myWorkspace"), view, setView, sort, setSort,
    folders,
    ready,
    uploadOpen,
    closeUpload: () => setUploadOpen(false),
    folderEditor,
    folderName,
    setFolderName,
    folderColorIndex,
    setFolderColorIndex,
    folderPurpose,
    setFolderPurpose,
    folderPurposeLabel,
    setFolderPurposeLabel,
    query,
    setQuery,
    folderError,
    savingFolder,
    deletingFolderId,
    folderActionError, setFolderActionError,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((open) => !open),
    requestUpload: () => setUploadOpen(true),
    submitFolder,
    openFolderEditor,
    closeFolderEditor,
    removeFolder, folderToDelete, setFolderToDelete, folderPreferences, folderNotice, changeFolderAppearance, copyFolderLink,
    renameFolder: (folder: ClassFolder, name: string) => updateFolder(folder.id, { ...folder, name }),
    hasLiveMaterial: (folderId: string) => liveFolderIds.has(folderId),
    visibleSummaries
  };
}
