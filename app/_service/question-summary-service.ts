import { getUploadSession } from "@/app/_infrastructure/supabase/client";
import type { ClassFolder, Question } from "@/app/_model/types";

export type SummaryMode = "cluster" | "report";
export class SummaryError extends Error {
  constructor(readonly status: number) { super(`Question summary ${status}`); }
}

// ponytail: 페이지 메모리 캐시. 같은 질문으로 다시 열면 Groq를 다시 부르지 않는다. 새로고침하면 다시 만든다.
const cache = new Map<string, Promise<unknown>>();

export type SummaryItem = { text: string; page: number; reactions: number };
export const toSummaryItems = (questions: readonly Question[]): SummaryItem[] =>
  questions.map((question) => ({ text: question.text, page: question.slideIndex + 1, reactions: Math.max(0, question.reactionCount) }));

export const REPORT_SECTIONS = ["summary", "pages", "questions", "improvements"] as const;
export type ReportSections = Record<(typeof REPORT_SECTIONS)[number], string[]>;

/** 요약 관점을 정하는 폴더 사용 목적. 미분류 자료는 null. */
export type SummaryPurpose = Pick<ClassFolder, "purpose" | "purposeLabel"> | null | undefined;
const purposeBody = (folder: SummaryPurpose) => folder ? { purpose: folder.purpose, purposeLabel: folder.purposeLabel ?? null } : {};

function requestSummary<T>(mode: SummaryMode, items: readonly SummaryItem[], locale: string, folder: SummaryPurpose, pick: (payload: Record<string, unknown> | null) => T | undefined) {
  const key = JSON.stringify([mode, locale, purposeBody(folder), items]);
  let request = cache.get(key) as Promise<T> | undefined;
  if (!request) {
    request = (async () => {
      const auth = await getUploadSession();
      const response = await fetch("/api/question-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}) },
        body: JSON.stringify({ mode, items, locale, ...purposeBody(folder) }),
      });
      const value = response.ok ? pick(await response.json().catch(() => null)) : undefined;
      if (value === undefined) throw new SummaryError(response.status);
      return value;
    })();
    cache.set(key, request);
    request.catch(() => cache.delete(key));
  }
  return request;
}

export const summarizeQuestions = (items: readonly SummaryItem[], locale: string, folder: SummaryPurpose) =>
  requestSummary("cluster", items, locale, folder, (payload) => typeof payload?.summary === "string" ? payload.summary : undefined);

export const summarizeReport = (items: readonly SummaryItem[], locale: string, folder: SummaryPurpose) =>
  requestSummary("report", items, locale, folder, (payload) => {
    const report = payload?.report as ReportSections | undefined;
    return report && REPORT_SECTIONS.every((section) => Array.isArray(report[section])) ? report : undefined;
  });
