"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PinLogo } from "@/components/pin-logo";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";

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

function LoginContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/admin/dashboard";
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
      await signIn(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("login.startError"));
      setRedirecting(false);
    }
  };

  return (
    <main className="landing-shell">
      <header className="landing-nav"><PinLogo /><LanguageSwitcher /></header>
      <section className="login-card">
        <h1>{t("login.title")}</h1>
        <p>{t("login.description1")}<br />{t("login.description2")}</p>
        {configured ? (
          <button className="btn google-btn large full" onClick={() => void startGoogle()} disabled={loading || redirecting}>
            {redirecting ? <span className="spinner dark" /> : <GoogleIcon />}
            {t("login.continueGoogle")}
          </button>
        ) : (
          <>
            <p className="login-note">{t("login.demoNote")}</p>
            <Link className="btn primary large full" href="/admin/dashboard">{t("login.continueDemo")}</Link>
          </>
        )}
        {error && <div className="login-error" role="alert">{error}</div>}
        <p className="login-note">{t("login.studentNote")}</p>
      </section>
      <footer className="landing-footer">Pin Class · {t("brand.tagline")}</footer>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loading-screen"><span className="spinner dark" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
