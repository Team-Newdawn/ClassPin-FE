"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { FolderTreeSidebar } from "@/app/component/folder-tree-sidebar";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Download, MessageCircleQuestion, Search, Sparkles } from "@/app/component/icons";
import { SlideCanvas } from "@/app/component/slide-canvas";
import { ExportDialog } from "@/app/component/export-dialog";
import { reportRequest } from "@/app/_controller/use-report";
import { EXPORT_LABELS, EXPORT_PARTS, useInsightsController, type ExportPart, type Section } from "./controller";
import shell from "../shell.module.css";
import styles from "./page.module.css";

const EXPORT_HINTS: Record<Exclude<ExportPart, "flow">, string> = { summary: "맨 위 핵심 정리", overview: "참여율 · 질문 · 반응 지표", slides: "슬라이드마다 핀·질문 수와 대표 질문", questions: "질문 유형과 전체 질문 목록" };
const SORTS = { reactions: "공감순", recent: "최신순" } as const;
const NO_RECORD = "플레이어에서 LIVE를 진행하면 기록됩니다.";
const when = (iso: string) => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(iso));

/** One brand-blue ring; the visible number is also the accessible name. */
const Donut = ({ label, value }: { label: string; value: number | null }) => value === null ? <span className={styles.noDonut}>기록 없음</span> : <svg className={styles.donut} viewBox="0 0 36 36" role="img" aria-label={`${label} ${value}%`}>
  <circle className={styles.track} cx="18" cy="18" r="15" pathLength={100} />
  <circle className={styles.ring} cx="18" cy="18" r="15" pathLength={100} strokeDasharray={`${value} 100`} transform="rotate(-90 18 18)" />
  <text x="18" y="18" textAnchor="middle" dominantBaseline="central">{value}%</text>
</svg>;

