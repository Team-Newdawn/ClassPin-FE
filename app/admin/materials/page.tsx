"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell, AdminTopbar } from "@/components/admin-shell";
import { FileText, MessageCircleQuestion, Plus, Search, Upload } from "@/components/icons";
import { SlideCanvas } from "@/components/slide-canvas";
import { useSessions } from "@/components/session-store";
import { countBy } from "@/lib/stats";
import type { ClassSession, Slide } from "@/lib/types";

type Filter = "all" | ClassSession["status"];

const filterLabel: Record<Filter, string> = { all: "전체", draft: "초안", live: "진행 중", ended: "종료" };

export default function MaterialsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { sessions, createSession, ready } = useSessions();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const visible = useMemo(
    () => sessions.filter((session) => (filter === "all" || session.status === filter) && `${session.title} ${session.fileName}`.toLowerCase().includes(query.toLowerCase())),
    [filter, query, sessions]
  );

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/convert", { method: "POST", body: form });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: "슬라이드 변환에 실패했습니다." })) as { error?: string };
        throw new Error(failure.error || "슬라이드 변환에 실패했습니다.");
      }
      const data = await response.json() as { slides: Slide[] };
      const session = createSession({ title: file.name.replace(/\.(pdf|pptx?)$/i, ""), fileName: file.name, slides: data.slides });
      router.push(`/admin/session/${session.id}`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "슬라이드 변환에 실패했습니다.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  return (
    <AdminShell>
      <AdminTopbar title="강의 자료" caption={`${sessions.length}개 자료`} actions={<button className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? <span className="spinner" /> : <Plus />}{busy ? "변환 중…" : "자료 업로드"}</button>} />
      <div className="admin-page">
        <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(event) => upload(event.target.files?.[0])} />
        <div className="page-head">
          <div><h1>강의 자료</h1><p>업로드한 슬라이드와 회차별 질문 현황을 관리합니다.</p></div>
        </div>

        {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="자료 제목 · 파일명 검색" /></div>
          <div className="filter-tabs">{(Object.keys(filterLabel) as Filter[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{filterLabel[key]}</button>)}</div>
          <button className="btn secondary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload />파일 선택</button>
        </div>

        {visible.length ? (
          <div className="material-grid">
            {visible.map((session) => {
              const open = countBy(session.questions, "unanswered");
              return (
                <button className="material-card" key={session.id} onClick={() => router.push(`/admin/session/${session.id}`)}>
                  <span className="material-thumb"><SlideCanvas slide={session.slides[0]} compact /><em className={`live-badge ${session.status}`}><i />{session.status === "live" ? "진행 중" : session.status === "ended" ? "종료" : "초안"}</em></span>
                  <span className="material-body">
                    <b>{session.title}</b>
                    <small><FileText />{session.fileName}</small>
                    <span className="material-stats"><span><b>{session.slides.length}</b>슬라이드</span><span><b>{session.questions.length}</b>질문</span><span className={open ? "alert" : ""}><b>{open}</b>미답변</span></span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="panel">
            <div className="panel-empty">
              <MessageCircleQuestion />
              <b>{sessions.length ? "조건에 맞는 자료가 없어요" : "아직 업로드한 자료가 없어요"}</b>
              <span>{sessions.length ? "검색어나 필터를 바꿔보세요." : "PDF·PPT를 올리면 슬라이드로 변환해 바로 질문을 받을 수 있어요."}</span>
              {!sessions.length && <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload />자료 업로드</button>}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
