"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useSlideUpload } from "@/app/_controller/use-slide-upload";
import { summarizeFolders, type FolderSummary } from "@/app/_model/stats";
import { CLASS_UNFILED_COLOR_INDEX } from "@/app/_model/types";

export const UNFILED_ID = "unfiled";

export function useDashboardController() {
  const { t } = useLanguage();
  const { folders, sessions, createFolder, renameFolder, deleteFolder, ready } = useSessions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderEditor, setFolderEditor] = useState<"new" | { id: string; name: string } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [query, setQuery] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start } = useSlideUpload(null);

  const visibleSummaries = useMemo(() => {
    const summaries = summarizeFolders(folders, sessions, {
      id: UNFILED_ID,
      name: t("folders.unfiled"),
      createdAt: "",
      colorIndex: CLASS_UNFILED_COLOR_INDEX
    });
    const needle = query.trim().toLocaleLowerCase();
    return needle ? summaries.filter((folder) => folder.name.toLocaleLowerCase().includes(needle)) : summaries;
  }, [folders, query, sessions, t]);

  const pick = (file?: File) => {
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

  const submitFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderEditor) return;
    setFolderError(null);
    setSavingFolder(true);
    try {
      if (folderEditor === "new") await createFolder(folderName);
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
    folders,
    ready,
    inputRef,
    folderEditor,
    folderName,
    setFolderName,
    query,
    setQuery,
    folderError,
    savingFolder,
    deletingFolderId,
    folderActionError,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((open) => !open),
    phase,
    uploadPct,
    uploadError,
    slides,
    total,
    showPreview,
    busy,
    pick,
    requestUpload: () => inputRef.current?.click(),
    submitFolder,
    openFolderEditor,
    closeFolderEditor,
    removeFolder,
    visibleSummaries
  };
}
