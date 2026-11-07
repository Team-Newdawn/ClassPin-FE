"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useParams } from "next/navigation";
import { reportRequest } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import { useLanguage } from "@/app/_controller/language-context";
import type { TranslationKey } from "@/app/_model/i18n";
import type { ClassSession } from "@/app/_model/types";
import { useBrowserPreferences } from "@/app/_controller/use-browser-preferences";
import { exportSections, lectureSpan, rememberView } from "@/app/_model/insight-dashboard";
import { REPORT_LIMITS, reportMetrics, type ReportDocument } from "@/app/_model/report";
import { lectureDate, RECENT_ANALYSES, type RecentAnalyses } from "../controller";

/** docs/instructor-insight-dashboard.md DSH-021. */
type Insights = { record: { startedAt: string | null; endedAt: string | null; audience: number; peakAudience: number } | null };
/** DSH-033/034: the dashboard\'s own AI result, independent of reports. */
type Grouped = { groups: { title: string; summary: string; questionIds: string[]; en?: { title: string; summary: string } }[]; slides: { slideId: string; summary: string; en?: string }[] };
export type Section = "overview" | "flow" | "slides" | "questions";
/** DSH-042: export items in document order. */
export const EXPORT_PARTS = ["overview", "flow", "slides", "questions"] as const;
export type ExportPart = typeof EXPORT_PARTS[number];
export const EXPORT_LABELS = { overview: "insight.part.overview", flow: "insight.part.flow", slides: "insight.part.slides", questions: "insight.part.questions" } as const satisfies Record<ExportPart, TranslationKey>;
const isPin = (question: { x: number | null; y: number | null }) => question.x !== null && question.y !== null;
const percent = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;
const clip = (text: string) => text.length > 40 ? `${text.slice(0, 40)}…` : text;

type Translate = ReturnType<typeof useLanguage>["t"];
type LectureRecord = NonNullable<Insights["record"]>;

/** DSH-021: the lecture record (end time, audience); a 404 is reported as missing. */
export function useLectureRecord(id: string) {
  const [data, setData] = useState<Insights | null>(null), [loadFailure, setLoadFailure] = useState<{ missing: true } | { text: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    reportRequest(`/api/admin/lectures/${encodeURIComponent(id)}/insights`, { signal: controller.signal }).then((response) => response.json())
      .then(setData, (failure: Error & { status?: number }) => {
        if (!controller.signal.aborted) setLoadFailure(failure.status === 404 ? { missing: true } : { text: failure.message });
      });
    return () => controller.abort();
  }, [id]);
  return { data, loadFailure };
}

/** DSH-030/031: PIN questions per slide, the scoreboard and the lecture length, shared with the end report. `topTopic` is the largest AI question type. */
export function lectureOverview(session: ClassSession, record: LectureRecord | null, t: Translate, topTopic: { title: string; count: number } | null) {
  const questions = session.questions, slideCount = session.slides.length;
  const perSlide = session.slides.map((_, index) => {
    const on = questions.filter((question) => question.slideIndex === index);
    return { questions: on.length, pins: on.filter(isPin).length };
  });
  const pins = questions.filter(isPin).length, reactions = questions.reduce((sum, question) => sum + question.reactionCount, 0);
  const pinnedSlides = perSlide.filter((row) => row.pins > 0).length;
  const ranked = perSlide.map((row, index) => ({ ...row, index })).filter((row) => row.questions > 0).sort((a, b) => b.questions - a.questions);
  const byReactions = [...questions].sort((a, b) => b.reactionCount - a.reactionCount);
  const topQuestion = byReactions[0], cases = (count: number) => t("common.cases", { count });
  const board: [string, string, string][] = [
    [t("insight.board.questions"), t("insight.boardTotal", { count: questions.length }), t("insight.empathy", { count: reactions })],
    [t("insight.board.topSlide"), ranked[0] ? `P.${ranked[0].index + 1}` : t("insight.none"), ranked[0] ? cases(ranked[0].questions) : ""],
    [t("insight.board.pinnedSlides"), `${pinnedSlides} / ${slideCount}`, t("insight.pins", { count: pins })],
    topTopic ? [t("insight.board.topTopic"), topTopic.title, cases(topTopic.count)]
      : topQuestion ? [t("insight.board.topQuestion"), clip(topQuestion.text), t("insight.empathy", { count: topQuestion.reactionCount })] : [t("insight.board.topTopic"), t("insight.none"), ""],
  ];
  const span = lectureSpan(session.startedAt, record?.endedAt ?? null, questions);
  return { perSlide, ranked, byReactions, board, date: lectureDate(session), minutes: span && record?.endedAt ? Math.round((span.end - span.start) / 60_000) : null };
}