export default function InsightsPage() {
  const c = useInsightsController();
  const router = useRouter();
  const frame = (body: ReactNode) => <main className={`${shell.shell} ${c.sidebarOpen ? "" : shell.collapsed}`}>
    <FolderTreeSidebar folders={c.folders} open={c.sidebarOpen} onToggle={c.toggleSidebar} />
    <div className={shell.root}>{c.error && <p className={`${shell.error}`} role="alert">강의 기록과 AI 분석을 불러오지 못했습니다. 질문 수치는 그대로 보여 드려요. ({c.error})</p>}{body}</div>
  </main>;
  if (!c.session) return frame(c.ready ? <p className={shell.empty}>강의를 찾을 수 없습니다. 분석 목록에서 자료를 다시 선택해 주세요.</p> : <p role="status" className={shell.empty}>분석을 불러오는 중…</p>);
  if (c.loading) return frame(<p role="status" className={shell.empty}>분석을 불러오는 중…</p>);

  const { session, list } = c;
  // DSH-041: the report home opens with this material preselected (RPT-012).
  const reportHref = session.materialId ? `/admin/reports?material=${session.materialId}` : "/admin/reports";
  const card = (id: Section, title: string, sub: string, body: ReactNode) => <section className={styles.card} aria-labelledby={`${id}-title`}>
    <div className={styles.cardHead}>
      <div><h2 id={`${id}-title`}>{title}</h2><p>{sub}</p></div>
      <button type="button" className={styles.export} onClick={() => c.openExport(id)} aria-label={`${title} 내보내기`}><Download aria-hidden="true" />내보내기</button>
    </div>
    <p className={styles.summary}><span><Sparkles aria-hidden="true" />요약</span>{c.summaries[id]}</p>
    {body}
  </section>;
  const stat = ({ title, label, note, value, rows: items }: typeof c.overview[number]) => <div key={title} className={styles.column}>
    <div className={styles.columnTop}><div><h3>{title}</h3><p>{note}</p></div><Donut label={label} value={value} /></div>
    <dl className={styles.rows}>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </div>;
  const first = list.page * list.size;

  return frame(<>
    <header className={styles.header}>
      <Link href="/admin/insights" className={styles.back} aria-label="분석 목록으로"><ChevronLeft aria-hidden="true" /></Link>
      <div className={styles.titleCol}>
        <nav aria-label="경로" className={styles.crumbs}><Link href="/admin/insights">분석</Link>{c.folderName && <span>{c.folderName}</span>}<span aria-current="page">{session.title}</span></nav>
        <div className={styles.titleRow}>
          <h1 title={session.title}>{session.title}</h1>
          {c.siblings.length > 1 && <label className={styles.switch}><ChevronDown aria-hidden="true" />
            <select value={session.id} onChange={(event) => router.push(`/admin/insights/${event.target.value}`)} aria-label="같은 폴더의 다른 자료 분석 보기">
              {c.siblings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>}
        </div>
      </div>
      <p className={styles.meta}>{[when(c.date), c.minutes !== null && `진행 ${c.minutes}분`, c.audience !== null && `참여 ${c.audience}명`].filter(Boolean).join(" · ")}</p>
      <div className={styles.actions}>
        {/* Figma ClassPin 2235:2476. */}
        <Link className={`btn secondary ${styles.aiButton}`} href={reportHref}><Image src="/assets/design/spark.svg" alt="" width={14} height={14} />AI 리포트 만들기</Link>
        <button type="button" className="btn primary" onClick={() => c.openExport()}><Download aria-hidden="true" />전체 내보내기</button>
      </div>
    </header>

    <aside className={styles.banner} aria-label="분석 요약">
      <span className={styles.bannerIcon}><Sparkles aria-hidden="true" /></span>
      <div><b>분석 요약</b><p>{c.summaries.banner}</p></div>
    </aside>

    {card("overview", "개요", "참여, 질문, 반응을 한눈에", <div className={styles.columns}>
      {c.overview.map(stat)}
    </div>)}

    {card("flow", "시간대별 질문 흐름", c.flow ? `강의 시간 ${c.flow.buckets.at(-1)!.end}분 · ${c.flow.size}분 단위` : "LIVE 기록 없음",
      !c.flow ? <p className={styles.empty}>이 강의는 아직 LIVE로 진행한 적이 없습니다. {NO_RECORD}</p> : (() => {
        const max = Math.max(1, ...c.flow.buckets.map((bucket) => bucket.count));
        return <ol className={styles.bars}>{c.flow.buckets.map((bucket) => <li key={bucket.start} className={bucket.count === max ? styles.peak : ""}>
          <span>{bucket.count}건</span><i style={{ "--h": bucket.count / max } as CSSProperties} aria-hidden="true" /><small>{bucket.start}–{bucket.end}분</small>
        </li>)}</ol>;
      })())}

    {card("slides", "슬라이드별 핀 분석", "슬라이드를 넘기며 핀과 질문을 확인해요", !c.slide ? <p className={styles.empty}>슬라이드가 없습니다.</p> : <div className={styles.split}>
      <div className={styles.viewer}>
        <SlideCanvas slide={c.slide} showPins={false}>
          {c.slideQuestions.filter((question) => question.x !== null && question.y !== null)
            .map((question) => <span key={question.id} className={styles.pinDot} style={{ left: `${question.x! * 100}%`, top: `${question.y! * 100}%` }} aria-hidden="true" />)}
        </SlideCanvas>
        <div className={styles.pager}>
          <button type="button" className={styles.pageButton} disabled={c.index === 0} onClick={() => c.select(c.index - 1)} aria-label="이전 슬라이드"><ChevronLeft aria-hidden="true" /></button>
          <span><b>{c.index + 1}</b> / {c.slideCount}</span>
          <button type="button" className={styles.pageButton} disabled={c.index >= c.slideCount - 1} onClick={() => c.select(c.index + 1)} aria-label="다음 슬라이드"><ChevronRight aria-hidden="true" /></button>
        </div>
        <ul className={styles.thumbs}>{session.slides.map((slide, index) => <li key={slide.id}>
          <button type="button" aria-pressed={index === c.index} aria-label={`슬라이드 ${index + 1}, 질문 ${c.perSlide[index].questions}건`} onClick={() => c.select(index)}>
            <span className={styles.mini}><SlideCanvas slide={slide} compact showPins={false} /></span><small>P.{index + 1} · {c.perSlide[index].questions}</small>
          </button>
        </li>)}</ul>
      </div>
      <div className={styles.slideSide}>
        <h3 className={styles.slideTitle}><span className={styles.chip}>P.{c.index + 1}</span>{c.slide.title || `슬라이드 ${c.index + 1}`}</h3>
        <dl className={styles.stats}>{([["핀", `${c.perSlide[c.index].pins}개`], ["질문", `${c.perSlide[c.index].questions}건`], ["공감", `${c.perSlide[c.index].reactions}`]] as const)
          .map(([label, value]) => <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
        <div className={styles.listHead}><h4>이 슬라이드의 질문</h4><small>공감순</small></div>
        {c.slideQuestions.length ? <ul className={styles.slideQuestions}>{c.slideQuestions.map((question) => <li key={question.id}>
          <MessageCircleQuestion aria-hidden="true" /><p>{question.text}</p><small>공감 {question.reactionCount}</small>
        </li>)}</ul> : <p className={styles.empty}>이 슬라이드에는 질문이 없습니다.</p>}
        {c.slideSummary && <p className={styles.summary}><span><Sparkles aria-hidden="true" />AI 요약</span>{c.slideSummary}</p>}
      </div>
    </div>)}

    {card("questions", "질문 분석", "질문 유형과 전체 질문 목록", <div className={styles.split}>
      <div className={styles.types}>
        <h3>질문 유형</h3>
        {c.types?.length ? <ul>{c.types.map((type) => <li key={type.title}>
          <div><span>{type.title}</span><small>{type.count}건 · {type.percent}%</small></div>
          <i aria-hidden="true"><span style={{ width: `${c.types![0].count ? (type.count / c.types![0].count) * 100 : 0}%` }} /></i>
        </li>)}</ul> : <p className={styles.empty} role="status">{c.typesNote}</p>}
      </div>
      <div className={styles.all}>
        <div className={styles.listHead}>
          <h3>전체 질문 <span>{c.total}</span></h3>
          <label className={styles.search}><Search aria-hidden="true" />
            <input type="search" value={list.query} onChange={(event) => list.setQuery(event.target.value)} placeholder="질문 검색" aria-label="질문 검색" />
          </label>
          {/* DSH-040, Figma 2242:2144: same <details> menu as the folder cards; closes on Escape or when focus leaves. */}
          <details className={styles.filterMenu} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}
            onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary className={styles.filter} aria-label={`질문 필터: ${list.slideFilter === "all" ? "전체 슬라이드" : `P.${Number(list.slideFilter) + 1}`}, ${SORTS[list.sort]}`}>
              {list.slideFilter === "all" ? "전체 슬라이드" : `P.${Number(list.slideFilter) + 1}`} · {SORTS[list.sort]}<ChevronDown aria-hidden="true" />
            </summary>
            {/* tabIndex keeps focus inside on a mouse press, so the onBlur above does not close the menu before the chip is chosen. */}
            <div className={styles.filterPanel} tabIndex={-1}>
              <fieldset className={styles.chips}><legend>슬라이드</legend>
                {["all", ...list.slides.map(String)].map((value) => <label key={value}>
                  <input type="radio" name="question-slide" value={value} checked={list.slideFilter === value} onChange={() => list.setSlideFilter(value)} />
                  <span>{value === "all" ? "전체" : `P.${Number(value) + 1}`}</span></label>)}
              </fieldset>
              <fieldset className={styles.sorts}><legend>정렬</legend>
                {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((value) => <label key={value}>
                  <input type="radio" name="question-sort" value={value} checked={list.sort === value} onChange={() => list.setSort(value)} />
                  <span>{SORTS[value]}</span>{list.sort === value && <Check aria-hidden="true" />}</label>)}
              </fieldset>
            </div>
          </details>
        </div>
        {list.count ? <ul className={styles.allQuestions}>{list.rows.slice(first, first + list.size).map((question) => <li key={question.id}>
          <span className={styles.chip}>P.{question.slideIndex + 1}</span><p>{question.text}</p><small>공감 <b>{question.reactionCount}</b></small>
        </li>)}</ul> : <p className={styles.empty}>{c.total ? "조건에 맞는 질문이 없습니다." : "이 강의에는 질문이 없습니다."}</p>}
        {list.count > 0 && <nav className={styles.pages} aria-label="질문 페이지">
          <small>{first + 1}–{Math.min(first + list.size, list.count)} / {list.count}</small>
          <button type="button" className={styles.pageButton} disabled={list.page === 0} onClick={() => list.setPage(list.page - 1)} aria-label="이전 페이지"><ChevronLeft aria-hidden="true" /></button>
          {Array.from({ length: list.pageCount }, (_, page) => page).filter((page) => page === 0 || page === list.pageCount - 1 || Math.abs(page - list.page) <= 1)
            .map((page, index, shown) => <span key={page} className={styles.pageGroup}>
              {index > 0 && page - shown[index - 1] > 1 && <span aria-hidden="true">…</span>}
              <button type="button" className={styles.pageButton} aria-current={page === list.page ? "page" : undefined} onClick={() => list.setPage(page)} aria-label={`${page + 1}페이지`}>{page + 1}</button>
            </span>)}
          <button type="button" className={styles.pageButton} disabled={list.page >= list.pageCount - 1} onClick={() => list.setPage(list.page + 1)} aria-label="다음 페이지"><ChevronRight aria-hidden="true" /></button>
        </nav>}
      </div>
    </div>)}

    {c.exporting && <ExportDialog title={c.exporting.all ? "전체 내보내기" : "내보내기"} subtitle={session.title} reloadKey={c.exporting.parts.join()} onClose={c.closeExport}
      load={(format, signal) => reportRequest(`/api/admin/insights/export?format=${format}&preview=1`, { method: "POST", signal,
        body: JSON.stringify({ document: c.exportDocument(c.exporting!.parts), fileName: session.fileName }) })}
      options={<fieldset className={styles.exportParts}><legend>포함 항목</legend>
        {EXPORT_PARTS.map((part) => {
          const checked = c.exporting!.parts.includes(part);
          // The last checked item stays: an export needs at least one.
          return <label key={part}><input type="checkbox" checked={checked} disabled={checked && c.exporting!.parts.length === 1} onChange={() => c.toggleExport(part)} />
            <span><b>{EXPORT_LABELS[part]}</b><small>{part === "flow" ? c.flow ? `${c.flow.size}분 단위 질문 수` : "LIVE 기록이 없어 이유만 넣어요" : EXPORT_HINTS[part]}</small></span></label>;
        })}
      </fieldset>}
      note="선택한 형식·항목으로 파일을 만들어요. 슬라이드 이미지는 넣지 않아요."
      actions={<Link className={`btn secondary ${styles.aiButton}`} href={reportHref}><Sparkles aria-hidden="true" />AI 리포트로 이어서 작성</Link>} />}
  </>);
}
