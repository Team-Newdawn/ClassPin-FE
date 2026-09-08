"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/_controller/auth-context";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { useSlideUpload } from "@/app/_controller/use-slide-upload";
import { buildMaterialSearchIndex, searchMaterialIndex } from "@/app/_model/material-search";
import { buildSessionInsights } from "@/app/_model/stats";
import type { AiReportPreflight, AiReportSummary } from "@/app/_model/ai-report";
import { createAiReport, fetchAiReports, preflightAiReport } from "@/app/_service/ai-report-service";
import type { ClassSession } from "@/app/_model/types";

type PageTab = "materials" | "insights";
type View = "grid" | "list";

export function useFolderController() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const folderId = id === "unfiled" ? null : id;
  const { t } = useLanguage();
  const { folders, sessions, deleteSession, moveSessionToFolder, ready } = useSessions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<PageTab>(() => searchParams.get("tab") === "insights" ? "insights" : "materials");
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
  const selectedSessions = useMemo(
    () => selectedScope === "all" ? sessions : sessions.filter((session) => session.id === selectedScope),
    [selectedScope, sessions]
  );
  const insights = useMemo(
    () => buildSessionInsights(selectedSessions, defaultCategoryLabel),
    [defaultCategoryLabel, selectedSessions]
  );

  return {
    t,
    timeAgo,
    selectedScope,
    setScope,
    ...insights
  };
}

export function useAiReportCreationController(sessions: ClassSession[], folderId: string | null) {
  const router = useRouter();
  const { configured } = useAuth();
  const { t } = useLanguage();
  const availableSessions = useMemo(
    () => sessions.filter((session) => session.materialId),
    [sessions],
  );
  const availableIds = useMemo(
    () => availableSessions.map((session) => session.materialId as string),
    [availableSessions],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(availableIds));
  const validSelectedIds = useMemo(
    () => availableIds.filter((id) => selectedIds.has(id)),
    [availableIds, selectedIds],
  );
  const [preflight, setPreflight] = useState<AiReportPreflight | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((materialId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelectedIds(new Set(availableIds)), [availableIds]);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const closePreflight = useCallback(() => {
    if (busy) return;
    setPreflight(null);
    setError(null);
  }, [busy]);

  const requestPreflight = useCallback(async () => {
    if (!configured || !validSelectedIds.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const folderSelected = folderId !== null && validSelectedIds.length === availableIds.length;
      const result = await preflightAiReport({
        materialIds: validSelectedIds,
        selectionKind: folderSelected ? "folder" : validSelectedIds.length === 1 ? "material" : "materials",
        folderId: folderSelected ? folderId : null,
      });
      setPreflight(result);
      setIdempotencyKey(crypto.randomUUID());
    } catch {
      setError(t("aiReport.requestFailed"));
    } finally {
      setBusy(false);
    }
  }, [availableIds.length, busy, configured, folderId, t, validSelectedIds]);

  const create = useCallback(async () => {
    if (!preflight || !idempotencyKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createAiReport({
        quote: preflight.quote,
        idempotencyKey,
        confirmedCost: preflight.requiresCostConfirmation,
      });
      router.push(`/admin/ai-reports/${result.reportId}`);
    } catch {
      setError(t("aiReport.createFailed"));
    } finally {
      setBusy(false);
    }
  }, [busy, idempotencyKey, preflight, router, t]);

  const selectedSessions = availableSessions.filter((session) => session.materialId && validSelectedIds.includes(session.materialId));
  return {
    t,
    configured,
    availableSessions,
    selectedIds,
    selectedCount: validSelectedIds.length,
    selectedSlideCount: selectedSessions.reduce((count, session) => count + session.slides.length, 0),
    selectedQuestionCount: selectedSessions.reduce((count, session) => count + session.questions.length, 0),
    preflight,
    busy,
    error,
    toggle,
    selectAll,
    clear,
    closePreflight,
    requestPreflight,
    create,
  };
}

export function useAiReportHistoryController() {
  const { configured } = useAuth();
  const { t, timeAgo } = useLanguage();
  const [reports, setReports] = useState<AiReportSummary[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState(false);
  const [refreshSequence, setRefreshSequence] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(false);
    setRefreshSequence((sequence) => sequence + 1);
  }, []);

  useEffect(() => {
    if (!configured) return;

    const abortController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const load = async () => {
      try {
        const nextReports = await fetchAiReports(abortController.signal);
        if (stopped) return;
        setReports(nextReports);
        setError(false);
        const hasActiveReport = nextReports.some((report) => report.productStatus === "queued" || report.productStatus === "analyzing");
        if (hasActiveReport) {
          timer = setTimeout(load, document.visibilityState === "hidden" ? 15_000 : 5_000);
        }
      } catch (loadError) {
        if (stopped || (loadError instanceof DOMException && loadError.name === "AbortError")) return;
        setError(true);
      } finally {
        if (!stopped) setLoading(false);
      }
    };

    void load();
    return () => {
      stopped = true;
      abortController.abort();
      if (timer) clearTimeout(timer);
    };
  }, [configured, refreshSequence]);

  return { t, timeAgo, configured, reports, loading, error, refresh };
}
