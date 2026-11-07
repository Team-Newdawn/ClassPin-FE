"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useParams } from "next/navigation";
import { reportRequest } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import { useLanguage } from "@/app/_controller/language-context";
import type { ClassSession } from "@/app/_model/types";
import type { AnalysisView } from "@/app/_service/material-analysis";
import { useBrowserPreferences } from "@/app/_controller/use-browser-preferences";
import { lectureSpan, rememberView } from "@/app/_model/insight-dashboard";
import { lectureDate, RECENT_ANALYSES, type RecentAnalyses } from "../controller";

/** docs/instructor-insight-dashboard.md DSH-021. */
type Insights = { record: { startedAt: string | null; endedAt: string | null; audience: number; peakAudience: number } | null };
/** DSH-033/034, RPT-125: the material's shared analysis as the dashboard reads it. */
type Analysis = AnalysisView | { error: "config" | "failed" | "notEnded" };
export type Section = "overview" | "flow" | "slides" | "questions";
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
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const lecture = sessions.find((item) => item.id === id), materialId = lecture?.materialId ?? null, questionCount = lecture?.questions.length ?? 0;
  // RPT-125: only ended lectures with questions are analyzed. One POST starts (or reuses) the shared analysis, then GET every 3 s
  // shows each part as it lands; after `ready` a few more polls pick up the dashboard-only English (DSH-044).
  const needAnalysis = questionCount > 0 && lecture?.status === "ended" && Boolean(materialId);
  useEffect(() => {
    if (!needAnalysis) return;
    const controller = new AbortController(), path = `/api/admin/materials/${encodeURIComponent(materialId!)}/analysis`;
    let timer: ReturnType<typeof setTimeout> | undefined, extra = 0;
    const show = (view: AnalysisView) => {
      setAnalysis(view);
      if (view.status === "running" || (view.status === "ready" && !view.en && extra++ < 30)) timer = setTimeout(() => void read("GET"), 3_000);
    };
    const read = (method: "GET" | "POST") => reportRequest(path, { method, signal: controller.signal }).then((response) => response.json()).then(show, (failure: Error & { code?: string }) => {
      if (!controller.signal.aborted) setAnalysis({ error: failure.code === "ANALYSIS_NOT_CONFIGURED" ? "config" : failure.code === "LECTURE_NOT_ENDED" ? "notEnded" : "failed" });
    });
    void read("POST");
    return () => { controller.abort(); clearTimeout(timer); };
  }, [materialId, needAnalysis, questionCount]);

  const session = sessions.find((item) => item.id === id);
  // DSH-052: opening a lecture's dashboard puts it at the top of "최근 분석" on the list.
  const [recent, saveRecent] = useBrowserPreferences<RecentAnalyses>(RECENT_ANALYSES);
  const remember = useEffectEvent(() => saveRecent({ viewed: rememberView(recent.viewed ?? {}, id, new Date().toISOString()) }));
  const found = Boolean(session);
  useEffect(() => { if (found) remember(); }, [id, found]);
  const error = !loadFailure ? "" : "missing" in loadFailure ? t("insight.lectureMissing") : loadFailure.text;
  const shared = { ready, error, loading: !data && !error, folders, sidebarOpen, toggleSidebar: () => setSidebarOpen((open) => !open) };
  if (!session) return { ...shared, session: null } as const;

  const questions = session.questions, slideCount = session.slides.length, record = data?.record ?? null;
  const total = questions.length;
  // DSH-034: topic groups stand in for question types; counts keep only questions that still exist.
  const known = new Set(questions.map((question) => question.id));
  const view = analysis && "status" in analysis ? analysis : null, topics = view?.groups ?? null, en = locale === "en" ? view?.en : null;
  const types = topics?.map((topic, n) => ({ key: topic.title, title: en?.groups[n]?.title || topic.title, summary: en?.groups[n]?.summary || topic.summary, questionIds: topic.questionIds.filter((questionId) => known.has(questionId)) }))
    .map((topic) => ({ ...topic, count: topic.questionIds.length })).filter((type) => type.count).sort((a, b) => b.count - a.count).map((type) => ({ ...type, percent: percent(type.count, total) })) ?? null;
  const ended = session.status === "ended" && !(analysis && "error" in analysis && analysis.error === "notEnded");
  const failed = analysis && "error" in analysis && analysis.error !== "notEnded" ? analysis.error : view?.status === "failed" ? "failed" : null;
  const typesNote = t(!total ? "insight.typesNone" : !ended ? "insight.analysisAfterEnd" : error ? "insight.typesLoadFailed" : failed === "config" ? "insight.typesNoConfig" : failed ? "insight.typesFailed" : "insight.analyzing");
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

  const slideSummary = (slide: number) => { const slideId = session.slides[slide].id;
    return en?.slides.find((item) => item.slideId === slideId)?.summary || view?.slides?.find((item) => item.slideId === slideId)?.summary || null; };
  // DSH-046: the one AI call for types and slide analysis is still running (up to ~45 s for 100 questions); the page shows skeletons.
  // Grouping is text-only and lands first; the slide analysis follows (DSH-034/046).
  const pending = Boolean(total) && ended && !error && !failed, typesPending = pending && !topics, slidesPending = pending && !view?.slides;
  const slideNote = t(!ended ? "insight.analysisAfterEnd" : failed === "config" ? "insight.analysisNoConfig" : failed ? "insight.analysisFailed" : "insight.analysisNone");
  return {
    ...shared, session, slideCount, summaries, perSlide, index, slide: session.slides[index],
    folderName: folders.find((folder) => folder.id === session.folderId)?.name ?? null,
    siblings: sessions.filter((item) => (item.folderId ?? "") === (session.folderId ?? "")).sort((a, b) => lectureDate(b).localeCompare(lectureDate(a))),
    date, minutes, board,
    slidePins: byReactions.filter((question) => question.slideIndex === index && isPin(question)),
    slideSummary: slideSummary(index), slideNote, typesPending, slidesPending,
    select: setSelected, types, typesNote, total,
    detail, pick: setPicked,
  };
}
