"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";
import { PinLogo } from "@/app/component/pin-logo";
import { useLanguage } from "@/app/_controller/language-context";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { LoadingScreen } from "@/app/component/loading-screen";
import { useLoginController } from "./controller";
import styles from "./page.module.css";

const authFont = Noto_Sans_KR({ subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });

function GoogleIcon() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/design/auth/google.svg" alt="" width={20} height={20} />;
}

function LoginContent() {
  const { t } = useLanguage();
  const [signup, setSignup] = useState(false);
  const { configured, loading, redirecting, error, startGoogle } = useLoginController(t("login.startError"));

  return (
    <main className={styles.root}>
      <header className={styles.nav}><PinLogo /><LanguageSwitcher /></header>
      <section className={`${styles.card} ${authFont.className}`} aria-labelledby="auth-title">
        <div className={styles.heading}>
          <h1 id="auth-title">{t(signup ? "login.signupTitle" : "login.title")}</h1>
          <p>{t(signup ? "login.signupDescription" : "login.description1")}</p>
        </div>
        <div className={styles.action}>
          {configured ? (
            <button type="button" className={styles.googleButton} onClick={() => void startGoogle()} disabled={loading || redirecting} aria-busy={redirecting}>
              {redirecting ? <span className="spinner dark" aria-hidden="true" /> : <GoogleIcon />}
              {t(signup ? "login.signupGoogle" : "login.continueGoogle")}
            </button>
          ) : (
            <>
              <p className={styles.demoNote}>{t("login.demoNote")}</p>
              <Link className="btn primary large full" href="/admin/dashboard">{t("login.continueDemo")}</Link>
            </>
          )}
          <p className={styles.help}>
            {t("login.googleHelp")} <span className={styles.contact}>{t("login.contact")}</span>
          </p>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {signup && (
          <div className={styles.onboarding}>
            <h2>{t("login.stepsTitle")}</h2>
            <ol>
              <li>{t("login.stepUpload")}</li>
              <li>{t("login.stepQr")}</li>
              <li>{t("login.stepTeach")}</li>
            </ol>
          </div>
        )}
        <div className={styles.divider}>{t("login.studentTitle")}</div>
        <div className={styles.studentNote}>
          <span className={styles.qrIcon}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/design/auth/qr.svg" alt="" width={22} height={22} />
          </span>
          <p>{t("login.studentNote")}</p>
        </div>
        {signup && (
          <p className={styles.terms}>
            {t("login.termsPrefix")} <span>{t("login.terms")}</span> {t("login.termsAnd")} <span>{t("login.privacy")}</span>{t("login.termsSuffix")}
          </p>
        )}
        <div className={styles.switchAuth}>
          <span>{t(signup ? "login.existingAccount" : "login.noAccount")}</span>
          <button type="button" onClick={() => setSignup(!signup)}>{t(signup ? "login.backToLogin" : "login.signupGuide")}</button>
        </div>
      </section>
      <footer className={styles.footer}>OhPin · {t("brand.tagline")}</footer>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}
