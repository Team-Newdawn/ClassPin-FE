"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type UIEvent } from "react";
import { useParams } from "next/navigation";
import { useReport } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import type { ReportDocument, ReportSection } from "@/app/_model/report";

export const CHAT_MIN = 360, CHAT_MAX = 560;
const clampChat = (width: number) => Math.min(CHAT_MAX, Math.max(CHAT_MIN, Math.round(width)));
const WIDE = "(min-width: 1024px)";
const watchWide = (change: () => void) => { const query = matchMedia(WIDE); query.addEventListener("change", change); return () => query.removeEventListener("change", change); };
const withSections = (change: (sections: ReportSection[]) => ReportSection[]) => (doc: ReportDocument) => ({ ...doc, sections: change(doc.sections) });

export function useReportEditorController() {
  const { id } = useParams<{ id: string }>();
  const report = useReport(id);
  const { sessions } = useSessions();
  const material = report.report ? sessions.find((session) => session.materialId === report.report!.materialId) : undefined;
  // RPT-101/108: the TOC rail starts open from lg up and closed below; the header button overrides that.
  const wide = useSyncExternalStore(watchWide, () => matchMedia(WIDE).matches, () => true);
  const [tocChoice, setTocChoice] = useState<boolean | null>(null), tocOpen = tocChoice ?? wide;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatWidth, setChatWidth] = useState(400), [chatOpen, setChatOpen] = useState(false), [draft, setDraft] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const sections = report.doc?.sections ?? [];
  const active = sections.find((section) => section.id === activeId) ?? sections[0];
  const { edit } = report;

  const focusSection = (sectionId: string) => requestAnimationFrame(() => {
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ block: "start" });
    document.getElementById(`section-title-${sectionId}`)?.focus({ preventScroll: true });
  });

  return {
    ...report, material, sections, active, tocOpen, chatWidth, chatOpen, draft, setDraft, exportOpen, setExportOpen,
    toggleToc: () => setTocChoice(!tocOpen),
    toggleChat: () => setChatOpen((open) => !open),
    goToSection: (sectionId: string) => { setActiveId(sectionId); focusSection(sectionId); if (!wide) setTocChoice(false); },
    /** Highlights the last section whose top has scrolled past the top of the document column. */
    trackSection: (event: UIEvent<HTMLElement>) => {
      const top = event.currentTarget.getBoundingClientRect().top + 96;
      let current: string | undefined;
      for (const node of event.currentTarget.querySelectorAll<HTMLElement>("[data-section]")) { if (node.getBoundingClientRect().top > top) break; current = node.dataset.section; }
      setActiveId(current ?? null);
    },
    setTitle: (title: string) => edit((doc) => ({ ...doc, title })),
    updateSection: (sectionId: string, patch: Partial<ReportSection>) =>
      edit(withSections((list) => list.map((section) => section.id === sectionId ? { ...section, ...patch } : section)), sectionId),
    addSection: () => {
      const section = { id: crypto.randomUUID(), title: "", text: "" };
      edit(withSections((list) => [...list, section]));
      focusSection(section.id);
    },
    submit: async () => {
      const question = draft.trim();
      if (!question || report.pending) return;
      setDraft("");
      if (!(await report.send(question, active?.slide))) setDraft(question);
    },
    // RPT-013: same drag + keyboard resize as the live player's question panel.
    startResize: (event: PointerEvent<HTMLDivElement>) => { resizeStart.current = { x: event.clientX, width: chatWidth }; event.currentTarget.setPointerCapture(event.pointerId); },
    resize: (event: PointerEvent<HTMLDivElement>) => { if (resizeStart.current) setChatWidth(clampChat(resizeStart.current.width + resizeStart.current.x - event.clientX)); },
    endResize: () => { resizeStart.current = null; },
    resizeByKeyboard: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setChatWidth((width) => clampChat(width + (event.key === "ArrowLeft" ? 20 : -20)));
    },
  };
}
