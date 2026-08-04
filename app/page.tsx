"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, LogIn, Plus, Upload } from "@/components/icons";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { PinLogo } from "@/components/pin-logo";
import { useSessions } from "@/components/session-store";
import { SlidePreview } from "@/components/slide-preview";
import { UploadProgress } from "@/components/upload-progress";
import { useSlideUpload } from "@/components/use-slide-upload";

export default function Home() {
  const router = useRouter();
  const { t } = useLanguage();
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
        <div className="landing-nav-actions">
          <LanguageSwitcher />
          {configured ? (
            isAdmin ? (
              <div className="nav-account">
                <span>{profile?.displayName ?? profile?.email}</span>
                <button className="btn secondary" onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}>{t("common.logout")}</button>
              </div>
            ) : (
              <Link className="btn secondary" href="/login"><LogIn />{t("common.login")}</Link>
            )
          ) : (
            <span className="demo-pill">MVP Preview</span>
          )}
        </div>
      </header>
      <section className="hero">
        <span className="eyebrow">LECTURE QUESTION INTELLIGENCE</span>
        <h1>{t("home.heroBefore")}<br /><em>{t("home.heroEmphasis")}</em>{t("home.heroAfter")}</h1>
        <p>{t("home.heroDescription1")}<br />{t("home.heroDescription2")}</p>
        <div className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}>
          <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="upload-icon"><Upload /></div>
          {configured && authLoading ? (
            <>
              <h2>{t("home.checkingWorkspace")}</h2>
              <p>{t("home.pleaseWait")}</p>
              <span className="spinner dark" />
            </>
          ) : needsLogin ? (
            <>
              <h2>{t("home.loginToUpload")}</h2>
              <p>{t("home.loginHint")}</p>
              <button className="btn primary large" onClick={() => router.push("/login")} disabled={authLoading}><LogIn />{t("home.startGoogle")}</button>
            </>
          ) : (
            <>
              <h2>{busy ? t("home.preparingSlides") : t("home.dropMaterial")}</h2>
              <p>{t("home.fileRequirement")}</p>
              {uploadError && <div className="upload-error" role="alert">{uploadError}</div>}
              {busy
                ? <UploadProgress phase={phase} uploadPct={uploadPct} done={slides.length} total={total} />
                : <button className="btn primary large" onClick={() => inputRef.current?.click()}><Plus />{t("home.chooseFile")}</button>}
              {showPreview && <SlidePreview slides={slides} total={total} />}
            </>
          )}
        </div>
        {ready && !needsLogin && sessions.length > 0 && (
          <div className="recent-section">
            <div className="section-heading"><div><span>{t("home.recentSessions")}</span><p>{t("home.recentHint")}</p></div></div>
            <div className="recent-grid">
              {sessions.slice(0, 3).map((session) => <button className="recent-card" key={session.id} onClick={() => router.push(`/admin/session/${session.id}`)}>
                <span className="file-tile"><FileText /></span>
                <span><b>{session.title}</b><small>{t("home.sessionSummary", { slides: session.slides.length, questions: session.questions.length })}</small></span>
                <ArrowRight />
              </button>)}
            </div>
          </div>
        )}
      </section>
      <footer className="landing-footer">Pin Class · {t("brand.tagline")}</footer>
    </main>
  );
}
