"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";

import { buildMaterialSearchIndex, searchMaterialIndex } from "@/app/_model/material-search";
import type { ClassSession } from "@/app/_model/types";

type View = "grid" | "list";

export function useFolderController() {
  const { id } = useParams<{ id: string }>();
  const folderId = id === "unfiled" ? null : id;
  const { t } = useLanguage();
  const { folders, sessions, deleteSession, moveSessionToFolder, ready } = useSessions();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [view, setView] = useState<View>("grid");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassSession | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const folder = folderId === null ? { id: "unfiled", name: t("folders.unfiled") } : folders.find((item) => item.id === folderId);
  const scopedSessions = useMemo(() => sessions.filter((session) => session.folderId === folderId), [folderId, sessions]);
  const searchIndex = useMemo(() => buildMaterialSearchIndex(scopedSessions), [scopedSessions]);
  const visibleSessions = useMemo(() => searchMaterialIndex(searchIndex, query), [query, searchIndex]);



  const move = async (sessionId: string, nextFolderId: string) => {
    setMoveError(null);
    setMovingId(sessionId);
    try {
      await moveSessionToFolder(sessionId, nextFolderId || null);
    } catch {
      setMoveError(t("folders.moveError"));
    } finally {
      setMovingId(null);
    }
  };

  const openDelete = (session: ClassSession) => {
    setDeleteError(null);
    setDeleteTarget(session);
  };

  const closeDelete = () => {
    if (deletingSession) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deletingSession) return;
    setDeletingSession(true);
    setDeleteError(null);
    try {
      await deleteSession(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Class material deletion failed", error);
      setDeleteError(error instanceof Error ? error.message : t("materials.deleteError"));
    } finally {
      setDeletingSession(false);
    }
  };

  return {
    t,
    folderId,
    folders,
    ready,
    uploadOpen,
    closeUpload: () => setUploadOpen(false),
    view,
    setView,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((open) => !open),
    query,
    setQuery,
    movingId,
    moveError,
    deleteTarget,
    deletingSession,
    deleteError,
    folder,
    scopedSessions,
    visibleSessions,
    requestUpload: () => setUploadOpen(true),
    move,
    openDelete,
    closeDelete,
    confirmDelete
  };
}
