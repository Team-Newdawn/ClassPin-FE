"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reportApi, type ReportApiError } from "../_service/report-api";
import type { ReportView } from "../_model/report";

const POLL_MS = 3000;
// RPT-092: next step for the user, never internal or AI-provider detail.
const messages: Record<string, string> = {
  LECTURE_NOT_ENDED: "강의를 종료한 뒤 리포트를 만들 수 있습니다.", ANALYSIS_NOT_CONFIGURED: "AI 초안을 사용할 수 없습니다. 수치만으로 시작할 수 있어요.",
  REPORT_STORAGE_NOT_CONFIGURED: "리포트 저장소 설정이 필요합니다.", REPORT_STORAGE_UNAVAILABLE: "리포트 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", DAILY_LIMIT: "오늘 AI 초안 생성 횟수를 모두 사용했습니다. 내일 다시 시도하거나 수치만으로 시작해 주세요.",
  SOURCE_NOT_FOUND: "자료가 삭제되었거나 접근 권한이 없습니다.", SOURCE_TOO_LARGE: "자료가 너무 커서 초안을 만들 수 없습니다(600쪽, 200MB 이하).",
  SOURCE_DOWNLOAD_FAILED: "원본 자료를 읽지 못했습니다. 다시 시도해 주세요.", ANALYSIS_INTERRUPTED: "초안 생성이 중간에 멈췄습니다. 다시 시도해 주세요.",
  ANALYSIS_CANCELLED: "초안 생성을 취소했습니다.", ANALYSIS_FAILED: "초안을 만들지 못했습니다. 다시 시도해 주세요.",
  AI_REFUSED: "AI가 이 자료의 초안 작성을 거부했습니다. 수치만으로 시작할 수 있어요.", AI_TRUNCATED: "AI 응답이 잘렸습니다. 다시 시도해 주세요.",
  AI_INVALID_OUTPUT: "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.", AI_UNAVAILABLE: "AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  REPORT_NOT_READY: "초안이 완성된 뒤 사용할 수 있습니다.", CHAT_LIMIT: "이 리포트의 AI 질문 5회를 모두 사용했습니다.",
  CHAT_BUSY: "이 리포트의 다른 질문에 답하는 중이에요. 답변이 끝난 뒤 다시 보내 주세요.",
  REPORT_DRAFTING: "초안을 만드는 중에는 할 수 없습니다. 끝난 뒤 다시 시도해 주세요.",
  INVALID_FILE: "PDF, PNG·JPG 이미지, 텍스트(TXT·MD·CSV) 파일만 첨부할 수 있어요.", FILE_TOO_LARGE: "첨부 파일은 10MB(이미지는 5MB) 이하만 보낼 수 있어요.",
  EXPORT_PREVIEW_FAILED: "미리보기를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
export const reportMessage = (code: string | null) => messages[code ?? ""] ?? messages.ANALYSIS_FAILED;
type RequestError = Error & { status?: number; code?: string };

/** RPT API request; failures throw a user-facing message with the HTTP status and error code still attached. */
export const reportRequest = (path: string, init?: RequestInit) => reportApi(path, init).catch((failure: ReportApiError) => {
  // Network failures and aborts keep their own error.
  if (failure.message === "UNAUTHENTICATED") failure.message = "로그인이 필요합니다.";
  else if (failure.status) failure.message = messages[failure.code ?? ""] ?? (failure.status === 404 ? "리포트를 찾을 수 없습니다." : "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  throw failure;
});
const json = async (response: Promise<Response>) => (await (await response).json()) as ReportView;

/** RPT-012: creates a report for the material (and starts its draft), then opens it. */
export function useOpenReport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  /** RPT-036: `form.request` is the instructor's prompt from /admin/reports. */
  const open = async (materialId: string, form: { request?: string } = {}) => {
    const create = (metricsOnly?: boolean) => json(reportRequest("/api/admin/reports", { method: "POST", body: JSON.stringify({ materialId, ...form, ...(metricsOnly ? { metricsOnly } : {}) }) }));
    setBusy(true); setError("");
    try {
      const view = await create().catch((failure: RequestError) => {
        if (failure.code !== "ANALYSIS_NOT_CONFIGURED" || !confirm("AI 초안을 사용할 수 없습니다. 수치만으로 리포트를 시작할까요?")) throw failure;
        return create(true);
      });
      router.push(`/admin/reports/${view.id}`);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  return { open, busy, error };
}

/** RPT-008 (2026-11-04): a report is read-only. This loads it, follows a running draft, and runs the Q&A chat. */
export function useReport(id: string) {
  const [report, setReport] = useState<ReportView | null>(null);
  const [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ question: string; answer: string } | null>(null), [answerStatus, setAnswerStatus] = useState("");
  const chatStop = useRef<AbortController | null>(null);
  const path = `/api/admin/reports/${id}`;

  useEffect(() => {
    const controller = new AbortController();
    json(reportRequest(path, { signal: controller.signal })).then(setReport, (failure: Error) => { if (!controller.signal.aborted) setLoadError(failure.message); });
    return () => controller.abort();
  }, [path]);

  // RPT-032: follow a running draft, also after leaving and coming back. A hidden tab skips its turn.
  const drafting = report?.status === "drafting";
  useEffect(() => {
    if (!drafting) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => { timer = setTimeout(async () => {
      if (document.visibilityState !== "hidden") await json(reportRequest(path, { signal: controller.signal })).then(setReport, () => {});
      if (!controller.signal.aborted) poll();
    }, POLL_MS); };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [drafting, path]);

  const run = async (request: () => Promise<ReportView>) => {
    setBusy(true); setError("");
    try { setReport(await request()); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  };
  const post = (body: Record<string, unknown>) => json(reportRequest(path, { method: "POST", body: JSON.stringify(body) }));

  /** Streams one answer; resolves false when it was stopped or failed so the caller can restore the question. */
  /** RPT-057/058: `file` is base64 for this question only; `withData: false` leaves the source slides and questions out. */
  const send = async (question: string, slide: number | undefined, extra: { withData: boolean; file: { name: string; data: string } | null }) => {
    setError(""); setAnswerStatus(""); setPending({ question, answer: "" });
    const stop = chatStop.current = new AbortController();
    let streaming = false;
    try {
      const response = await reportRequest(path, { method: "POST", signal: stop.signal, body: JSON.stringify({ action: "chat", message: question, ...(slide ? { slide } : {}), withData: extra.withData, ...(extra.file ? { file: extra.file } : {}) }) });
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let answer = "";
      streaming = true;
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) { answer += chunk.value; setPending({ question, answer }); }
      setAnswerStatus("AI 답변을 받았습니다.");
      return true;
    } catch (failure) {
      setError(stop.signal.aborted ? `답변을 중지했습니다.${process.env.NODE_ENV === "development" ? "" : " 이 질문도 남은 횟수에 포함됩니다."}`
        : streaming ? "답변이 중간에 끊겼습니다. 다시 질문해 주세요." : (failure as Error).message);
      return false;
    } finally {
      chatStop.current = null;
      // The saved turns come from the server; keep the streamed text on screen until they arrive.
      await json(reportRequest(path)).then(setReport, () => {});
      setPending(null);
    }
  };

  return {
    report, doc: report?.document ?? null, error, loadError, busy, pending, answerStatus, send,
    stopChat: () => chatStop.current?.abort(),
    /** RPT-033: runs a failed first draft again, or starts from the numbers only. */
    retry: (metricsOnly = false) => void run(() => post({ action: "retry", metricsOnly })),
    cancel: () => run(() => post({ action: "cancel" })),
    /** RPT-004: the page asks first (its own dialog); resolves once the reset is saved or has failed (error set). */
    reset: () => run(() => post({ action: "reset" })),
  };
}
