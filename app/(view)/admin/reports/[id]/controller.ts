"use client";

import { useState, useSyncExternalStore, type UIEvent } from "react";
import { useParams } from "next/navigation";
import { useReport } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import { CHAT_FILE_MAX_BYTES, CHAT_IMAGE_MAX_BYTES, type ReportDocument, type ReportSection } from "@/app/_model/report";
import { summarizeEndReport } from "@/app/_model/stats";

const WIDE = "(min-width: 1024px)";
const watchWide = (change: () => void) => { const query = matchMedia(WIDE); query.addEventListener("change", change); return () => query.removeEventListener("change", change); };
const withSections = (change: (sections: ReportSection[]) => ReportSection[]) => (doc: ReportDocument) => ({ ...doc, sections: change(doc.sections) });

export function useReportEditorController() {
  const { id } = useParams<{ id: string }>();
  const report = useReport(id);
  const { sessions, folders } = useSessions();
  const material = report.report ? sessions.find((session) => session.materialId === report.report!.materialId) : undefined;
  // RPT-101/108: the TOC rail starts open from lg up and closed below; the header button overrides that.
  const wide = useSyncExternalStore(watchWide, () => matchMedia(WIDE).matches, () => true);
  // RPT-101/105: the TOC and the chat panel start open from lg up; below it the TOC is a drawer and the chat a closed panel or sheet.
  const [tocChoice, setTocChoice] = useState<boolean | null>(null), tocOpen = tocChoice ?? wide, [chatChoice, setChatChoice] = useState<boolean | null>(null), chatOpen = chatChoice ?? wide;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  // RPT-021: the last deleted section and where it was, until the next delete or leaving the page.
  const [removed, setRemoved] = useState<{ section: ReportSection; index: number } | null>(null);
  // RPT-057/058: this question's attachment and source-data choice.
  const [file, setFile] = useState<{ name: string; data: string } | null>(null), [fileError, setFileError] = useState("");
  const [withData, setWithData] = useState(true);
  // RPT-059: chips only fill the input, so a stray click never spends a question.
  const topSlide = material ? summarizeEndReport(material.slides.length, material.questions).topSlides.find((slide) => slide !== null) : undefined;
  const suggestions = [{ label: "더 간결하게", prompt: "리포트 본문을 핵심만 남겨 더 간결하게 다듬어줘." }, { label: "표로 정리", prompt: "핵심 수치와 비교 내용을 표로 정리해줘." },
    ...topSlide ? [{ label: `슬라이드 ${topSlide} 원인`, prompt: `슬라이드 ${topSlide}에 질문이 가장 많았던 이유를 짧게 정리해서 넣어줘.` }] : []];
  const sections = report.doc?.sections ?? [];
  const active = sections.find((section) => section.id === activeId) ?? sections[0];
  const { edit } = report;

  const focusSection = (sectionId: string) => requestAnimationFrame(() => {
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ block: "start" });
    document.getElementById(`section-title-${sectionId}`)?.focus({ preventScroll: true });
  });

  return {
    ...report, material, folders, sections, active, tocOpen, chatOpen, sidebarOpen, draft, setDraft, exportOpen, setExportOpen,
    file, fileError, withData, setWithData, suggestions, clearFile: () => { setFile(null); setFileError(""); },
    pickFile: (picked: File | undefined) => {
      setFileError("");
      if (!picked) return;
      // The server re-checks the bytes; this only spares a doomed upload.
      if (picked.size > (/\.(png|jpe?g)$/i.test(picked.name) ? CHAT_IMAGE_MAX_BYTES : CHAT_FILE_MAX_BYTES)) { setFileError("첨부 파일은 10MB(이미지는 5MB) 이하만 보낼 수 있어요."); return; }
      const reader = new FileReader();
      reader.onload = () => setFile({ name: picked.name, data: String(reader.result).split(",")[1] ?? "" });
      reader.onerror = () => setFileError("파일을 읽지 못했어요. 다시 골라 주세요.");
      reader.readAsDataURL(picked);
    },
    toggleToc: () => setTocChoice(!tocOpen),
    // The button that was pressed disappears, so focus moves to its counterpart (the open button, or the chat input).
    toggleChat: () => { setChatChoice(!chatOpen); requestAnimationFrame(() => document.getElementById(chatOpen ? "report-chat-open" : "report-chat-input")?.focus()); },
    toggleSidebar: () => setSidebarOpen(!sidebarOpen),
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
    removed,
    removeSection: (sectionId: string) => {
      const index = sections.findIndex((section) => section.id === sectionId);
      if (index < 0) return;
      setRemoved({ section: sections[index], index });
      edit(withSections((list) => list.filter((section) => section.id !== sectionId)));
      // Focus moves to the section that took its place (or the one before), never off the page.
      const next = sections[index + 1] ?? sections[index - 1];
      if (next) focusSection(next.id); else requestAnimationFrame(() => document.getElementById("report-restore-section")?.focus());
    },
    restoreSection: () => {
      if (!removed) return;
      edit(withSections((list) => [...list.slice(0, removed.index), removed.section, ...list.slice(removed.index)]));
      focusSection(removed.section.id); setRemoved(null);
    },
    addSection: () => {
      const section = { id: crypto.randomUUID(), title: "", text: "" };
      edit(withSections((list) => [...list, section]));
      focusSection(section.id);
    },
    submit: async () => {
      const question = draft.trim();
      if (!question || report.pending) return;
      setDraft("");
      if (!(await report.send(question, active?.slide, { withData, file }))) setDraft(question);
      else setFile(null);
    },
  };
}
