"use client";

import { useState, type CSSProperties } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import type { Locale } from "@/app/_model/i18n";
import styles from "./lecture-overview.module.css";

/** The dashboard and the end report (docs/ohpin-figma-ui-redesign.md §3.8) show the same two blocks. */
export const lectureWhen = (iso: string, locale: Locale) => new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(iso));

/** DSH-031: the scoreboard; each cell is [label, value, note]. */
export function ScoreBoard({ board }: { board: readonly [string, string, string][] }) {
  return <dl className={styles.board}>
    {board.map(([label, value, note]) => <div key={label}><dt>{label}</dt><dd title={value}>{value}</dd>{note && <dd>{note}</dd>}</div>)}
  </dl>;
}

/** DSH-030: PIN questions per slide, one dataset drawn as bars or as a line. */
export function PinFlow({ perSlide }: { perSlide: readonly { pins: number }[] }) {
  const { t } = useLanguage();
  const [chart, setChart] = useState<"bar" | "line">("bar");
  const count = perSlide.length;
  if (!count) return <p className={styles.empty}>{t("insight.noSlides")}</p>;
  const peak = Math.max(0, ...perSlide.map((row) => row.pins)), max = peak || 1;
  // The line's x is each column's centre, so columns carry no gap.
  const points = perSlide.map((row, slide) => `${((slide + 0.5) / count) * 100},${(1 - row.pins / max) * 100}`).join(" ");
  return <>
    <div className={styles.chartModes} role="group" aria-label={t("insight.chartType")}>
      {(["bar", "line"] as const).map((mode) => <button key={mode} type="button" aria-pressed={chart === mode} onClick={() => setChart(mode)}>{t(mode === "bar" ? "insight.chartBar" : "insight.chartLine")}</button>)}
    </div>
    <div className={styles.chartScroll}>
      <div className={`${styles.plot} ${chart === "line" ? styles.line : ""}`} style={{ "--n": count } as CSSProperties}>
        {chart === "line" && <svg className={styles.lineSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} vectorEffect="non-scaling-stroke" /></svg>}
        <ol className={styles.bars}>
          {perSlide.map((row, slide) => <li key={slide} className={peak && row.pins === peak ? styles.peak : ""} aria-label={t("insight.slidePins", { slide: slide + 1, count: row.pins })}>
            <span aria-hidden="true">{row.pins}</span><i style={{ "--h": row.pins / max } as CSSProperties} aria-hidden="true" /><small aria-hidden="true">P.{slide + 1}</small>
          </li>)}
        </ol>
      </div>
    </div>
  </>;
}
