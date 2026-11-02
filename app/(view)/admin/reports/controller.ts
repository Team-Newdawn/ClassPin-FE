"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { reportRequest, useOpenReport } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import type { ReportTemplate, ReportView } from "@/app/_model/report";

export type ReportSummary = Pick<ReportView, "id" | "materialId" | "template" | "title" | "status" | "updatedAt">;

/** docs/instructor-report-authoring.md RPT-011/036: create a report (one per material) and list the instructor's reports. */
export function useReportHomeController() {
  const { sessions, folders, ready } = useSessions();
  const report = useOpenReport();
  const params = useSearchParams();
  const [reports, setReports] = useState<ReportSummary[] | null>(null), [listError, setListError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // The report the delete dialog asks about; its error stays inside the dialog.
  const [deleteTarget, setDeleteTarget] = useState<ReportSummary | null>(null);
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState("");
  const askDelete = (row: ReportSummary | null) => { setDeleteTarget(row); setDeleteError(""); };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError("");
    try {
      await reportRequest(`/api/admin/reports/${deleteTarget.id}`, { method: "DELETE" });
      setReports((rows) => rows && rows.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (failure) { setDeleteError((failure as Error).message); }
    finally { setDeleting(false); }
  };
  // `?material=` (from the analysis dashboard) preselects that material and its folder.
  const preset = sessions.find((session) => session.materialId === params.get("material"));
  const [picked, setPicked] = useState<{ folderId?: string; materialId?: string }>({});
  const [template, setTemplate] = useState<ReportTemplate>("executive"), [request, setRequest] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    reportRequest("/api/admin/reports", { signal: controller.signal }).then((response) => response.json())
      .then((body: { reports: ReportSummary[] }) => setReports(body.reports), (failure: Error) => { if (!controller.signal.aborted) setListError(failure.message); });
    return () => controller.abort();
  }, []);

  const materials = sessions.filter((session) => session.materialId);
  const folderId = picked.folderId ?? (preset ? preset.folderId ?? "" : folders[0]?.id ?? "");
  const inFolder = materials.filter((session) => (session.folderId ?? "") === folderId);
  // Default: the preset material, else the folder's first ended lecture.
  const materialId = picked.materialId ?? (preset && (preset.folderId ?? "") === folderId ? preset.materialId!
    : inFolder.find((session) => session.status === "ended")?.materialId ?? "");
  const folderName = new Map(folders.map((folder) => [folder.id, folder.name]));

  return {
    ready, folders, inFolder, folderId, materialId, template, request, report,
    reports, listError, deleteTarget, deleting, deleteError, askDelete, confirmDelete, sidebarOpen, toggleSidebar: () => setSidebarOpen((open) => !open),
    folderOf: (row: ReportSummary) => folderName.get(sessions.find((session) => session.materialId === row.materialId)?.folderId ?? "") ?? "미분류",
    setFolder: (id: string) => setPicked({ folderId: id }), setMaterial: (id: string) => setPicked({ folderId, materialId: id }), setTemplate, setRequest,
    create: () => void report.open(materialId, { template, ...(request.trim() ? { request: request.trim() } : {}) }),
  };
}
