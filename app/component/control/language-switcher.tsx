"use client";

import { useLanguage } from "@/app/_controller/language-context";
import styles from "./language-switcher.module.css";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div className={`${styles.switcher} language-switcher ${className}`} role="group" aria-label={t("language.label")}>
      <button type="button" className={locale === "ko" ? "active" : ""} aria-pressed={locale === "ko"} title={t("language.ko")} onClick={() => setLocale("ko")}>KO</button>
      <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} title={t("language.en")} onClick={() => setLocale("en")}>EN</button>
    </div>
  );
}
