"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { useLanguage } from "@/components/language-context";
import { ArrowRight, MessageCircleQuestion, Sparkles } from "@/components/icons";
import { useSessions } from "@/components/session-store";
import { StatusBadge } from "@/components/status-badge";
import { categoryBreakdown, countBy, heatLevel, pinRate, resolveRate, slideHeatmap } from "@/lib/stats";

export default function InsightsPage() {
  const { t, categoryLabel, timeAgo } = useLanguage();
  const { sessions, ready } = useSessions();
  const [scope, setScope] = useState<string>("all");
  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  const scoped = scope === "all" ? sessions : sessions.filter((session) => session.id === scope);
  const questions = scoped.flatMap((session) => session.questions);
  const unanswered = countBy(questions, "unanswered");
  const hotspots = slideHeatmap(scoped);
  const maxHeat = hotspots[0]?.count ?? 0;
  const categories = categoryBreakdown(questions, categoryLabel);
  const maxCategory = categories[0]?.count ?? 0;
  const openQuestions = scoped
    .flatMap((session) => session.questions.filter((q) => q.status === "unanswered").map((question) => ({ question, session })))
    .sort((a, b) => new Date(b.question.createdAt).getTime() - new Date(a.question.createdAt).getTime());

  return (
    <AdminShell>
      <div className="admin-page">
        <div className="page-head">
          <div><h1>{t("nav.insights")}</h1><p>{t("insights.description")}</p></div>
          <div className="filter-tabs scope-tabs">
            <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>{t("common.all")}</button>
            {sessions.slice(0, 4).map((session) => <button key={session.id} className={scope === session.id ? "active" : ""} onClick={() => setScope(session.id)}>{session.title}</button>)}
          </div>
        </div>

        <div className="kpi-grid">
          <Kpi label={t("insights.aggregatedQuestions")} value={questions.length} hint={t("insights.fromSlides", { count: hotspots.length })} />
          <Kpi label={t("dashboard.unanswered")} value={unanswered} hint={questions.length ? t("dashboard.percentTotal", { percent: Math.round((unanswered / questions.length) * 100) }) : t("dashboard.noQuestions")} tone={unanswered > 0 ? "warning" : undefined} />
          <Kpi label={t("insights.pinRate")} value={`${pinRate(questions)}%`} hint={t("insights.pinRateHint")} />
          <Kpi label={t("dashboard.resolveRate")} value={`${resolveRate(questions)}%`} hint={t("common.resolvedCount", { count: countBy(questions, "resolved") })} tone="success" />
        </div>

        <div className="section-grid">
          <section className="panel">
            <div className="panel-head"><div><h2>{t("insights.hotspots")}</h2><p>{t("insights.hotspotsHint")}</p></div><span className="heat-legend"><i className="heat-fill low" />{t("insights.low")}<i className="heat-fill mid" />{t("insights.mid")}<i className="heat-fill high" />{t("insights.high")}<i className="heat-fill critical" />{t("insights.critical")}</span></div>
            {hotspots.length ? (
              <ul className="heat-list">
                {hotspots.slice(0, 8).map((item) => (
                  <li key={`${item.sessionId}-${item.slideIndex}`}>
                    <Link className="heat-row" href={`/admin/session/${item.sessionId}?slide=${item.slideIndex}`}>
                      <span className="heat-slide">{t("common.page", { number: item.slideIndex + 1 })}</span>
                      <span className="heat-title"><b>{item.title}</b><small>{item.sessionTitle}</small></span>
                      <span className="heat-track"><i className={`heat-fill ${heatLevel(item.count, maxHeat)}`} style={{ width: `${maxHeat ? (item.count / maxHeat) * 100 : 0}%` }} /></span>
                      <span className="heat-count">{t("common.cases", { count: item.count })}{item.unanswered > 0 && <em>{t("common.unansweredCount", { count: item.unanswered })}</em>}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty message={t("dashboard.noAggregate")} hint={t("insights.noDensityHint")} />}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h2>{t("insights.questionTypes")}</h2><p>{t("insights.categoryDistribution")}</p></div></div>
            {categories.length ? (
              <ul className="cat-list">
                {categories.map((item) => (
                  <li key={item.key}>
                    <span className="cat-head"><em className={`category ${item.key}`}>{item.label}</em><b>{item.count}</b></span>
                    <span className="cat-track"><i className={`cat-fill ${item.key}`} style={{ width: `${maxCategory ? (item.count / maxCategory) * 100 : 0}%` }} /></span>
                  </li>
                ))}
              </ul>
            ) : <Empty message={t("insights.noCategories")} hint={t("insights.noCategoriesHint")} />}
          </section>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>{t("insights.improvementCandidates")}</h2><p>{t("insights.improvementRule")}</p></div><span className="panel-note"><Sparkles />{t("insights.traceable")}</span></div>
          {hotspots.filter((item) => item.count >= 2).length ? (
            <ul className="improve-list">
              {hotspots.filter((item) => item.count >= 2).slice(0, 4).map((item) => (
                <li key={`${item.sessionId}-${item.slideIndex}`} className="improve-card">
                  <span className="improve-slide">{item.sessionTitle} · {t("common.page", { number: item.slideIndex + 1 })}</span>
                  <b>{item.title}</b>
                  <p>{t("insights.improvementText", { count: item.count })}</p>
                  <Link className="panel-link" href={`/admin/session/${item.sessionId}?tab=questions`}>{t("insights.viewEvidence")}<ArrowRight /></Link>
                </li>
              ))}
            </ul>
          ) : <Empty message={t("insights.noCandidates")} hint={t("insights.noCandidatesHint")} />}
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>{t("insights.openQuestions")}</h2><p>{t("insights.waitingAnswers", { count: openQuestions.length })}</p></div></div>
          {openQuestions.length ? (
            <div className="question-table flat">
              <div className="table-head"><span>{t("common.slide")}</span><span>{t("common.question")}</span><span>{t("common.category")}</span><span>{t("common.status")}</span><span>{t("common.createdAt")}</span><span /></div>
              {openQuestions.slice(0, 8).map(({ question, session }) => (
                <Link className="table-row" key={question.id} href={`/admin/session/${session.id}?tab=questions`}>
                  <span className="slide-cell"><b>{question.slideIndex + 1}</b><small>{session.title}</small></span>
                  <span className="question-text">{question.text}</span>
                  <span><em className={`category ${question.category}`}>{categoryLabel(question.category)}</em></span>
                  <span><StatusBadge status={question.status} /></span>
                  <span className="muted">{timeAgo(question.createdAt)}</span>
                  <span><ArrowRight /></span>
                </Link>
              ))}
            </div>
          ) : <Empty message={t("insights.noOpenQuestions")} hint={t("insights.allAnswered")} />}
        </section>
      </div>
    </AdminShell>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone?: "warning" | "success" }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className={`kpi-value ${tone ?? ""}`}>{value}</b><small>{hint}</small></div>;
}

function Empty({ message, hint }: { message: string; hint: string }) {
  return <div className="panel-empty"><MessageCircleQuestion /><b>{message}</b><span>{hint}</span></div>;
}
