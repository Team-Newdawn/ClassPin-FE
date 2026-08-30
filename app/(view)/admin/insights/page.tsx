"use client";

import Link from "next/link";
import { AdminShell } from "@/app/component/admin-shell";
import { LoadingScreen } from "@/app/component/loading-screen";
import { ArrowRight, MessageCircleQuestion, Sparkles } from "@/app/component/icons";
import { StatusBadge } from "@/app/component/status-badge";
import { heatLevel } from "@/app/_model/stats";
import { questionCategoryClass, questionMarkerEmoji } from "@/app/_model/types";
import { useInsightsController } from "./controller";
import styles from "./page.module.css";

export default function InsightsPage() {
  const {
    t, timeAgo, ready, scope, setScope, scopeOptions, questions, settingsFor, categoryLabel,
    unanswered, hotspots, maxHeat, categories, maxCategory, improvementCandidates,
    openQuestions, pinRate, resolveRate, resolved
  } = useInsightsController();
  if (!ready) return <LoadingScreen />;

  return (
    <AdminShell>
      <div className={`${styles.root} admin-page`}>
        <div className="page-head">
          <div><h1>{t("nav.insights")}</h1><p>{t("insights.description")}</p></div>
          <div className="filter-tabs scope-tabs">
            <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>{t("common.all")}</button>
            {scopeOptions.map((session) => <button key={session.id} className={scope === session.id ? "active" : ""} onClick={() => setScope(session.id)}>{session.title}</button>)}
          </div>
        </div>

        <div className="kpi-grid">
          <Kpi label={t("insights.aggregatedQuestions")} value={questions.length} hint={t("insights.fromSlides", { count: hotspots.length })} />
          <Kpi label={t("dashboard.unanswered")} value={unanswered} hint={questions.length ? t("dashboard.percentTotal", { percent: Math.round((unanswered / questions.length) * 100) }) : t("dashboard.noQuestions")} tone={unanswered > 0 ? "warning" : undefined} />
          <Kpi label={t("insights.pinRate")} value={`${pinRate}%`} hint={t("insights.pinRateHint")} />
          <Kpi label={t("dashboard.resolveRate")} value={`${resolveRate}%`} hint={t("common.resolvedCount", { count: resolved })} tone="success" />
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
                    <span className="cat-head"><em className={`category ${questionCategoryClass(settingsFor(item.key), item.key)}`}>{item.label}</em><b>{item.count}</b></span>
                    <span className="cat-track"><i className={`cat-fill ${questionCategoryClass(settingsFor(item.key), item.key)}`} style={{ width: `${maxCategory ? (item.count / maxCategory) * 100 : 0}%` }} /></span>
                  </li>
                ))}
              </ul>
            ) : <Empty message={t("insights.noCategories")} hint={t("insights.noCategoriesHint")} />}
          </section>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>{t("insights.improvementCandidates")}</h2><p>{t("insights.improvementRule")}</p></div><span className="panel-note"><Sparkles />{t("insights.traceable")}</span></div>
          {improvementCandidates.length ? (
            <ul className="improve-list">
              {improvementCandidates.map((item) => (
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
                  <span><em className={`category ${questionCategoryClass(session.questionCategories, question.category)}`}>{questionMarkerEmoji(question.marker) && <i aria-hidden="true">{questionMarkerEmoji(question.marker)}</i>}{categoryLabel(question.category)}</em></span>
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
