"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Plus, Upload } from "@/components/icons";
import { PinLogo } from "@/components/pin-logo";
import { useSessions } from "@/components/session-store";
import type { Slide } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { sessions, createSession, ready } = useSessions();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  return (
    <main className="landing-shell">
      <header className="landing-nav"><PinLogo /><span className="demo-pill">MVP Preview</span></header>
      <section className="hero">
        <span className="eyebrow">LECTURE QUESTION INTELLIGENCE</span>
        <h1>질문이 찍힌 곳에서,<br /><em>더 나은 강의</em>가 시작됩니다.</h1>
        <p>강의 자료를 올리면 수강생이 바로 참여할 수 있어요.<br />슬라이드의 정확한 위치에 질문을 모으고, 실시간으로 답변하세요.</p>
        <div className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}>
          <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <div className="upload-icon"><Upload /></div>
          <h2>{busy ? "슬라이드를 준비하고 있어요" : "강의 자료를 여기에 놓으세요"}</h2>
          <p>PDF, PPT, PPTX · 최대 40MB</p>
          {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
          <button className="btn primary large" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? <span className="spinner" /> : <Plus />} {busy ? "변환 중…" : "파일 선택"}</button>
        </div>
        {ready && sessions.length > 0 && (
          <div className="recent-section">
            <div className="section-heading"><div><span>최근 세션</span><p>바로 이어서 관리할 수 있어요</p></div></div>
            <div className="recent-grid">
              {sessions.slice(0, 3).map((session) => <button className="recent-card" key={session.id} onClick={() => router.push(`/admin/session/${session.id}`)}>
                <span className="file-tile"><FileText /></span>
                <span><b>{session.title}</b><small>{session.slides.length}개 슬라이드 · 질문 {session.questions.length}개</small></span>
                <ArrowRight />
              </button>)}
            </div>
          </div>
        )}
      </section>
      <footer className="landing-footer">Pin Class · 질문을 강의의 지식으로</footer>
    </main>
  );
}
