"use client";

import { useState, useSyncExternalStore, type UIEvent } from "react";
import { useParams } from "next/navigation";
import { useReport } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import { CHAT_FILE_MAX_BYTES, CHAT_IMAGE_MAX_BYTES } from "@/app/_model/report";
import { summarizeEndReport } from "@/app/_model/stats";

const WIDE = "(min-width: 1024px)";
const watchWide = (change: () => void) => { const query = matchMedia(WIDE); query.addEventListener("change", change); return () => query.removeEventListener("change", change); };

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
  // RPT-057/058: this question's attachment and source-data choice.
  const [file, setFile] = useState<{ name: string; data: string } | null>(null), [fileError, setFileError] = useState("");
  const [withData, setWithData] = useState(true);
  // RPT-059: chips only fill the input, so a stray click never spends a question. They are questions; the chat never edits (RPT-050).
  const topSlide = material ? summarizeEndReport(material.slides.length, material.questions).topSlides.find((slide) => slide !== null) : undefined;
  const suggestions = [{ label: "세 줄 요약", prompt: "이 리포트의 핵심을 세 줄로 요약해줘." }, { label: "다음 강의 개선점", prompt: "질문을 근거로 다음 강의에서 보완할 점 세 가지를 알려줘." },
    ...topSlide ? [{ label: `슬라이드 ${topSlide} 원인`, prompt: `슬라이드 ${topSlide}에 질문이 가장 많았던 이유가 뭘까?` }] : []];
  const sections = report.doc?.sections ?? [];
  const active = sections.find((section) => section.id === activeId) ?? sections[0];

  const focusSection = (sectionId: string) => requestAnimationFrame(() => {
    const node = document.getElementById(`section-${sectionId}`);
    node?.scrollIntoView({ block: "start" }); node?.focus({ preventScroll: true });
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
    submit: async () => {
      const question = draft.trim();
      if (!question || report.pending) return;
      setDraft("");
      if (!(await report.send(question, active?.slide, { withData, file }))) setDraft(question);
      else setFile(null);
    },
  };
}
