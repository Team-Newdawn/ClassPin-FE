"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { categoryLabel as getCategoryLabel, type Locale, statusLabel as getStatusLabel, timeAgo as getTimeAgo, translate, type TranslationKey } from "@/app/_model/i18n";
import type { QuestionCategory, QuestionStatus } from "@/app/_model/types";

const STORAGE_KEY = "pin-class-locale";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  categoryLabel: (category: QuestionCategory) => string;
  statusLabel: (status: QuestionStatus) => string;
  timeAgo: (value: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const systemLocale = (): Locale => navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setActiveLocale] = useState<Locale>("ko");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const preferred: Locale = stored === "ko" || stored === "en"
      ? stored
      : systemLocale();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setActiveLocale(preferred);
    });

    // 수동 선택이 없을 때만 실행 중 시스템 언어 변경도 따라간다.
    const followSystemLocale = () => {
      const manual = window.localStorage.getItem(STORAGE_KEY);
      if (manual !== "ko" && manual !== "en") setActiveLocale(systemLocale());
    };
    window.addEventListener("languagechange", followSystemLocale);
    return () => {
      active = false;
      window.removeEventListener("languagechange", followSystemLocale);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    setActiveLocale(nextLocale);
  }, []);

  const t = useCallback((key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values), [locale]);
  const categoryLabel = useCallback((category: QuestionCategory) => getCategoryLabel(locale, category), [locale]);
  const statusLabel = useCallback((status: QuestionStatus) => getStatusLabel(locale, status), [locale]);
  const timeAgo = useCallback((value: string) => getTimeAgo(locale, value), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, categoryLabel, statusLabel, timeAgo }), [categoryLabel, locale, setLocale, statusLabel, t, timeAgo]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
