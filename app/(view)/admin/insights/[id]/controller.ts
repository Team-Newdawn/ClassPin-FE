"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useParams } from "next/navigation";
import { reportRequest } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import { useBrowserPreferences } from "@/app/_controller/use-browser-preferences";
import { exportSections, lectureSpan, questionFlow, rememberView } from "@/app/_model/insight-dashboard";
import { REPORT_LIMITS, reportMetrics, type ReportDocument } from "@/app/_model/report";
import { lectureDate, RECENT_ANALYSES, type RecentAnalyses } from "../controller";

/** docs/instructor-insight-dashboard.md DSH-021. */
type Insights = {
  record: { startedAt: string | null; endedAt: string | null; audience: number; peakAudience: number } | null;
  topics: { title: string; summary: string; questionIds: string[] }[] | null;
  slides: { page: number; summary: string }[] | null;
  reportId: string | null;
};
export type Section = "overview" | "flow" | "slides" | "questions";
/** DSH-042: export items in document order; `summary` is the top banner. */
export const EXPORT_PARTS = ["summary", "overview", "flow", "slides", "questions"] as const;
export type ExportPart = typeof EXPORT_PARTS[number];
export const EXPORT_LABELS: Record<ExportPart, string> = { summary: "분석 요약", overview: "개요", flow: "시간대별 질문 흐름", slides: "슬라이드별 핀 분석", questions: "질문 분석" };
const PAGE_SIZE = 10;
const isPin = (question: { x: number | null; y: number | null }) => question.x !== null && question.y !== null;
const percent = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;
/** DSH-031: people ÷ tabs can pass 100% (reloads, several runs); the donut stops at 100. */
const ratio = (part: number, whole: number) => Math.min(100, percent(part, whole));
const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const fold = (text: string) => text.normalize("NFC").toLowerCase();
const clip = (text: string) => text.length > 40 ? `${text.slice(0, 40)}…` : text;

