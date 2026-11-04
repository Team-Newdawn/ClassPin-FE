"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/app/_controller/language-context";
import type { ClassSession } from "@/app/_model/types";
import { lectureOverview, useLectureRecord } from "@/app/(view)/admin/insights/[id]/controller";
import { lectureWhen, PinFlow, ScoreBoard } from "@/app/(view)/admin/insights/[id]/component/lecture-overview";
import styles from "./session-end-report.module.css";

/** docs/ohpin-figma-ui-redesign.md §3.8 (Figma 2344:9009): the dashboard's overview and PIN flow, nothing else. */
export function SessionEndReport({ session }: { session: ClassSession }) {
  const { t, locale } = useLanguage();
  const { data } = useLectureRecord(session.id);
  // The AI question types belong to the dashboard; here the last cell is the most-empathized question.
  const { board, perSlide, date, minutes } = lectureOverview(session, data?.record ?? null, t, null);
  const card = (id: string, title: string, sub: string, body: React.ReactNode) => <section className={styles.card} aria-labelledby={id}>
    <div className={styles.cardHead}><h3 id={id}>{title}</h3><p>{sub}</p></div>{body}
  </section>;

  return <main className={styles.root}>
    <header className={styles.topBar}>
      <Link href={`/admin/folders/${session.folderId ?? "unfiled"}`} className={styles.back} aria-label={t("session.backToFolder")}><Image src="/assets/design/report-back.svg" width={16} height={16} alt="" /></Link>
      <div className={styles.title}><small>{t("report.kicker")}</small><h1>{session.title}</h1></div>
    </header>
    <div className={styles.content}>
      <div className={styles.head}>
        <div><h2>{t("report.kicker")}</h2><p>{[lectureWhen(date, locale), minutes !== null && t("insight.minutes", { count: minutes })].filter(Boolean).join(" · ")}</p></div>
        <Link className={`btn secondary ${styles.open}`} href={`/admin/insights/${session.id}`}>{t("report.openAnalysis")}<span aria-hidden="true">↗</span></Link>
      </div>
      {card("end-overview", t("insight.part.overview"), t("insight.sub.overview"), <ScoreBoard board={board} />)}
      {card("end-flow", t("insight.part.flow"), t("insight.sub.flow"), <PinFlow perSlide={perSlide} />)}
    </div>
  </main>;
}
