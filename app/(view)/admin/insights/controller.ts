"use client";

import { useEffect, useMemo, useState } from "react";
import { reportRequest, useOpenReport } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import type { ReportView } from "@/app/_model/report";

/** DSH-053: one order only, most recent lecture first. */
export const lectureDate = (session: { startedAt: string | null; createdAt: string }) => session.startedAt ?? session.createdAt;

/** docs/instructor-insight-dashboard.md §7. */
export function useInsightListController() {
  const { sessions, folders, ready } = useSessions();
  const [reports, setReports] = useState<Pick<ReportView, "materialId" | "updatedAt">[]>([]);
  const [query, setQuery] = useState(""), [folderId, setFolderId] = useState("all"), [sidebarOpen, setSidebarOpen] = useState(true);
  const report = useOpenReport();
  useEffect(() => {
    const controller = new AbortController();
    // Recent insights are optional (DSH-052): a failed list only hides that section.
    reportRequest("/api/admin/reports", { signal: controller.signal }).then((response) => response.json())
      .then((body: { reports: typeof reports }) => setReports(body.reports), () => undefined);
    return () => controller.abort();
  }, []);

  const folderName = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);
  // Titles from macOS file names arrive decomposed (NFD), so both sides compare composed.
  const fold = (text: string) => text.normalize("NFC").toLowerCase(), needle = fold(query.trim());
  const matches = sessions.filter((session) => !needle || fold(session.title).includes(needle) || fold(folderName.get(session.folderId ?? "") ?? "").includes(needle));
  const reportedAt = new Map(reports.map((row) => [row.materialId, row.updatedAt]));
  const recent = matches.filter((session) => session.materialId && reportedAt.has(session.materialId))
    .sort((a, b) => reportedAt.get(b.materialId!)!.localeCompare(reportedAt.get(a.materialId!)!)).slice(0, 4);
  const files = matches.filter((session) => folderId === "all" || (session.folderId ?? "") === folderId)
    .sort((a, b) => lectureDate(b).localeCompare(lectureDate(a)));

  return { ready, empty: !sessions.length, recent, files, folders, folderName, query, setQuery, folderId, setFolderId, report,
    sidebarOpen, toggleSidebar: () => setSidebarOpen((open) => !open) };
}
