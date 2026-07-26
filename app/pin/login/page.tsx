"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PinLogo } from "@/components/pin-logo";
import { useAuth } from "@/components/auth-context";

// 강의 앱 로그인과 같은 마크지만, 두 앱을 따로 굴리기로 했으므로 파일을 공유하지 않는다.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function PinLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/pin/admin";
  const { configured, loading, isAdmin, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (configured && !loading && isAdmin) router.replace(next);
  }, [configured, loading, isAdmin, next, router]);

  const startGoogle = async () => {
    setError(null);
    setRedirecting(true);
    try {
      // OAuth 콜백(/auth/callback)은 두 앱이 함께 쓴다. 구글 콘솔에 등록된 리디렉션 주소라
      // 앱마다 늘리면 콘솔 설정까지 따라와야 한다. 돌아올 자리는 next 가 정한다.
      await signIn(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인을 시작하지 못했습니다.");
      setRedirecting(false);
    }
  };

  return (
    <main className="landing-shell">
      <header className="landing-nav"><PinLogo href="/pin" product="" label="Pin 홈" /></header>
      <section className="login-card">
        <h1>운영자로 시작하기</h1>
        <p>구글 계정으로 로그인하면 기준 이미지를 올리고<br />바로 피드백을 받을 수 있어요.</p>
        {configured ? (
          <button className="btn google-btn large full" onClick={() => void startGoogle()} disabled={loading || redirecting}>
            {redirecting ? <span className="spinner dark" /> : <GoogleIcon />}
            Google로 계속하기
          </button>
        ) : (
          <>
            <p className="login-note">피드백 캠페인은 이미지 저장소를 쓰기 때문에 Supabase 설정이 있어야 동작해요.</p>
            <Link className="btn primary large full" href="/pin">돌아가기</Link>
          </>
        )}
        {error && <div className="login-error" role="alert">{error}</div>}
        <p className="login-note">참여자는 로그인 없이 QR·링크·참여 코드로 들어옵니다.</p>
      </section>
      <footer className="landing-footer">Pin · 문제가 어디 있는지까지</footer>
    </main>
  );
}

export default function PinLoginPage() {
  return (
    <Suspense fallback={<div className="loading-screen"><span className="spinner dark" /></div>}>
      <PinLoginContent />
    </Suspense>
  );
}
