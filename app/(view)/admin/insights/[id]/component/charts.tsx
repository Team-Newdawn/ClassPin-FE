"use client";

import cloud from "d3-cloud";
import { useEffect, useState, type PointerEvent } from "react";
import styles from "./charts.module.css";

type ChartPoint = { minute: number; value: number | null };
/** Minutes since lecture start; every other band is tinted (DSH-041). */
type ChartBand = { slide: number; start: number; end: number };

/** DSH-041: one brand-blue line, one y axis, hover crosshair, and a table view. Breaks the line at gaps and missing values. */
export function LineChart({ label, unit, points, domain, bands = [], compact = false }: {
  label: string; unit: string; points: ChartPoint[]; domain?: [number, number]; bands?: ChartBand[]; compact?: boolean;
}) {
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const [first, end] = domain ?? [points[0]?.minute ?? 0, points.at(-1)?.minute ?? 0], last = Math.max(end, first + 1);
  const max = Math.max(1, ...points.map((point) => point.value ?? 0));
  const x = (minute: number) => ((minute - first) / (last - first)) * 100, y = (value: number) => 100 - (value / max) * 100;
  let path = "", previous: ChartPoint | undefined;
  for (const point of points) {
    if (point.value === null) { previous = undefined; continue; }
    // "h0" draws a lone point as a round-capped dot.
    path += previous && point.minute - previous.minute <= 1 ? `L${x(point.minute)},${y(point.value)}` : `M${x(point.minute)},${y(point.value)}h0`;
    previous = point;
  }
  const slideAt = (minute: number) => bands.find((band) => minute >= Math.floor(band.start) && minute < band.end)?.slide;
  const track = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(), minute = first + ((event.clientX - rect.left) / rect.width) * (last - first);
    setHover(points.reduce<ChartPoint | null>((best, point) => !best || Math.abs(point.minute - minute) < Math.abs(best.minute - minute) ? point : best, null));
  };
  const hoverSlide = hover && slideAt(hover.minute);

  return <figure className={styles.chart}>
    <figcaption>{label}</figcaption>
    <div className={`${styles.plot} ${compact ? styles.compact : ""}`} onPointerMove={track} onPointerLeave={() => setHover(null)}>
      <span className={styles.yMax}>{max}{unit}</span><span className={styles.yZero}>0</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {/* Bands run to the lecture's last second, past the last minute bucket; clip them to the axis. */}
        {bands.map((band, index) => {
          const left = x(Math.max(band.start, first)), right = x(Math.min(band.end, last));
          return index % 2 === 0 && right > left && <rect key={index} className={styles.band} x={left} width={right - left} y={0} height={100} />;
        })}
        <line className={styles.grid} x1={0} x2={100} y1={50} y2={50} /><line className={styles.axis} x1={0} x2={100} y1={100} y2={100} />
        <path className={styles.line} d={path} />
      </svg>
      {hover && <>
        <span className={styles.crosshair} style={{ left: `${x(hover.minute)}%` }} />
        {hover.value !== null && <span className={styles.dot} style={{ left: `${x(hover.minute)}%`, top: `${y(hover.value)}%` }} />}
        <span className={styles.tip} style={{ left: `${x(hover.minute)}%` }} data-side={x(hover.minute) > 60 ? "left" : "right"}>
          {hover.minute}분 · {hover.value === null ? "기록 없음" : `${hover.value}${unit}`}{hoverSlide ? ` · 슬라이드 ${hoverSlide}` : ""}
        </span>
      </>}
    </div>
    <div className={styles.xAxis} aria-hidden="true"><span>{first}분</span><span>{last}분</span></div>
    <details className={styles.table}>
      <summary>표로 보기</summary>
      <table>
        <thead><tr><th scope="col">시간</th><th scope="col">{label}</th>{bands.length > 0 && <th scope="col">슬라이드</th>}</tr></thead>
        <tbody>{points.map((point) => <tr key={point.minute}>
          <td>{point.minute}분</td><td>{point.value === null ? "기록 없음" : `${point.value}${unit}`}</td>{bands.length > 0 && <td>{slideAt(point.minute) ?? "—"}</td>}
        </tr>)}</tbody>
      </table>
    </details>
  </figure>;
}

const CLOUD_W = 800, CLOUD_H = 360;
// Navy, blue and slate by rank, so the biggest word gets the darkest ink.
const INKS = ["--pin-blue-900", "--pin-blue-600", "--pin-neutral-600", "--pin-blue-800", "--pin-blue-500", "--pin-neutral-400"];
type CloudWord = cloud.Word & { value: number; ink: string };

/** Packed word cloud (d3-cloud, pixel collision, every third word turned 90°): size grows with the count. */
export function WordCloud({ label, words }: { label: string; words: { label: string; value: number }[] }) {
  const [placed, setPlaced] = useState<CloudWord[]>([]);
  // The controller rebuilds the array every render; lay out again only when the words change.
  const signature = JSON.stringify(words);
  useEffect(() => {
    const list: typeof words = JSON.parse(signature);
    const max = Math.max(1, ...list.map((word) => word.value)), min = Math.min(max, ...list.map((word) => word.value));
    const layout = cloud<CloudWord>().size([CLOUD_W, CLOUD_H])
      .words(list.map((word, index) => ({ text: word.label, value: word.value, ink: INKS[index % INKS.length], rotate: index % 3 === 2 ? 90 : 0,
        size: Math.round(16 + Math.sqrt(max === min ? 0.1 : (word.value - min) / (max - min)) * 80) })))
      .font(getComputedStyle(document.body).fontFamily).fontWeight(800).fontSize((word) => word.size!).rotate((word) => word.rotate!)
      .padding(2).spiral("rectangular").random(() => 0.5).on("end", (tags) => setPlaced(tags));
    // Measure with the loaded web font, or the packed words overlap once it swaps in.
    let live = true;
    document.fonts.ready.then(() => { if (live) layout.start(); });
    return () => { live = false; layout.stop(); };
  }, [signature]);
  return <figure className={styles.chart}>
    <svg className={styles.cloud} viewBox={`${-CLOUD_W / 2} ${-CLOUD_H / 2} ${CLOUD_W} ${CLOUD_H}`} role="img" aria-label={label}>
      {placed.map((word) => <text key={word.text} textAnchor="middle" transform={`translate(${word.x},${word.y}) rotate(${word.rotate})`}
        style={{ fontSize: word.size, fill: `var(${word.ink})` }}><title>{`${word.text} ${word.value}회`}</title>{word.text}</text>)}
    </svg>
    <details className={styles.table}>
      <summary>표로 보기</summary>
      <table>
        <thead><tr><th scope="col">순위</th><th scope="col">키워드</th><th scope="col">횟수</th></tr></thead>
        <tbody>{words.map((word, index) => <tr key={word.label}><td>{index + 1}</td><td>{word.label}</td><td>{word.value}회</td></tr>)}</tbody>
      </table>
    </details>
  </figure>;
}