export function useInsightsController() {
  const { id } = useParams<{ id: string }>();
  const { sessions, folders, ready } = useSessions();
  const [data, setData] = useState<Insights | null>(null), [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true), [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState(""), [slideFilter, setSlideFilter] = useState("all"), [sort, setSort] = useState<"reactions" | "recent">("reactions"), [page, setPage] = useState(0);
  const [exporting, setExporting] = useState<{ all: boolean; parts: ExportPart[] } | null>(null);
  const [people, setPeople] = useState<{ questionAuthors: number; engaged: number; reactorsOrPinAuthors: number } | null>(null);
  const [grouped, setGrouped] = useState<{ groups: NonNullable<Insights["topics"]> } | { error: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    reportRequest(`/api/admin/lectures/${encodeURIComponent(id)}/insights`, { signal: controller.signal }).then((response) => response.json())
      .then(setData, (failure: Error & { status?: number }) => {
        if (!controller.signal.aborted) setError(failure.status === 404 ? "이 강의의 기록을 찾을 수 없습니다." : failure.message);
      });
    return () => controller.abort();
  }, [id]);
  const live = sessions.find((item) => item.id === id)?.questions, questionCount = live?.length ?? 0;
  // A report analysis made from questions that were since deleted says nothing about the current ones (topics, slide summaries).
  const analysis = data?.topics?.some((topic) => topic.questionIds.some((qid) => live?.some((question) => question.id === qid))) ? data : null;
  // DSH-023: who asked or reacted; a failure only blanks those numbers.
  useEffect(() => {
    const controller = new AbortController();
    // DSH-023 step 2: switch to `/api/rest/instructor/lectures/{id}/participation` once ClassPin-BE#10 B is deployed.
    reportRequest(`/api/admin/lectures/${encodeURIComponent(id)}/participation`, { signal: controller.signal }).then((response) => response.json())
      .then(setPeople, () => undefined);
    return () => controller.abort();
  }, [id, questionCount]);
  // DSH-034: without a report's topic groups, the server groups the questions once (and again only when they change).
  const needGroups = data !== null && !analysis && questionCount > 0;
  useEffect(() => {
    if (!needGroups) return;
    const controller = new AbortController();
    reportRequest(`/api/admin/lectures/${encodeURIComponent(id)}/question-groups`, { method: "POST", signal: controller.signal }).then((response) => response.json())
      .then((body: { groups: NonNullable<Insights["topics"]> }) => setGrouped({ groups: body.groups }), (failure: Error & { code?: string }) => {
        if (!controller.signal.aborted) setGrouped({ error: failure.code === "ANALYSIS_NOT_CONFIGURED" ? "AI 설정이 없어 질문 유형을 만들 수 없습니다." : "질문 유형을 만들지 못했습니다. 잠시 후 다시 열어 주세요." });
      });
    return () => controller.abort();
  }, [id, needGroups, questionCount]);

  const session = sessions.find((item) => item.id === id);
  // DSH-052: opening a lecture's dashboard puts it at the top of "최근 분석" on the list.
  const [recent, saveRecent] = useBrowserPreferences<RecentAnalyses>(RECENT_ANALYSES);
  const remember = useEffectEvent(() => saveRecent({ viewed: rememberView(recent.viewed ?? {}, id, new Date().toISOString()) }));
  const found = Boolean(session);
  useEffect(() => { if (found) remember(); }, [id, found]);
  const shared = { ready, error, loading: !data && !error, folders, sidebarOpen, toggleSidebar: () => setSidebarOpen((open) => !open),
    /** DSH-042: a section's button starts with that item, "전체 내보내기" with all of them; the instructor can change both. */
    exporting, openExport: (part?: Section) => setExporting({ all: !part, parts: part ? [part] : [...EXPORT_PARTS] }), closeExport: () => setExporting(null),
    toggleExport: (part: ExportPart) => setExporting((current) => current && { ...current,
      parts: current.parts.includes(part) ? current.parts.filter((item) => item !== part) : EXPORT_PARTS.filter((item) => item === part || current.parts.includes(item)) }) };
  if (!session) return { ...shared, session: null } as const;

  const questions = session.questions, slideCount = session.slides.length, record = data?.record ?? null;
  const span = lectureSpan(session.startedAt, record?.endedAt ?? null, questions);
  const flow = span ? questionFlow(questions, span) : null;
  const perSlide = session.slides.map((_, index) => {
    const on = questions.filter((question) => question.slideIndex === index);
    return { questions: on.length, pins: on.filter(isPin).length, reactions: on.reduce((sum, question) => sum + question.reactionCount, 0) };
  });
  const total = questions.length, pins = questions.filter(isPin).length, reactions = questions.reduce((sum, question) => sum + question.reactionCount, 0);
  const pinnedSlides = perSlide.filter((row) => row.pins > 0).length, audience = record?.audience ?? null;
  const ranked = perSlide.map((row, index) => ({ ...row, index })).filter((row) => row.questions > 0).sort((a, b) => b.questions - a.questions);
  const index = Math.min(selected ?? ranked[0]?.index ?? 0, Math.max(0, slideCount - 1));

  // DSH-034: topic groups stand in for question types; counts keep only questions that still exist.
  const known = new Set(questions.map((question) => question.id));
  const topics = analysis?.topics ?? (grouped && "groups" in grouped ? grouped.groups : null);
  const types = topics?.map((topic) => ({ title: topic.title, count: topic.questionIds.filter((questionId) => known.has(questionId)).length }))
    .filter((type) => type.count).sort((a, b) => b.count - a.count).map((type) => ({ ...type, percent: percent(type.count, total) })) ?? null;
  const typesNote = !total ? "질문이 없어 질문 유형이 없습니다." : error ? "질문 유형을 불러오지 못했습니다."
    : grouped && "error" in grouped ? grouped.error : "질문을 주제별로 묶는 중이에요…";
  const byReactions = [...questions].sort((a, b) => b.reactionCount - a.reactionCount);
  const needle = fold(query.trim());
  // DSH-040: the list filter (Figma 2242:2144) sorts by reactions or newest first.
  const ordered = sort === "recent" ? [...questions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : byReactions;
  const filtered = ordered.filter((question) => (slideFilter === "all" || question.slideIndex === Number(slideFilter)) && (!needle || fold(question.text).includes(needle)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pageCount - 1);

  // DSH-032: summaries are written from the numbers, not by AI.
  const peak = flow?.buckets.reduce((best, bucket) => bucket.count > best.count ? bucket : best);
  const top = ranked.slice(0, 2);
  const slideNames = top.map((row) => `P.${row.index + 1}`).join(" · ");
  const summaries = {
    banner: total ? `질문 ${total}건과 공감 ${reactions}개가 모였어요. ${`P.${ranked[0].index + 1}`} 슬라이드에서 질문이 가장 많았어요.` : "아직 이 강의에 들어온 질문이 없어요.",
    overview: audience && people ? `참여율 ${ratio(people.engaged, audience)}%예요. 질문한 참여자는 ${ratio(people.questionAuthors, audience)}%, 핀·공감에 참여한 참여자는 ${ratio(people.reactorsOrPinAuthors, audience)}%예요.`
      : total ? `질문 ${total}건 중 ${percent(pins, total)}%가 슬라이드 위 핀이에요. ${slideCount}장 중 ${pinnedSlides}장에 핀이 찍혔어요.` : "아직 질문과 핀이 없어요.",
    flow: !flow ? "LIVE 기록이 없어 시간대별 흐름을 낼 수 없어요."
      : peak?.count && flow.buckets.length > 1 && flow.buckets.every((bucket) => bucket.count === peak.count) ? `강의 내내 ${flow.size}분마다 질문이 ${peak.count}건씩 고르게 들어왔어요.`
      : peak?.count ? `${peak.start}–${peak.end}분에 질문이 ${peak.count}건으로 가장 많았어요.` : "강의 시간 동안 들어온 질문이 없어요.",
    slides: top.length ? `${slideNames} 슬라이드에 질문의 ${percent(top.reduce((sum, row) => sum + row.questions, 0), total)}%가 몰렸어요.` : "아직 슬라이드에 달린 질문이 없어요.",
    questions: types?.[0]?.count ? `질문의 ${types[0].percent}%가 ‘${types[0].title}’ 유형이에요.`
      : byReactions[0] ? `공감이 가장 많은 질문은 ‘${clip(byReactions[0].text)}’(공감 ${byReactions[0].reactionCount})이에요.` : "아직 질문이 없어요.",
  };

  const pinsPerSlide = slideCount ? oneDecimal(pins / slideCount) : 0, none = "기록 없음";
  const person = (value: number | undefined) => value === undefined ? none : `${value}명`;
  const rows = {
    people: [["총 참여자", person(audience ?? undefined)], ["질문한 참여자", person(people?.questionAuthors)], ["공감·핀 참여자", person(people?.reactorsOrPinAuthors)]],
    questions: [["전체 질문", `${total}건`], ["1인당 평균 질문", !people ? none : people.questionAuthors ? `${oneDecimal(total / people.questionAuthors)}건` : "0건"],
      ["핀이 있는 질문", `${percent(pins, total)}%`]],
    reactions: [["공감 수", `${reactions}`], ["핀이 찍힌 슬라이드", `${pinnedSlides} / ${slideCount}`], ["슬라이드당 평균 핀", `${pinsPerSlide}개`]],
  } satisfies Record<string, [string, string][]>;
  const slideSummary = (slide: number) => analysis?.slides?.find((row) => row.page === slide + 1)?.summary || null;

  /** DSH-042: the chosen items as a report document; the server lays it out without AI. */
  const exportDocument = (parts: readonly ExportPart[]): ReportDocument => {
    const table = (head: string, items: [string, string][]) => [`| ${head} | 값 |`, "| --- | --- |", ...items.map(([label, value]) => `| ${label} | ${value} |`)];
    const lines: Record<ExportPart, string[]> = {
      summary: [summaries.banner],
      overview: [summaries.overview, "", ...table("참여 현황", rows.people), "", ...table("질문 현황", rows.questions), "", ...table("반응 현황", rows.reactions)],
      flow: [summaries.flow, ...flow ? ["", "| 구간 | 질문 수 |", "| --- | --- |", ...flow.buckets.map((bucket) => `| ${bucket.start}–${bucket.end}분 | ${bucket.count}건 |`)] : []],
      slides: [summaries.slides, ...perSlide.flatMap((row, slide) => !row.questions ? [] : ["",
        `**P.${slide + 1} ${session.slides[slide].title || `슬라이드 ${slide + 1}`}** · 핀 ${row.pins}개 · 질문 ${row.questions}건 · 공감 ${row.reactions}`,
        ...byReactions.filter((question) => question.slideIndex === slide).slice(0, 3).map((question) => `- ${question.text} (공감 ${question.reactionCount})`),
        ...slideSummary(slide) ? [`AI 요약: ${slideSummary(slide)}`] : []])],
      questions: [summaries.questions, "",
        ...types?.length ? ["| 질문 유형 | 질문 수 | 비율 |", "| --- | --- | --- |", ...types.map((type) => `| ${type.title} | ${type.count}건 | ${type.percent}% |`)] : [`질문 유형: ${typesNote}`],
        "", `**전체 질문 ${total}건** (공감순)`, ...byReactions.map((question) => `- P.${question.slideIndex + 1} · ${question.text} (공감 ${question.reactionCount})`)],
    };
    return {
      title: `${session.title} 분석`.slice(0, REPORT_LIMITS.title),
      metrics: reportMetrics({ slides: session.slides, questions: questions.map((question) => ({ anchor: isPin(question) ? question : null, reactions: question.reactionCount })) },
        { startedAt: session.startedAt, endedAt: record?.endedAt ?? null }, record, lectureDate(session)),
      sections: parts.flatMap((part) => exportSections(EXPORT_LABELS[part], lines[part], REPORT_LIMITS.sectionText).map((section, index) => ({ id: `${part}-${index}`, ...section }))),
    };
  };

  return {
    ...shared, session, slideCount, summaries, exportDocument, flow, perSlide, index, slide: session.slides[index],
    folderName: folders.find((folder) => folder.id === session.folderId)?.name ?? null,
    siblings: sessions.filter((item) => (item.folderId ?? "") === (session.folderId ?? "")).sort((a, b) => lectureDate(b).localeCompare(lectureDate(a))),
    date: lectureDate(session), minutes: span && record?.endedAt ? Math.round((span.end - span.start) / 60_000) : null, audience,
    /** DSH-031: title, donut label, one-line note, donut percent (null = no denominator), rows. */
    overview: [
      { title: "참여 현황", label: "참여율", value: audience && people ? ratio(people.engaged, audience) : null, rows: rows.people,
        note: audience && people ? `참여자 ${audience}명 중 ${Math.min(people.engaged, audience)}명이 질문하거나 반응했어요.` : "참여자 기록이 없어 참여율을 낼 수 없어요." },
      { title: "질문 현황", label: "질문한 참여자", value: audience && people ? ratio(people.questionAuthors, audience) : null, rows: rows.questions,
        note: audience && people ? `참여자 ${audience}명 중 ${Math.min(people.questionAuthors, audience)}명이 질문했어요.` : `질문 ${total}건 중 ${pins}건에 핀이 있어요.` },
      { title: "반응 현황", label: "핀이 찍힌 슬라이드", value: percent(pinnedSlides, slideCount), rows: rows.reactions, note: `${slideCount}장 중 ${pinnedSlides}장에 핀이 찍혔어요.` },
    ],
    slideQuestions: byReactions.filter((question) => question.slideIndex === index),
    slideSummary: slideSummary(index),
    select: setSelected, types, typesNote, total,
    list: { query, slideFilter, sort, page: current, slides: perSlide.flatMap((row, slide) => row.questions ? [slide] : []), pageCount, size: PAGE_SIZE, count: filtered.length, rows: filtered,
      setQuery: (value: string) => { setQuery(value); setPage(0); }, setSlideFilter: (value: string) => { setSlideFilter(value); setPage(0); },
      setSort: (value: "reactions" | "recent") => { setSort(value); setPage(0); }, setPage },
  };
}
