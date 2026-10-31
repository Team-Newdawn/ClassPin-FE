"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reportApi, type ReportApiError } from "../_service/report-api";
import { staleTargets, type ReportDocument, type ReportView } from "../_model/report";

const SAVE_DELAY_MS = 1000, RETRY_MS = 5000, POLL_MS = 3000;
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
  CHAT_BUSY: "이 리포트의 다른 질문에 답하는 중이에요. 답변이 끝난 뒤 다시 보내 주세요.", NOTHING_TO_UNDO: "되돌릴 이전 문서가 없습니다.", REDRAFT_LIMIT: "이 리포트의 초안 다시 만들기 2회를 모두 사용했습니다.",
  INVALID_DOCUMENT: "문서가 너무 길거나 형식이 올바르지 않아 저장하지 못했습니다. 내용을 줄인 뒤 다시 시도해 주세요.",
  REPORT_CONFLICT: "다른 곳에서 수정되었습니다.", REPORT_DRAFTING: "초안을 만드는 중에는 할 수 없습니다. 끝난 뒤 다시 시도해 주세요.",
  INVALID_PROPOSAL: "변경안이 지금 문서와 맞지 않습니다. AI에게 다시 요청해 주세요.", EXPORT_PREVIEW_FAILED: "미리보기를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
export const reportMessage = (code: string | null) => messages[code ?? ""] ?? messages.ANALYSIS_FAILED;
type RequestError =Error & { status?: number; code?: string; body?: { report?: ReportView } };

