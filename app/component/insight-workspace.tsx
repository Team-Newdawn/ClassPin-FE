"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSessions } from "../_controller/session-store";
import { getSupabaseClient } from "../_infrastructure/supabase/client";
import { SlideCanvas } from "./slide-canvas";
import type { InsightReportView } from "../_model/insight-report";
import styles from "./insight-workspace.module.css";

const tabs = ["전체 요약", "슬라이드별", "주제별 분석", "AI 대화"];
/** AI answers may emphasize with **bold**; render only that, everything else stays plain text (an unclosed ** mid-stream shows as typed). */
const emphasized = (text: string) => text.split(/\*\*([\s\S]+?)\*\*/g).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part);
const messages: Record<string, string> = {
  ANALYSIS_NOT_CONFIGURED: "분석 서버에 Claude API 키가 설정되지 않았습니다.", REPORT_STORAGE_NOT_CONFIGURED: "분석 저장소 설정이 필요합니다.",
  LECTURE_NOT_ENDED: "강의를 종료한 뒤 분석할 수 있습니다.", SOURCE_NOT_FOUND: "자료가 삭제되었거나 접근 권한이 없습니다.",
  SOURCE_TOO_LARGE: "자료가 너무 커서 분석할 수 없습니다(600쪽, 200MB 이하).", ANALYSIS_INTERRUPTED: "분석이 중간에 멈췄습니다(서버 재시작 등). 다시 분석해 주세요.", ANALYSIS_CANCELLED: "분석을 중지했습니다.", SOURCE_DOWNLOAD_FAILED: "원본 자료를 읽지 못했습니다.",
  AI_REFUSED: "AI가 이 자료의 분석을 거부했습니다.", AI_TRUNCATED: "AI 응답이 잘렸습니다. 다시 분석해 주세요.", AI_INVALID_OUTPUT: "AI 응답 형식이 올바르지 않습니다. 다시 분석해 주세요.",
  AI_UNAVAILABLE: "AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", REPORT_NOT_READY: "분석이 끝난 뒤 사용할 수 있습니다.",
  DAILY_LIMIT: "오늘 분석 횟수(2회)를 모두 사용했습니다. 내일 다시 시도해 주세요.", CHAT_LIMIT: "이 리포트의 AI 대화 횟수(5회)를 모두 사용했습니다.",
  CONFIRMATION_REQUIRED: "리포트를 확정한 뒤 내보낼 수 있습니다.", ANALYSIS_FAILED: "분석을 완료하지 못했습니다. 다시 분석해 주세요.",
};
export async function insightFetch(path: string, init?: RequestInit) {
  const client = getSupabaseClient();
  const session = await client?.auth.getSession();
  if (!session?.data.session) throw new Error("로그인이 필요합니다.");
  const response = await fetch(path, { ...init, cache: "no-store", headers: {
    ...init?.headers, Authorization: `Bearer ${session.data.session.access_token}`, "Content-Type": "application/json",
  } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(messages[body.error] || "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  }
  return response;
}

export function InsightWorkspace() {
  const { sessions, ready } = useSessions(), params = useSearchParams();
  const [material, setMaterial] = useState(params.get("material") ?? "");
  // The ?report= link only picks the first report shown; a re-analysis replaces it.
  const [reportId, setReportId] = useState(params.get("report"));
  const [reports, setReports] = useState<InsightReportView[]>([]), [report, setReport] = useState<InsightReportView | null>(null);
  const [tab, setTab] = useState(0), [slideIndex, setSlideIndex] = useState(0), [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [relatedPins, setRelatedPins] = useState<string[] | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ question: string; answer: string } | null>(null), chatEnd = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null);
  const session = sessions.find((session) => session.materialId === material);
  const slides = session?.slides ?? [], slide = slides[slideIndex];
  const body = report?.body ?? null, analysis = body?.slides.find((item) => item.page === slideIndex + 1);
  const questionsOnSlide = session?.questions.filter((question) => question.slideIndex === slideIndex) ?? [];
  const visibleQuestions = relatedPins ? questionsOnSlide.filter((question) => relatedPins.includes(question.id)) : questionsOnSlide;
  const refresh = useCallback(async () => {
    const list = await (await insightFetch("/api/admin/ai-reports")).json();
    setReports(list.reports);
  }, []);
  // Loading an external report list updates state only after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (ready) void refresh().catch((error) => setError(error.message)); }, [ready, refresh]);
  useEffect(() => {
    // Discard the prior material while subscribing to its replacement report.
    const found = reports.find((item) => item.id === reportId && item.materialIds.includes(material)) ??
      reports.find((item) => item.materialIds.includes(material));
    // Keep the report a re-analysis just returned so the screen goes straight to "running" without the empty state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport((current) => current?.id === found?.id ? current : null); setSlideIndex(0); setSelectedPin(null); setRelatedPins(null); setError("");
    if (!found) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      // A hidden tab keeps its turn but skips the request; it catches up within 3 s of becoming visible.
      if (document.visibilityState === "hidden") { timer = setTimeout(poll, 3000); return; }
      try {
        const value = await (await insightFetch(`/api/admin/ai-reports/${found.id}`, { signal: controller.signal })).json();
        if (stopped) return;
        setReport(value);
        if (value.status === "running") timer = setTimeout(poll, 3000);
      } catch (error) { if (!stopped) setError((error as Error).message); }
    };
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [material, reports, reportId]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("input,textarea,select,[contenteditable=true],[role=tab]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); setSelectedPin(null); setRelatedPins(null);
        setSlideIndex((index) => Math.max(0, Math.min(slides.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1))));
      }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [slides.length]);
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); try { await action(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const start = () => act(async () => {
    const value = await (await insightFetch("/api/admin/ai-reports", { method: "POST", body: JSON.stringify({ materialId: material }) })).json();
    setReport(value); setReportId(value.id); setReports((reports) => [value, ...reports.filter((item) => item.id !== value.id)]);
  });
  const post = async (payload: unknown) => {
    if (!report) return;
    setReport(await (await insightFetch(`/api/admin/ai-reports/${report.id}`, { method: "POST", body: JSON.stringify(payload) })).json());
  };
  const send = (question: string) => act(async () => {
    setDraft(""); setPending({ question, answer: "" });
    try {
      const response = await insightFetch(`/api/admin/ai-reports/${report!.id}`, { method: "POST", body: JSON.stringify({ action: "chat", message: question, slide: slideIndex + 1 }) });
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let answer = "";
      try { for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) { answer += chunk.value; setPending({ question, answer }); } }
      catch { throw new Error("답변이 중간에 끊겼습니다. 다시 코멘트를 남겨 주세요."); }
      const now = new Date().toISOString();
      setReport((current) => current && { ...current, messages: [...(current.messages ?? []),
        { role: "user", text: question, createdAt: now }, { role: "assistant", text: answer.trim(), createdAt: now }] });
    } catch (error) { setDraft(question); throw error; } finally { setPending(null); }
  });
  const chat = [...(report?.messages ?? []), ...(pending ? [{ role: "user", text: pending.question }, { role: "assistant", text: pending.answer }] : [])];
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [pending, report?.messages, tab]);
  // Grow the prompt with its lines (CSS caps it at 160px, then it scrolls); also shrinks back when a send clears it.
  useEffect(() => { const box = composer.current; if (box) { box.style.height = "auto"; box.style.height = `${box.scrollHeight}px`; } }, [draft, tab]);
  const goTo = (page: number, pin: string | null = null) => { setSlideIndex(Math.max(0, Math.min(slides.length - 1, page - 1))); setSelectedPin(pin); setRelatedPins(null); };
  const questionButton = (id: string) => {
    const question = body?.questions.find((item) => item.id === id);
    return question ? <button className={styles.questionCard} key={id} onClick={() => goTo(question.page, id)}><small>슬라이드 {question.page} · 공감 {question.reactions} · 답변 {question.answers.length}</small>{question.text}</button> : null;
  };
  return <main className={styles.root}>
    <header className={styles.header}>
      <Link className={styles.back} href={session?.folderId ? `/admin/folders/${session.folderId}` : "/admin/dashboard"} aria-label="폴더로 돌아가기"><Image src="/assets/design/report-back.svg" width={16} height={16} alt="" /></Link>
      <div className={styles.title}><small>인사이트 리포트</small><h1>{session?.title ?? "자료를 선택해 주세요"}</h1></div>
      <select aria-label="분석할 자료" value={material} onChange={(event) => setMaterial(event.target.value)}>
        <option value="">자료 선택</option>{sessions.map((session) => <option key={session.id} value={session.materialId ?? ""} disabled={!session.materialId}>{session.title}</option>)}
      </select>
      <div className={styles.headerActions}>
        {report?.status === "ready" && <button className="btn primary" disabled={busy} onClick={() => void act(() => post({ action: "confirm" }))}>리포트 확정</button>}
        {body && <button className="btn secondary" disabled={busy} onClick={() => void start()}>다시 분석</button>}
        <select aria-label="리포트 내보내기" value="" disabled={report?.status !== "confirmed" || busy} onChange={(event) => {
          const format = event.target.value;
          if (!format || !report) return;
          void act(async () => {
            const response = await insightFetch(`/api/admin/ai-reports/${report.id}/export?format=${format}`);
            const url = URL.createObjectURL(await response.blob()), link = document.createElement("a");
            link.href = url; link.download = `insight.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          });
        }}><option value="">내보내기</option>{["pdf", "pptx", "docx", "md"].map((format) => <option key={format}>{format}</option>)}</select>
      </div>
    </header>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    <div className={styles.columns}>
      <section className={styles.source} aria-label="슬라이드와 코멘트">
        <div className={styles.stage}><div className={styles.canvas}>
          {slide ? <SlideCanvas slide={slide} questions={questionsOnSlide} visibleQuestionIds={relatedPins ?? undefined} expandedIds={relatedPins ?? undefined} selectedId={selectedPin} onSelectPin={(id) => setSelectedPin(id)} compact /> : <p>분석할 자료를 선택해 주세요.</p>}
        </div>
        <nav className={styles.slideNav} aria-label="슬라이드 탐색">
          <button aria-label="이전 슬라이드" disabled={slideIndex === 0} onClick={() => goTo(slideIndex)}>‹</button>
          <span>{slides.length ? slideIndex + 1 : 0} / {slides.length}</span>
          <button aria-label="다음 슬라이드" disabled={slideIndex >= slides.length - 1} onClick={() => goTo(slideIndex + 2)}>›</button>
        </nav></div>
        <p className={styles.questionHeading}>이 슬라이드 코멘트 <b>{questionsOnSlide.length}</b> / {session?.questions.length ?? 0}</p>
        {relatedPins && <div className={styles.pinFilter}><span>주요 쟁점 · 관련 PIN {visibleQuestions.length}개</span><button className={styles.evidenceButton} onClick={() => { setRelatedPins(null); setSelectedPin(null); }}>전체 PIN 보기</button></div>}
        <div className={styles.questions} role="region" aria-label="이 슬라이드 PIN 목록" tabIndex={0}>{visibleQuestions.map((question) => <button key={question.id} className={styles.questionCard} aria-pressed={selectedPin === question.id} onClick={() => setSelectedPin(question.id)}>
          <small>공감 {question.reactionCount ?? 0}{question.answer ? " · 답변 있음" : ""}</small>{question.text}
          {selectedPin === question.id && question.answer && <p>{question.answer}</p>}
        </button>)}</div>
      </section>
      <section className={styles.report} aria-label="인사이트 분석">
        <div role="tablist" aria-label="인사이트 보기" className={styles.tabs}>{tabs.map((label, index) => <button key={label} id={`insight-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls="insight-panel" tabIndex={tab === index ? 0 : -1}
          onClick={() => setTab(index)} onKeyDown={(event) => { if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 3 : (tab + (event.key === "ArrowRight" ? 1 : 3)) % 4; setTab(next); document.getElementById(`insight-tab-${next}`)?.focus(); } }}>{label}</button>)}</div>
        <div id="insight-panel" role="tabpanel" aria-labelledby={`insight-tab-${tab}`} className={styles.content}>
          {!report && !reports.some((item) => item.materialIds.includes(material)) && <div className={styles.state}>
            <p>강의 자료 PDF와 코멘트·답변을 Claude로 분석해 전체 요약, 슬라이드별 정리, 코멘트 묶음을 만듭니다. 보통 1분 안에 끝납니다.</p>
            <button className="btn primary" disabled={!material || session?.status !== "ended" || busy} onClick={() => void start()}>{busy ? "요청 중…" : "분석 시작"}</button>
            {session && session.status !== "ended" && <p>강의를 종료한 뒤 분석할 수 있습니다.</p>}
          </div>}
          {report?.status === "running" && <div role="status" className={styles.state}><p>자료를 읽고 분석하는 중입니다…</p><progress /><p>창을 닫아도 분석은 계속됩니다.</p>
            <button className="btn secondary" disabled={busy} onClick={() => void act(() => post({ action: "cancel" }))}>{busy ? "중지하는 중…" : "분석 중지"}</button></div>}
          {report?.status === "failed" && <div role="alert" className={styles.state}><p>{messages[report.error ?? ""] ?? messages.ANALYSIS_FAILED}</p>
            <button className="btn secondary" disabled={busy} onClick={() => void start()}>다시 분석</button></div>}
          {body && <><div className={styles.meta}><span className={styles.badge} data-tone={report!.status === "confirmed" ? "done" : undefined}>{report!.status === "confirmed" ? "확정됨" : "확정 전"}</span>
              {body.category && <span className={styles.badge} data-tone="brand">AI 판단 · {body.category}</span>}
              {body.failedPages?.length ? <span className={styles.badge} data-tone="warn">슬라이드 {body.failedPages.length}장 분석 실패</span> : null}
              <small>{new Date(report!.createdAt).toLocaleString("ko-KR")} · 슬라이드 {body.slides.length} · 코멘트 {body.questions.length}</small></div>
            {tab === 0 && <><section className={styles.aiCard}><h2><Image src="/assets/design/report-sparkle.svg" width={16} height={16} alt="" />AI 요약</h2><p>{body.overall.summary}</p></section>
              {body.overall.hotspots.length > 0 && <section className={styles.card}><h2>주목할 슬라이드</h2><ol>{body.overall.hotspots.map((item) => <li key={item.page}><button onClick={() => goTo(item.page)}>슬라이드 {item.page}</button>{item.reason}</li>)}</ol></section>}
              {body.overall.suggestions.length > 0 && <section className={styles.card}><h2>개선 제안</h2><ol>{body.overall.suggestions.map((item, index) => <li key={index}><span aria-hidden="true">{index + 1}</span>{item}</li>)}</ol></section>}</>}
            {tab === 1 && <section className={styles.card}><h2>슬라이드 {slideIndex + 1}</h2>
              {analysis ? <><p>{body.failedPages?.includes(analysis.page) ? "이 슬라이드는 AI 분석에 실패했습니다. 다시 분석하면 채워질 수 있습니다." : analysis.topic || "이 슬라이드의 분석 결과가 없습니다. 다시 분석해 주세요."}</p>
                <small>코멘트 {analysis.metrics.questions} · 공감 {analysis.metrics.reactions}</small>
                {analysis.content && <><h3>내용 정리</h3><p>{analysis.content}</p></>}
                {analysis.questionSummary && <><h3>AI 분석</h3><p>{analysis.questionSummary}</p></>}
                {analysis.issues?.length ? <><h3>주요 쟁점</h3>{analysis.issues.map((issue, index) => {
                  const ids = issue.questionIds.filter((id) => questionsOnSlide.some((question) => question.id === id));
                  return <div className={styles.issue} key={index}><h4>{issue.title}</h4><p>{issue.summary}</p>
                    <button className={styles.evidenceButton} aria-label={`${issue.title} 관련 PIN 보기 (${ids.length}개)`} disabled={!ids.length} title={!ids.length ? "현재 자료에서 관련 PIN을 찾을 수 없습니다." : undefined}
                      aria-pressed={relatedPins !== null && ids.length > 0 && ids.length === relatedPins.length && ids.every((id) => relatedPins.includes(id))}
                      onClick={() => { goTo(analysis.page, ids[0]); setRelatedPins(ids); }}>관련 PIN 보기 ({ids.length}개)</button></div>;
                })}</> : null}
                {analysis.metrics.questions > 0 && !analysis.issues && !body.failedPages?.includes(analysis.page) && <p className={styles.hint}>주요 쟁점과 관련 PIN은 다시 분석하면 표시됩니다.</p>}
                {analysis.suggestion && <><h3>개선 제안</h3><p>{analysis.suggestion}</p></>}</> : <p>이 슬라이드의 분석이 없습니다.</p>}</section>}
            {tab === 2 && body.groups.map((group, index) => {
              const questions = body.questions.filter((question) => group.questionIds.includes(question.id));
              const pages = [...new Set(questions.map((question) => question.page))].sort((a, b) => a - b);
              return <details className={`${styles.card} ${styles.topicGroup}`} key={`${report!.id}-${index}`}>
                <summary><div><h2>{group.title}</h2><small>코멘트 {questions.length}개 · 슬라이드 {pages.length}장 · {pages.join("·")}번</small></div>
                  <span className={styles.topicToggle} aria-hidden="true"><span>펼치기</span><span>접기</span></span>
                </summary>
                <div className={styles.topicBody}>{group.summary && <><h3>AI 요약</h3><p>{group.summary}</p></>}<h3>코멘트 목록</h3>{group.questionIds.map(questionButton)}</div>
              </details>;
            })}
            {tab === 3 && <><div className={styles.chatHead}><p className={styles.hint}>분석 결과와 코멘트 목록을 근거로 답합니다. 근거가 없으면 없다고 답합니다.</p>
                {(report?.messages?.length ?? 0) > 0 && <button className="btn tertiary" disabled={busy}
                  onClick={() => { if (confirm("지금까지의 대화를 지우고 새 대화를 시작할까요?")) void act(() => post({ action: "reset" })); }}>새 대화</button>}</div>
              <div role="log" aria-label="AI 대화 기록" aria-busy={Boolean(pending)} className={styles.chat}>
                {chat.map((entry, index) => <article key={index} aria-label={entry.role === "user" ? "강사" : "AI"}
                  className={`${entry.role === "user" ? styles.userBubble : styles.aiBubble} ${pending && index === chat.length - 1 ? styles.streaming : ""}`}>{entry.role === "user" ? entry.text : entry.text ? emphasized(entry.text) : "답변을 준비하는 중…"}</article>)}
                <div ref={chatEnd} />
              </div>
              <form onSubmit={(event) => { event.preventDefault(); if (draft.trim() && !busy) void send(draft.trim()); }}>
                <div className={styles.composer}>
                  <textarea ref={composer} aria-label="AI에게 코멘트 (Enter로 전송, Shift+Enter로 줄바꿈)" value={draft} maxLength={2000} rows={1} placeholder="무엇이든 물어보세요"
                    onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
                  <button className={styles.send} aria-label={busy ? "답변 중" : "전송"} disabled={busy || !draft.trim()}><span aria-hidden="true">↑</span></button>
                </div>
              </form></>}
          </>}
          {tab !== 3 && <footer>AI 분석은 가림 처리한 코멘트·답변과 강의 자료 PDF를 사용합니다. 수치는 코드가 계산합니다.</footer>}
        </div>
      </section>
    </div>
  </main>;
}
