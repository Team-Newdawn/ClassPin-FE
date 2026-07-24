"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, LogIn, Plus, Upload } from "@/components/icons";
import { useAuth } from "@/components/auth-context";
import { PinLogo } from "@/components/pin-logo";
import { useSessions } from "@/components/session-store";
import { SlidePreview } from "@/components/slide-preview";
import { UploadProgress } from "@/components/upload-progress";
import { useSlideUpload } from "@/components/use-slide-upload";

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { sessions, ready } = useSessions();
  const { configured, loading: authLoading, isAdmin, profile, signOut } = useAuth();
  const [dragging, setDragging] = useState(false);
  const { phase, uploadPct, error: uploadError, slides, total, showPreview, busy, start } = useSlideUpload();
  // 업로드(=코스 개설)는 강사 전용. demo 모드에서는 그대로 열어 둔다.
  const needsLogin = configured && !isAdmin;
  // 파일을 잡는 즉시 input 을 비워, 같은 파일을 다시 골라도 onChange 가 뜨게 한다.
  const pick = (file?: File) => {
    if (needsLogin) { router.push("/login"); return; }
    if (inputRef.current) inputRef.current.value = "";
    void start(file);
  };

  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <PinLogo />
        {configured ? (
          isAdmin ? (
            <div className="nav-account">
              <span>{profile?.displayName ?? profile?.email}</span>
              <button className="btn secondary" onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}>로그아웃</button>
            </div>
          ) : (
            <Link className="btn secondary" href="/login"><LogIn />로그인</Link>
          )
        ) : (
          <span className="demo-pill">MVP Preview</span>
        )}
      </header>
      <section className="hero">
        <span className="eyebrow">LECTURE QUESTION INTELLIGENCE</span>
        <h1>질문이 찍힌 곳에서,<br /><em>더 나은 강의</em>가 시작됩니다.</h1>
        <p>강의 자료를 올리면 수강생이 바로 참여할 수 있어요.<br />슬라이드의 정확한 위치에 질문을 모으고, 실시간으로 답변하세요.</p>
        <div className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}>
          <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="upload-icon"><Upload /></div>
          {configured && authLoading ? (
            <>
              <h2>워크스페이스를 확인하고 있어요</h2>
              <p>잠시만 기다려 주세요</p>
              <span className="spinner dark" />
            </>
          ) : needsLogin ? (
            <>
              <h2>로그인하고 강의 자료를 올려보세요</h2>
              <p>강사는 Google 로그인으로 시작해요 · 수강생은 QR로 바로 참여</p>
              <button className="btn primary large" onClick={() => router.push("/login")} disabled={authLoading}><LogIn /> Google로 시작하기</button>
            </>
          ) : (
            <>
              <h2>{busy ? "슬라이드를 준비하고 있어요" : "강의 자료를 여기에 놓으세요"}</h2>
              <p>PDF, PPT, PPTX · 최대 40MB</p>
              {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
              {busy
                ? <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />
                : <button className="btn primary large" onClick={() => inputRef.current?.click()}><Plus /> 파일 선택</button>}
              {showPreview && <SlidePreview slides={slides} total={total} />}
            </>
          )}
        </div>
        {ready && !needsLogin && sessions.length > 0 && (
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
