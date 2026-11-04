"use client";

import { useMemo, useState } from "react";
import { useBrowserPreferences } from "@/app/_controller/use-browser-preferences";
import { useSessions } from "@/app/_controller/session-store";

/** DSH-053: one order only, most recent lecture first. */
export const lectureDate = (session: { startedAt: string | null; createdAt: string }) => session.startedAt ?? session.createdAt;
/** DSH-052: lecture id → when its dashboard was last opened, kept per account in this browser. */
export type RecentAnalyses = { viewed?: Record<string, string> };
export const RECENT_ANALYSES = "recent-analyses";

/** docs/instructor-insight-dashboard.md §7. */
export function useInsightListController() {
  const { sessions, folders, ready } = useSessions();
  const [{ viewed = {} }] = useBrowserPreferences<RecentAnalyses>(RECENT_ANALYSES);
  const [query, setQuery] = useState(""), [folderId, setFolderId] = useState("all"), [sidebarOpen, setSidebarOpen] = useState(true);

  const folderName = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);
  // Titles from macOS file names arrive decomposed (NFD), so both sides compare composed.
  const fold = (text: string) => text.normalize("NFC").toLowerCase(), needle = fold(query.trim());
  const matches = sessions.filter((session) => !needle || fold(session.title).includes(needle) || fold(folderName.get(session.folderId ?? "") ?? "").includes(needle));
  const recent = matches.filter((session) => viewed[session.id]).sort((a, b) => viewed[b.id].localeCompare(viewed[a.id])).slice(0, 4);
  const files = matches.filter((session) => folderId === "all" || (session.folderId ?? "") === folderId)
    .sort((a, b) => lectureDate(b).localeCompare(lectureDate(a)));
  // DSH-053: the folder select shows how many search matches each choice holds.
  const count = (id: string) => id === "all" ? matches.length : matches.filter((session) => (session.folderId ?? "") === id).length;

  return { ready, empty: !sessions.length, recent, files, folders, folderName, query, setQuery, folderId, setFolderId, count,
    sidebarOpen, toggleSidebar: () => setSidebarOpen((open) => !open) };
}
