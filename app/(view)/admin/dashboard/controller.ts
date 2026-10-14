"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";

import { summarizeFolders, type FolderSummary } from "@/app/_model/stats";
import { CLASS_FOLDER_DEFAULT_COLOR_INDEX, CLASS_FOLDER_DEFAULT_PURPOSE, CLASS_UNFILED_COLOR_INDEX, type ClassFolderPurpose } from "@/app/_model/types";

import { useAuth } from "@/app/_controller/auth-context";
export const UNFILED_ID = "unfiled";

export function useDashboardController() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const { folders, sessions, createFolder, renameFolder, deleteFolder, ready } = useSessions();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderEditor, setFolderEditor] = useState<"new" | { id: string; name: string } | null>(null);
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

  const visibleSummaries = useMemo(() => {
    const summaries = summarizeFolders(folders, sessions, {
      id: UNFILED_ID,
      name: t("folders.unfiled"),
      createdAt: "",
      colorIndex: CLASS_UNFILED_COLOR_INDEX,
      purpose: CLASS_FOLDER_DEFAULT_PURPOSE
    });
    const needle = query.trim().toLocaleLowerCase();
    return summaries.filter((folder) => folder.name.toLocaleLowerCase().includes(needle)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0));
  }, [folders, query, sessions, sort, t]);



  const submitFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderEditor) return;
    setFolderError(null);
    setSavingFolder(true);
    try {
      if (folderEditor === "new") await createFolder({ name: folderName, colorIndex: folderColorIndex, purpose: folderPurpose, purposeLabel: folderPurposeLabel });
      else await renameFolder(folderEditor.id, folderName);
      setFolderName("");
      setFolderEditor(null);
    } catch {
      setFolderError(t(folderEditor === "new" ? "folders.createError" : "folders.renameError"));
    } finally {
      setSavingFolder(false);
    }
  };

  const openFolderEditor = (folder: "new" | { id: string; name: string }) => {
    setFolderError(null);
    setFolderName(folder === "new" ? "" : folder.name);
    if (folder === "new") {
      setFolderColorIndex(CLASS_FOLDER_DEFAULT_COLOR_INDEX);
      setFolderPurpose(CLASS_FOLDER_DEFAULT_PURPOSE);
      setFolderPurposeLabel("");
    }
    setFolderEditor(folder);
  };

  const closeFolderEditor = () => {
    if (!savingFolder) setFolderEditor(null);
  };

  const removeFolder = async (folder: FolderSummary) => {
    if (deletingFolderId || !window.confirm(t("folders.deleteConfirm", { name: folder.name, count: folder.materialCount }))) return;
    setDeletingFolderId(folder.id);
    setFolderActionError(null);
    try {
      await deleteFolder(folder.id);
    } catch (error) {
      console.error("Class folder deletion failed", error);
      setFolderActionError(t("folders.deleteError"));
    } finally {
      setDeletingFolderId(null);
    }
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
    folderActionError,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((open) => !open),
    requestUpload: () => setUploadOpen(true),
    submitFolder,
    openFolderEditor,
    closeFolderEditor,
    removeFolder,
    visibleSummaries
  };
}
