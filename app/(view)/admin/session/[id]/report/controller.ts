"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSessions } from "@/app/_controller/session-store";
import { useLanguage } from "@/app/_controller/language-context";
import { useOpenReport } from "@/app/_controller/use-report";
import { summarizeEndReport } from "@/app/_model/stats";
import { CLASS_FOLDER_DEFAULT_PURPOSE, type ClassSession } from "@/app/_model/types";
import { REPORT_SECTIONS, SummaryError, summarizeReport, toSummaryItems, type ReportSections, type SummaryPurpose } from "@/app/_service/question-summary-service";

export const REPORT_SUMMARY_LIMIT = 200;
export type { SummaryPurpose };

/** The session this route shows; a direct visit loads it once when the store does not have it. */
export function useEndReportPage() {
  const { id } = useParams<{ id: string }>();
  const { sessions, folders, ready, loadSessionById } = useSessions();
  const [lookupDone, setLookupDone] = useState(false);
  const session = sessions.find((item) => item.id === id);
  useEffect(() => { if (ready && !session && !lookupDone) void loadSessionById(id).catch(console.error).finally(() => setLookupDone(true)); }, [id, ready, session, lookupDone, loadSessionById]);
  return { session, folder: folders.find((item) => item.id === session?.folderId) ?? null, loading: !ready || (!session && !lookupDone) };
}

export function useSessionEndReport(session: ClassSession, folder: SummaryPurpose) {
  const { locale } = useLanguage();
  const report = useOpenReport();
  const stats = useMemo(() => summarizeEndReport(session.slides.length, session.questions), [session.slides.length, session.questions]);
  // 공감이 많은 질문부터 최대 200개를 근거 페이지와 함께 보낸다.
  const itemsKey = useMemo(() => JSON.stringify(toSummaryItems([...session.questions].sort((a, b) => b.reactionCount - a.reactionCount).slice(0, REPORT_SUMMARY_LIMIT))), [session.questions]);
  const [attempt, setAttempt] = useState(0);
  const [summary, setSummary] = useState<{ key: string; status: "done" | "error" | "unconfigured"; report?: ReportSections }>();
  const purpose = folder?.purpose ?? null;
  const purposeLabel = folder?.purposeLabel ?? null;
  const summaryKey = `${locale}:${attempt}:${purpose}:${purposeLabel}:${itemsKey}`;
  useEffect(() => {
    if (itemsKey === "[]") return;
    let active = true;
    summarizeReport(JSON.parse(itemsKey), locale, purpose && { purpose, purposeLabel }).then(
      (report) => { if (active) setSummary({ key: summaryKey, status: "done", report }); },
      (error) => {
        console.error("End report summary failed", error);
        if (active) setSummary({ key: summaryKey, status: error instanceof SummaryError && error.status === 503 ? "unconfigured" : "error" });
      },
    );
    return () => { active = false; };
  }, [itemsKey, locale, purpose, purposeLabel, summaryKey]);
  const aiState = itemsKey === "[]" ? "empty" : summary?.key === summaryKey ? summary.status : "loading";
  return { ...stats, report, aiState, sections: aiState === "done" ? REPORT_SECTIONS.flatMap((key) => summary!.report![key].length ? [{ key, lines: summary!.report![key] }] : []) : [],
    // 미분류 자료는 기본 목적(Q&A) 문구를 쓴다.
    tone: purpose ?? CLASS_FOLDER_DEFAULT_PURPOSE, retry: () => setAttempt((value) => value + 1) };
}
