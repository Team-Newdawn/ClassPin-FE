"use client";

import { ChevronLeft, ChevronRight } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { useLectureRemote } from "@/app/_controller/use-lecture-remote";
import { LoadingScreen } from "@/app/component/loading-screen";
import styles from "./page.module.css";

/** 로그인 없는 발표 리모컨. 처음 연 기기 한 대만 LIVE 슬라이드를 한 장씩 넘긴다. */
export default function LectureRemote() {
  const { t } = useLanguage();
  const { state, lecture, syncError, previous, next } = useLectureRemote();

  if (state === "loading") return <LoadingScreen />;
  if (state !== "ready" || !lecture) {
    const [title, body] = state === "inUse" ? ["remote.inUseTitle", "remote.inUseBody"] as const
      : state === "revoked" ? ["remote.revokedTitle", "remote.revokedBody"] as const
        : ["remote.offlineTitle", "remote.syncError"] as const;
    return <main className={styles.root}><section className={styles.notice}><h1>{t(title)}</h1><p>{t(body)}</p></section></main>;
  }

  const { currentSlide, slideCount, live } = lecture;
  return <main className={styles.root}>
    <header className={styles.header}>
      <span className={`${styles.badge} ${live ? styles.live : ""}`}>{t(live ? "session.liveLabel" : "session.notStartedLabel")}</span>
      <h1 title={lecture.title}>{lecture.title}</h1>
    </header>
    <p className={styles.page} aria-live="polite"><b>{slideCount ? currentSlide + 1 : 0}</b> / {slideCount}</p>
    {!live && <p className={styles.hint}>{t("remote.waiting")}</p>}
    {syncError && <p className={styles.error} role="alert">{t("remote.syncError")}</p>}
    <div className={styles.controls}>
      <button type="button" className="btn secondary" disabled={!live || currentSlide <= 0} onClick={previous}><ChevronLeft aria-hidden="true" />{t("remote.previous")}</button>
      <button type="button" className="btn primary" disabled={!live || currentSlide >= slideCount - 1} onClick={next}>{t("remote.next")}<ChevronRight aria-hidden="true" /></button>
    </div>
  </main>;
}
