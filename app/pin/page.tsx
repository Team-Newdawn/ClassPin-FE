"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogIn, Plus } from "@/components/icons";
import { useAuth } from "@/components/auth-context";
import { PinLogo } from "@/components/pin-logo";

export default function PinHome() {
  const router = useRouter();
  const { configured, loading, isAdmin, profile, signOut } = useAuth();
  const [code, setCode] = useState("");
  const needsLogin = configured && !isAdmin;

  // QR 을 못 찍는 자리도 있다. 인쇄물의 참여 코드만 들고 온 사람에게 들어올 문이 필요하다.
  const enter = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed) router.push(`/pin/join/${trimmed}`);
  };

  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <PinLogo href="/pin" product="" label="Pin 홈" />
        {configured ? (
          isAdmin ? (
            <div className="nav-account">
              <span>{profile?.displayName ?? profile?.email}</span>
              <button className="btn secondary" onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}>로그아웃</button>
            </div>
          ) : (
            <Link className="btn secondary" href="/pin/login"><LogIn />로그인</Link>
          )
        ) : (
          <span className="demo-pill">MVP Preview</span>
        )}
      </header>

      <section className="hero">
        <span className="eyebrow">VISUAL FEEDBACK</span>
        <h1>피드백이 <em>어디에</em> 쌓였는지<br />한 장의 이미지로 봅니다.</h1>
        <p>행사 배치도, 포스터, 앱 화면 무엇이든 올리면<br />참여자가 그 위 정확한 자리에 좋았던 점과 아쉬웠던 점을 남깁니다.</p>

        <div className="pin-entry-grid">
          <div className="upload-card pin-entry-card">
            <span className="eyebrow">운영자</span>
            <h2>캠페인을 만들어 보세요</h2>
            <p>기준 이미지 한 장이면 시작할 수 있어요</p>
            {configured && loading
              ? <span className="spinner dark" />
              : needsLogin
                ? <button className="btn primary large" onClick={() => router.push("/pin/login")}><LogIn />Google로 시작하기</button>
                : <button className="btn primary large" onClick={() => router.push("/pin/admin")}><Plus />캠페인 만들기</button>}
          </div>

          <div className="upload-card pin-entry-card">
            <span className="eyebrow">참여자</span>
            <h2>참여 코드가 있으신가요?</h2>
            <p>로그인 없이 바로 피드백을 남길 수 있어요</p>
            <form className="pin-code-form" onSubmit={(event) => { event.preventDefault(); enter(); }}>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="예: ABC123"
                maxLength={10}
                aria-label="참여 코드"
                autoComplete="off"
              />
              <button className="btn secondary" type="submit" disabled={!code.trim()}>입장<ArrowRight /></button>
            </form>
          </div>
        </div>
      </section>

      <footer className="landing-footer">Pin · 문제가 어디 있는지까지</footer>
    </main>
  );
}