export function useInsightsController() {
  const { id } = useParams<{ id: string }>();
  const { sessions, folders, ready } = useSessions();
  const { t, locale } = useLanguage();
  const { data, loadFailure } = useLectureRecord(id);
  const [sidebarOpen, setSidebarOpen] = useState(true), [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [exporting, setExporting] = useState<{ all: boolean; parts: ExportPart[] } | null>(null);
  const [grouped, setGrouped] = useState<Grouped | { error: "config" | "failed" } | null>(null);
  const live = sessions.find((item) => item.id === id)?.questions, questionCount = live?.length ?? 0;
  // DSH-033/034: the server groups the questions once (and again only when they change).
  const needGroups = questionCount > 0;
  useEffect(() => {
    if (!needGroups) return;
    const controller = new AbortController();
    reportRequest(`/api/admin/lectures/${encodeURIComponent(id)}/question-groups`, { method: "POST", signal: controller.signal }).then((response) => response.json())
      .then((body: Grouped) => setGrouped(body), (failure: Error & { code?: string }) => {
        if (!controller.signal.aborted) setGrouped({ error: failure.code === "ANALYSIS_NOT_CONFIGURED" ? "config" : "failed" });
      });
    return () => controller.abort();
  }, [id, needGroups, questionCount]);

  const session = sessions.find((item) => item.id === id);
  // DSH-052: opening a lecture's dashboard puts it at the top of "최근 분석" on the list.
  const [recent, saveRecent] = useBrowserPreferences<RecentAnalyses>(RECENT_ANALYSES);
  const remember = useEffectEvent(() => saveRecent({ viewed: rememberView(recent.viewed ?? {}, id, new Date().toISOString()) }));
  const found = Boolean(session);
  useEffect(() => { if (found) remember(); }, [id, found]);
  const error = !loadFailure ? "" : "missing" in loadFailure ? t("insight.lectureMissing") : loadFailure.text;
  const shared = { ready, error, loading: !data && !error, folders, sidebarOpen, toggleSidebar: () => setSidebarOpen((open) => !open),
    /** DSH-042: a section's button starts with that item, "전체 내보내기" with all of them; the instructor can change both. */
    exporting, openExport: (part?: Section) => setExporting({ all: !part, parts: part ? [part] : [...EXPORT_PARTS] }), closeExport: () => setExporting(null),
    toggleExport: (part: ExportPart) => setExporting((current) => current && { ...current,
      parts: current.parts.includes(part) ? current.parts.filter((item) => item !== part) : EXPORT_PARTS.filter((item) => item === part || current.parts.includes(item)) }) };
  if (!session) return { ...shared, session: null } as const;

  const questions = session.questions, slideCount = session.slides.length, record = data?.record ?? null;
  const total = questions.length;
  // DSH-034: topic groups stand in for question types; counts keep only questions that still exist.
  const known = new Set(questions.map((question) => question.id));
  const result = grouped && "groups" in grouped ? grouped : null, topics = result?.groups ?? null;
  const types = topics?.map((topic) => ({ key: topic.title, ...locale === "en" && topic.en ? topic.en : topic, questionIds: topic.questionIds.filter((questionId) => known.has(questionId)) }))
    .map((topic) => ({ ...topic, count: topic.questionIds.length })).filter((type) => type.count).sort((a, b) => b.count - a.count).map((type) => ({ ...type, percent: percent(type.count, total) })) ?? null;
  const failed = grouped && "error" in grouped ? grouped.error : null;
  const typesNote = t(!total ? "insight.typesNone" : error ? "insight.typesLoadFailed" : failed === "config" ? "insight.typesNoConfig" : failed ? "insight.typesFailed" : "insight.analyzing");
  const { perSlide, ranked, byReactions, board, date, minutes } = lectureOverview(session, record, t, types?.[0] ?? null);
  // DSH-030: the first slide with the most PIN questions; null while no slide has one.
  const peakPins = perSlide.reduce<typeof perSlide[number] | null>((best, row) => row.pins > (best?.pins ?? 0) ? row : best, null);
  const index = Math.min(selected ?? ranked[0]?.index ?? 0, Math.max(0, slideCount - 1));
  // DSH-035: one type in detail (the largest until another is picked): its AI summary, the slides it spans, all its questions.
  const typeDetail = (type: NonNullable<typeof types>[number]) => {
    const own = byReactions.filter((question) => type.questionIds.includes(question.id));
    const slides = [...new Set(own.map((question) => question.slideIndex))].sort((a, b) => a - b)
      .map((slide) => `P.${slide + 1} (${own.filter((question) => question.slideIndex === slide).length})`).join(" · ");
    return { ...type, slides, questions: own };
  };
  const picks = types?.map(typeDetail) ?? [], detail = picks.find((type) => type.key === picked) ?? picks[0] ?? null;

  // DSH-032: summaries are written from the numbers, not by AI.
  const summaries = {
    flow: peakPins ? t("insight.flowSummary", { slide: perSlide.indexOf(peakPins) + 1, count: peakPins.pins }) : t("insight.flowNone"),
    questions: types?.[0]?.count ? t("insight.topTypeSummary", { percent: types[0].percent, title: types[0].title })
      : byReactions[0] ? t("insight.topQuestionSummary", { text: clip(byReactions[0].text), count: byReactions[0].reactionCount }) : t("insight.noQuestions"),
  };

  const cases = (count: number) => t("common.cases", { count });
  const slideSummary = (slide: number) => { const row = result?.slides.find((item) => item.slideId === session.slides[slide].id); return (locale === "en" && row?.en) || row?.summary || null; };
  // DSH-046: the one AI call for types and slide analysis is still running (up to ~45 s for 100 questions); the page shows skeletons.
  const analyzing = Boolean(total) && !error && !grouped;
  const slideNote = t(failed === "config" ? "insight.analysisNoConfig" : failed ? "insight.analysisFailed" : "insight.analysisNone");

  /** DSH-042: the chosen items as a report document; the server lays it out without AI. */
  const exportDocument = (parts: readonly ExportPart[]): ReportDocument => {
    const table = (head: string, items: [string, string][]) => [`| ${head} | ${t("insight.table.value")} |`, "| --- | --- |", ...items.map(([label, value]) => `| ${label} | ${value} |`)];
    const pinned = perSlide.flatMap((row, slide) => !row.pins ? [] : ["",
      `**P.${slide + 1} ${session.slides[slide].title || t("common.slideNumber", { number: slide + 1 })}**`, ...slideSummary(slide) ? [`${t("insight.aiSummary")}: ${slideSummary(slide)}`] : [],
      ...byReactions.filter((question) => question.slideIndex === slide && isPin(question)).map((question) => `- ${question.text} (${t("insight.empathy", { count: question.reactionCount })})`)]).slice(1);
    const lines: Record<ExportPart, string[]> = {
      overview: table(t("insight.table.item"), board.map(([label, value, note]) => [label, [value, note].filter(Boolean).join(" · ")])),
      // RPT-037: the graph parts carry no sentence in the file.
      flow: [],
      // Each slide block starts with a blank line; the first one is dropped.
      slides: pinned.length ? pinned : [t("insight.pinsNone")],
      questions: [...types?.length ? [] : [t("insight.typesLine", { note: typesNote })],
        ...picks.flatMap((type) => ["", `**${type.title}** · ${cases(type.count)}`, ...type.summary ? [`${t("insight.aiSummary")}: ${type.summary}`] : [], t("insight.typeSlides", { slides: type.slides }),
          ...type.questions.slice(0, 3).map((question) => `- ${question.text} (${t("insight.empathy", { count: question.reactionCount })})`)])],
    };
    return {
      title: t("insight.documentTitle", { title: session.title }).slice(0, REPORT_LIMITS.title),
      metrics: reportMetrics({ slides: session.slides, questions: questions.map((question) => ({ anchor: isPin(question) ? question : null, reactions: question.reactionCount })) },
        { startedAt: session.startedAt, endedAt: record?.endedAt ?? null }, record, date),
      // RPT-037: the first chunk of the flow and question parts carries their graph (no table).
      sections: parts.flatMap((part) => exportSections(t(EXPORT_LABELS[part]), lines[part], REPORT_LIMITS.sectionText).map((section, index) => ({ id: `${part}-${index}`, ...section,
        ...!index && part === "flow" ? { chart: { kind: "line" as const, points: perSlide.map((row, slide) => ({ label: `P.${slide + 1}`, value: row.pins })) } }
          : !index && part === "questions" && types?.length ? { chart: { kind: "bar" as const, points: types.map((type) => ({ label: type.title, value: type.count })) } } : {} }))),
    };
  };

  return {
    ...shared, session, slideCount, summaries, exportDocument, perSlide, index, slide: session.slides[index],
    folderName: folders.find((folder) => folder.id === session.folderId)?.name ?? null,
    siblings: sessions.filter((item) => (item.folderId ?? "") === (session.folderId ?? "")).sort((a, b) => lectureDate(b).localeCompare(lectureDate(a))),
    date, minutes, board,
    slidePins: byReactions.filter((question) => question.slideIndex === index && isPin(question)),
    slideSummary: slideSummary(index), slideNote, analyzing,
    select: setSelected, types, typesNote, total,
    detail, pick: setPicked,
  };
}
