"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useSlideUpload } from "@/app/_controller/use-slide-upload";
import { buildMaterialSearchIndex, searchMaterialIndex } from "@/app/_model/material-search";
import { categoryBreakdown, countBy, pinRate, resolveRate, slideHeatmap } from "@/app/_model/stats";
import { defaultQuestionCategorySettings, questionCategoryLabel, type ClassSession, type QuestionCategory } from "@/app/_model/types";

type PageTab = "materials" | "insights";
type View = "grid" | "list";

export function useFolderController() {
  const { id } = useParams<{ id: string }>();
  const folderId = id === "unfiled" ? null : id;
  const { t } = useLanguage();
  const { folders, sessions, deleteSession, moveSessionToFolder, ready } = useSessions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<PageTab>("materials");
  const [view, setView] = useState<View>("grid");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassSession | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start } = useSlideUpload(folderId);

  const folder = folderId === null ? { id: "unfiled", name: t("folders.unfiled") } : folders.find((item) => item.id === folderId);
  const scopedSessions = useMemo(() => sessions.filter((session) => session.folderId === folderId), [folderId, sessions]);
  const searchIndex = useMemo(() => buildMaterialSearchIndex(scopedSessions), [scopedSessions]);
  const visibleSessions = useMemo(() => searchMaterialIndex(searchIndex, query), [query, searchIndex]);

  const pick = (file?: File) => {
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

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
      setDeleteError(t("materials.deleteError"));
    } finally {
      setDeletingSession(false);
    }
  };

  return {
    t,
    folderId,
    folders,
    ready,
    inputRef,
    tab,
    setTab,
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
    phase,
    uploadPct,
    uploadError,
    slides,
    total,
    showPreview,
    busy,
    folder,
    scopedSessions,
    visibleSessions,
    pick,
    requestUpload: () => inputRef.current?.click(),
    move,
    openDelete,
    closeDelete,
    confirmDelete
  };
}

export function useFolderInsightsController(sessions: ClassSession[]) {
  const { t, categoryLabel: defaultCategoryLabel, timeAgo } = useLanguage();
  const [scope, setScope] = useState("all");
  const selectedScope = scope === "all" || sessions.some((session) => session.id === scope) ? scope : "all";
  const selectedSessions = selectedScope === "all" ? sessions : sessions.filter((session) => session.id === selectedScope);
  const questions = selectedSessions.flatMap((session) => session.questions);
  const settingsFor = (category: QuestionCategory) => selectedSessions.find((session) => category in session.questionCategories)?.questionCategories ?? defaultQuestionCategorySettings();
  const categoryLabel = (category: QuestionCategory) => questionCategoryLabel(settingsFor(category), category, defaultCategoryLabel);
  const unanswered = countBy(questions, "unanswered");
  const hotspots = slideHeatmap(selectedSessions);
  const maxHeat = hotspots[0]?.count ?? 0;
  const categories = categoryBreakdown(questions, categoryLabel);
  const maxCategory = categories[0]?.count ?? 0;
  const openQuestions = selectedSessions
    .flatMap((session) => session.questions.filter((question) => question.status === "unanswered").map((question) => ({ question, session })))
    .sort((a, b) => new Date(b.question.createdAt).getTime() - new Date(a.question.createdAt).getTime());

  return {
    t,
    timeAgo,
    selectedScope,
    setScope,
    questions,
    settingsFor,
    categoryLabel,
    unanswered,
    hotspots,
    maxHeat,
    categories,
    maxCategory,
    openQuestions,
    pinRate: pinRate(questions),
    resolveRate: resolveRate(questions),
    resolved: countBy(questions, "resolved")
  };
}
