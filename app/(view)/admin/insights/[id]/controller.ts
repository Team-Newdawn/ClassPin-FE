"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { reportRequest } from "@/app/_controller/use-report";
import { useSessions } from "@/app/_controller/session-store";
import { audienceSeries, keywords, lectureSpan, pinsPerMinute, slideIntervals, slideStats, slideTimeline } from "@/app/_model/insight-dashboard";
import { metricRows, reportMetrics } from "@/app/_model/report";

type Mark = { at: string; slide: number };
/** docs/instructor-insight-dashboard.md DSH-021. */
type Insights = {
  record: { startedAt: string | null; endedAt: string | null; audience: number; peakAudience: number; samples: (Mark & { audience: number })[]; slideChanges: Mark[] } | null;
  topics: { title: string; summary: string; questionIds: string[] }[] | null;
  reportId: string | null;
};
const MINUTE = 60_000;

export function useInsightsController() {
  const { id } = useParams<{ id: string }>();
  const { sessions, folders, ready } = useSessions();
  const [data, setData] = useState<Insights | null>(null), [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    reportRequest(`/api/admin/lectures/${encodeURIComponent(id)}/insights`, { signal: controller.signal }).then((response) => response.json())
      .then(setData, (failure: Error & { status?: number }) => {
        if (!controller.signal.aborted) setError(failure.status === 404 ? "이 강의의 기록을 찾을 수 없습니다." : failure.message);
      });
    return () => controller.abort();
  }, [id]);

  const session = sessions.find((item) => item.id === id);
  const shared = { ready, error, loading: !data && !error, folders, sidebarOpen, toggleSidebar: () => setSidebarOpen((open) => !open), reportId: data?.reportId ?? null };
  if (!session) return { ...shared, session: null } as const;

  // DSH-022: questions, slides and startedAt come from the store; the record supplies the end time and timeline.
  const questions = session.questions, record = data?.record ?? null, samples = record?.samples ?? [];
  const span = lectureSpan(session.startedAt, record?.endedAt ?? null, questions);
  const intervals = span ? slideIntervals(record?.slideChanges ?? [], samples, span) : [];
  const pins = span ? pinsPerMinute(questions, span) : [];
  const stats = slideStats(session.slides.length, questions, intervals, span ?? undefined);
  const metrics = metricRows(reportMetrics(
    { slides: session.slides, questions: questions.map((question) => ({ anchor: question.x !== null && question.y !== null ? question : null, reactions: question.reactionCount })) },
    { startedAt: session.startedAt, endedAt: span && span.end > span.start ? new Date(span.end).toISOString() : null }, record));
  const busiest = stats.reduce((best, row) => row.pins > best.pins ? row : best, stats[0]);
  const index = selected ?? (busiest ? busiest.slide - 1 : 0), slide = session.slides[index];
  const known = new Set(questions.map((question) => question.id));

  return {
    ...shared, session, span, stats, metrics, intervals, index, slide,
    pins: pins.map(({ minute, pins: value }) => ({ minute, value })),
    hasPins: pins.some((row) => row.pins > 0),
    audience: span ? audienceSeries(samples, span).map(({ minute, audience }) => ({ minute, value: audience })) : [],
    bands: span ? intervals.map((interval) => ({ slide: interval.slide, start: (interval.start - span.start) / MINUTE, end: (interval.end - span.start) / MINUTE })) : [],
    timeline: span && slide ? slideTimeline(index + 1, intervals, samples, questions, span) : [],
    slideQuestions: questions.filter((question) => question.slideIndex === index).sort((a, b) => b.reactionCount - a.reactionCount),
    topics: data?.topics?.map((topic) => ({ ...topic, count: topic.questionIds.filter((questionId) => known.has(questionId)).length })) ?? null,
    keywords: keywords(questions.map((question) => question.text), 60).map(({ word, count }) => ({ label: word, value: count })),
    select: setSelected,
  };
}
