"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogIn, Plus } from "@/components/icons";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { PinLogo } from "@/components/pin-logo";

export default function PinHome() {
  const router = useRouter();
  const { t } = useLanguage();
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
        <PinLogo href="/pin" product="" label={t("pin.logo.home")} />
        <div className="landing-nav-actions">
          <LanguageSwitcher />
          {configured ? (
            isAdmin ? (
              <div className="nav-account">
                <span>{profile?.displayName ?? profile?.email}</span>
                <button className="btn secondary" onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}>{t("common.logout")}</button>
              </div>
            ) : (
              <Link className="btn secondary" href="/pin/login"><LogIn />{t("common.login")}</Link>
            )
          ) : (
            <span className="demo-pill">MVP Preview</span>
          )}
        </div>
      </header>

      <section className="hero">
        <span className="eyebrow">VISUAL FEEDBACK</span>
        <h1>{t("pin.home.heroBefore")}<em>{t("pin.home.heroEmphasis")}</em>{t("pin.home.heroAfter")}<br />{t("pin.home.heroLine2")}</h1>
        <p>{t("pin.home.description1")}<br />{t("pin.home.description2")}</p>

        <div className="pin-entry-grid">
          <div className="upload-card pin-entry-card">
            <span className="eyebrow">{t("pin.home.operator")}</span>
            <h2>{t("pin.home.createTitle")}</h2>
            <p>{t("pin.home.createHint")}</p>
            {configured && loading
              ? <span className="spinner dark" />
              : needsLogin
                ? <button className="btn primary large" onClick={() => router.push("/pin/login")}><LogIn />{t("pin.home.startGoogle")}</button>
                : <button className="btn primary large" onClick={() => router.push("/pin/admin")}><Plus />{t("pin.home.createCampaign")}</button>}
          </div>

          <div className="upload-card pin-entry-card">
            <span className="eyebrow">{t("pin.home.participant")}</span>
            <h2>{t("pin.home.codeQuestion")}</h2>
            <p>{t("pin.home.codeHint")}</p>
            <form className="pin-code-form" onSubmit={(event) => { event.preventDefault(); enter(); }}>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder={t("pin.home.codePlaceholder")}
                maxLength={10}
                aria-label={t("pin.home.joinCode")}
                autoComplete="off"
              />
              <button className="btn secondary" type="submit" disabled={!code.trim()}>{t("pin.home.enter")}<ArrowRight /></button>
            </form>
          </div>
        </div>
      </section>

      <footer className="landing-footer">Pin · {t("pin.brand.tagline")}</footer>
    </main>
  );
}