/** RPT API request; failures throw a user-facing message with the HTTP status and error code still attached. */
export const reportRequest = (path: string, init?: RequestInit) => reportApi(path, init).catch((failure: ReportApiError) => {
  // Network failures and aborts keep their own error.
  if (failure.message === "UNAUTHENTICATED") failure.message = "로그인이 필요합니다.";
  else if (failure.status) failure.message = messages[failure.code ?? ""] ?? (failure.status === 404 ? "리포트를 찾을 수 없습니다." : "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  throw failure;
});
const json = async (response: Promise<Response>) => (await (await response).json()) as ReportView;

/** RPT-012: opens the material's report, creating it (and its draft) first when none exists. */
export function useOpenReport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const open = async (materialId: string) => {
    const create = (metricsOnly?: boolean) => json(reportRequest("/api/admin/reports", { method: "POST", body: JSON.stringify({ materialId, ...(metricsOnly ? { metricsOnly } : {}) }) }));
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

export type SaveState = "saved" | "saving" | "failed" | "conflict";

export function useReport(id: string) {
  const [report, setReport] = useState<ReportView | null>(null), [doc, setDoc] = useState<ReportDocument | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved"), [conflict, setConflict] = useState<ReportView | null>(null);
  const [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ question: string; answer: string } | null>(null), [answerStatus, setAnswerStatus] = useState("");
  // Edits live here so save/flush always see the newest document; `saved` is the edit version the server last accepted.
  const live = useRef({ doc: null as ReportDocument | null, version: 0, saved: 0, updatedAt: "", conflict: false,
    saving: null as Promise<void> | null, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  // RPT-054: when each section was last typed in and when this tab first saw each proposal.
  const editedAt = useRef(new Map<string, number>()), arrived = useRef(new Map<string, number>());
  const chatStop = useRef<AbortController | null>(null);
  const path = `/api/admin/reports/${id}`;

  /** Takes a server view; the document is replaced only when nothing local is unsaved, unless `replace` forces it. */
  const accept = useCallback((view: ReportView, replace?: boolean) => {
    const s = live.current, now = Date.now();
    for (const message of view.messages) if (message.proposal && !arrived.current.has(message.createdAt)) arrived.current.set(message.createdAt, now);
    setReport(view);
    if (!(replace ?? s.version === s.saved)) return;
    s.doc = view.document; s.saved = s.version; s.updatedAt = view.updatedAt;
    setDoc(view.document); setSaveState("saved");
  }, []);

  const save = useCallback(function save(): Promise<void> {
    const s = live.current, retry = () => { void save().catch(() => {}); };
    clearTimeout(s.timer);
    if (s.saving) return s.saving;
    if (s.version === s.saved || s.conflict || !s.doc) return Promise.resolve();
    const version = s.version;
    setSaveState("saving");
    s.saving = json(reportRequest(path, { method: "PATCH", body: JSON.stringify({ document: s.doc, updatedAt: s.updatedAt }) })).then((view) => {
      s.updatedAt = view.updatedAt; s.saved = version; setReport(view);
      if (s.version === version) setSaveState("saved"); else s.timer = setTimeout(retry, SAVE_DELAY_MS);
    }, (failure: RequestError) => {
      // RPT-041/042: never overwrite on conflict; otherwise keep the edits in memory and retry transient failures.
      if (failure.code === "REPORT_CONFLICT") { s.conflict = true; setConflict(failure.body?.report ?? null); setSaveState("conflict"); throw failure; }
      setSaveState("failed");
      if (!failure.status || failure.status >= 500 || failure.status === 429) s.timer = setTimeout(retry, RETRY_MS); else setError(failure.message);
      throw failure;
    }).finally(() => { s.saving = null; });
    return s.saving;
  }, [path]);

  /** Resolves once every local edit is saved; rejects on conflict or failure (export and document actions wait on it). */
  const flush = useCallback(async () => {
    const s = live.current;
    while (s.version !== s.saved) {
      if (s.conflict) throw new Error("다른 곳에서 수정된 내용을 먼저 정리해 주세요.");
      await save();
    }
  }, [save]);

  const edit = useCallback((change: (doc: ReportDocument) => ReportDocument, sectionId?: string) => {
    const s = live.current;
    if (!s.doc) return;
    s.doc = change(s.doc); s.version++; setDoc(s.doc);
    if (sectionId) editedAt.current.set(sectionId, Date.now());
    if (!s.conflict) setSaveState("saving");
    clearTimeout(s.timer); s.timer = setTimeout(() => { void save().catch(() => {}); }, SAVE_DELAY_MS);
  }, [save]);

  useEffect(() => {
    const controller = new AbortController();
    json(reportRequest(path, { signal: controller.signal })).then((view) => accept(view, true), (failure: Error) => { if (!controller.signal.aborted) setLoadError(failure.message); });
    return () => controller.abort();
  }, [path, accept]);

  // RPT-032: follow a running draft, also after leaving and coming back. A hidden tab skips its turn.
  const drafting = report?.status === "drafting";
  useEffect(() => {
    if (!drafting) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => { timer = setTimeout(async () => {
      if (document.visibilityState !== "hidden") await json(reportRequest(path, { signal: controller.signal })).then((view) => accept(view, true), () => {});
      if (!controller.signal.aborted) poll();
    }, POLL_MS); };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [drafting, path, accept]);

  // RPT-042: warn before a reload/close with unsaved edits; in-app navigation saves on the way out.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { const s = live.current; if (s.version !== s.saved) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); void save().catch(() => {}); };
  }, [save]);

  const run = async (request: () => Promise<ReportView>, replace?: boolean) => {
    setBusy(true); setError("");
    try { accept(await request(), replace); } catch (failure) {
      const known = failure as RequestError;
      if (known.code === "REPORT_CONFLICT") { live.current.conflict = true; setConflict(known.body?.report ?? null); setSaveState("conflict"); }
      setError(known.message);
    } finally { setBusy(false); }
  };
  const post = (body: Record<string, unknown>) => json(reportRequest(path, { method: "POST", body: JSON.stringify(body) }));
  /** Whole-document actions save pending edits first and carry the version they were based on. */
  const documentAction = (body: Record<string, unknown>) => run(async () => { await flush(); return post({ ...body, updatedAt: live.current.updatedAt }); }, true);

  const apply = (messageIndex: number) => {
    const message = report?.messages[messageIndex];
    if (!message?.proposal) return;
    const stale = staleTargets(message.proposal, editedAt.current, arrived.current.get(message.createdAt) ?? 0);
    if (stale.length && !confirm(`변경안이 나온 뒤 직접 고친 섹션 ${stale.length}개를 덮어씁니다. 적용할까요?`)) return;
    void documentAction({ action: "apply", messageIndex });
  };

  /** Streams one answer; resolves false when it was stopped or failed so the caller can restore the question. */
  const send = async (question: string, slide?: number) => {
    setError(""); setAnswerStatus(""); setPending({ question, answer: "" });
    const stop = chatStop.current = new AbortController();
    let streaming = false;
    try {
      await flush().catch(() => {}); // the AI reads the saved document
      const response = await reportRequest(path, { method: "POST", signal: stop.signal, body: JSON.stringify({ action: "chat", message: question, ...(slide ? { slide } : {}) }) });
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
      // The saved turns (and any proposal) come from the server; keep the streamed text on screen until they arrive.
      await json(reportRequest(path)).then((view) => accept(view), () => {});
      setPending(null);
    }
  };

  return {
    report, doc, saveState, conflict, error, loadError, busy, pending, answerStatus, edit, flush, apply, send,
    stopChat: () => chatStop.current?.abort(),
    undo: () => documentAction({ action: "undo" }),
    redraft: (metricsOnly = false) => {
      // RPT-034: replacing a document needs consent; undo can bring it back.
      if (live.current.doc && !confirm("초안을 다시 만들면 지금 문서를 대체하고 되돌릴 수 없습니다. 계속할까요?")) return;
      void documentAction({ action: "redraft", metricsOnly });
    },
    cancel: () => run(() => post({ action: "cancel" }), true),
    reset: () => { if (confirm("지금까지의 대화를 지울까요? 남은 질문 수는 그대로입니다.")) void run(() => post({ action: "reset" })); },
    keepMine: () => {
      const s = live.current;
      if (!conflict) return;
      s.updatedAt = conflict.updatedAt; s.conflict = false; s.version++;
      setConflict(null); void save().catch(() => {});
    },
    loadLatest: () => { if (!conflict) return; live.current.conflict = false; setConflict(null); accept(conflict, true); },
  };
}
