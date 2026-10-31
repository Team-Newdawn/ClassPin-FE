"use client";

import type { ReactNode } from "react";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { LineChart, WordCloud } from "./component/charts";
import { useInsightsController } from "./controller";
import shell from "../shell.module.css";
import styles from "./page.module.css";

const NO_RECORD = "플레이어에서 LIVE를 진행하면 기록됩니다.";
const duration = (seconds: number) => seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds}초`;
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const Bar = ({ value, max }: { value: number; max: number }) => <span className={styles.cellBar} aria-hidden="true"><span style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></span>;

export default function InsightsPage() {
  const c = useInsightsController();
  const frame = (body: ReactNode) => <main className={`${shell.shell} ${c.sidebarOpen ? "" : shell.collapsed}`}>
    <FolderTreeSidebar folders={c.folders} open={c.sidebarOpen} onToggle={c.toggleSidebar} />
    <div className={shell.root}>{c.error && <p className={shell.error} role="alert">참여자·슬라이드 노출 기록과 주제별 묶음을 불러오지 못했습니다. 나머지 수치는 그대로 보여 드려요. ({c.error})</p>}{body}</div>
  </main>;
  if (!c.session) return frame(c.ready ? <p className={shell.empty}>강의를 찾을 수 없습니다. 폴더에서 자료를 다시 선택해 주세요.</p> : <p role="status" className={shell.empty}>인사이트를 불러오는 중…</p>);
  if (c.loading) return frame(<p role="status" className={shell.empty}>인사이트를 불러오는 중…</p>);

  const { session, stats, slide } = c;
  // DSH-042: when the record request failed, say so instead of claiming the lecture has no record.
  const why = c.error ? "기록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요." : NO_RECORD;
  const max = (key: "seconds" | "pins" | "reactions" | "pinsPerMinute") => Math.max(0, ...stats.map((row) => row[key] ?? 0));
  const domain: [number, number] = [0, Math.max(0, c.pins.length - 1)];
  const audienceTimeline = c.timeline.map(({ minute, audience }) => ({ minute, value: audience }));
  const pinTimeline = c.timeline.map(({ minute, pins }) => ({ minute, value: pins }));

  return frame(<>
    <header className={styles.header}>
      <div className={shell.head}>
        <h1>{session.title} 인사이트</h1>
        <p>{session.fileName} · {session.startedAt ? `마지막 LIVE ${date(session.startedAt)}` : "LIVE 기록 없음"}</p>
      </div>
    </header>

    <section aria-labelledby="kpi-title">
      <h2 id="kpi-title" className="sr-only">핵심 수치</h2>
      <dl className={styles.kpis}>{c.metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>

    <section className={styles.charts} aria-labelledby="time-title">
      <h2 id="time-title" className="sr-only">시간에 따른 변화</h2>
      <div className={styles.card}>
        {!c.span ? <p className={styles.empty}>이 강의는 아직 LIVE로 진행한 적이 없어 시간 그래프가 없습니다. {NO_RECORD}</p>
          : c.hasPins ? <LineChart label="분당 PIN" unit="개" points={c.pins} domain={domain} bands={c.bands} />
            : <p className={styles.empty}>강의 시간 동안 위치를 찍은 PIN이 없어 분당 PIN 그래프가 없습니다.</p>}
      </div>
      <div className={styles.card}>
        {c.span && c.audience.length ? <LineChart label="참여자" unit="명" points={c.audience} domain={domain} bands={c.bands} />
          : <p className={styles.empty}>이 강의는 참여자 기록이 없습니다. {why}</p>}
      </div>
    </section>

    <section className={styles.card} aria-labelledby="slides-title">
      <h2 id="slides-title">슬라이드별</h2>
      {!stats.length ? <p className={styles.empty}>슬라이드가 없습니다.</p> : <>
        {!c.intervals.length && <p className={styles.note}>슬라이드 노출 기록이 없어 노출 시간과 분당 PIN은 비어 있습니다. {why}</p>}
        <div className={styles.scroll}><table className={styles.table}>
          <thead><tr><th scope="col">슬라이드</th><th scope="col">노출 시간</th><th scope="col">PIN</th><th scope="col">공감</th><th scope="col">분당 PIN</th></tr></thead>
          <tbody>{stats.map((row) => {
            const active = row.slide - 1 === c.index;
            return <tr key={row.slide} className={active ? styles.active : ""} onClick={() => c.select(row.slide - 1)}>
              <th scope="row"><button type="button" aria-pressed={active}>슬라이드 {row.slide}</button></th>
              <td><span>{c.intervals.length ? duration(row.seconds) : "—"}</span><Bar value={row.seconds} max={max("seconds")} /></td>
              <td><span>{row.pins}</span><Bar value={row.pins} max={max("pins")} /></td>
              <td><span>{row.reactions}</span><Bar value={row.reactions} max={max("reactions")} /></td>
              <td><span>{row.pinsPerMinute ?? "—"}</span><Bar value={row.pinsPerMinute ?? 0} max={max("pinsPerMinute")} /></td>
            </tr>;
          })}</tbody>
        </table></div>
      </>}
    </section>

    {slide && <section className={styles.card} aria-labelledby="slide-title">
      <h2 id="slide-title">슬라이드 {c.index + 1} 상세</h2>
      <div className={styles.detail}>
        <div className={styles.canvas}>
          <SlideCanvas slide={slide} showPins={false}>
            {c.slideQuestions.filter((question) => question.x !== null && question.y !== null)
              .map((question) => <span key={question.id} className={styles.pinDot} style={{ left: `${question.x! * 100}%`, top: `${question.y! * 100}%` }} aria-hidden="true" />)}
          </SlideCanvas>
          <p className={styles.caption}>PIN {stats[c.index]?.pins ?? 0}개의 위치</p>
        </div>
        <div className={styles.miniCharts}>
          {!c.timeline.length ? <p className={styles.empty}>이 슬라이드가 화면에 나온 기록이 없습니다. {why}</p> : <>
            {audienceTimeline.some((point) => point.value !== null)
              ? <LineChart label="이 슬라이드의 참여자" unit="명" points={audienceTimeline} compact />
              : <p className={styles.empty}>이 슬라이드 구간의 참여자 기록이 없습니다.</p>}
            <LineChart label="이 슬라이드의 PIN" unit="개" points={pinTimeline} compact />
          </>}
        </div>
      </div>
      <h3>공감 많은 질문</h3>
      {c.slideQuestions.length
        ? <ol className={styles.questions}>{c.slideQuestions.map((question) => <li key={question.id}><p>{question.text}</p><span>공감 {question.reactionCount}</span></li>)}</ol>
        : <p className={styles.empty}>이 슬라이드에는 질문이 없습니다.</p>}
    </section>}

    <section className={styles.card} aria-labelledby="topics-title">
      <h2 id="topics-title">주제별 묶음</h2>
      {c.topics?.length
        ? <ul className={styles.topics}>{c.topics.map((topic) => <li key={topic.title}><b>{topic.title}</b><span>질문 {topic.count}개</span><p>{topic.summary}</p></li>)}</ul>
        : <div className={styles.empty}><p>{c.error ? "주제별 묶음을 불러오지 못했습니다." : c.reportId ? "리포트 초안을 다시 만들면 주제별 묶음이 나옵니다." : "리포트를 만들면 주제별 묶음이 나옵니다."}</p></div>}
    </section>

    <section className={styles.card} aria-labelledby="keywords-title">
      <h2 id="keywords-title">키워드</h2>
      {c.keywords.length ? <WordCloud label="질문 키워드, 많이 나온 단어일수록 크게" words={c.keywords} /> : <p className={styles.empty}>질문이 없어 키워드가 없습니다.</p>}
    </section>
  </>);
}
