"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { useLanguage } from "@/components/language-context";
import { ArrowRight, BarChart3, Clock3, MessageCircleQuestion, Plus } from "@/components/icons";
import { useSessions } from "@/components/session-store";
import { StatusBadge } from "@/components/status-badge";
import { allQuestions, countBy, heatLevel, recentQuestions, resolveRate, slideHeatmap } from "@/lib/stats";

export default function DashboardPage() {
  const { t, categoryLabel, timeAgo } = useLanguage();
  const router = useRouter();
  const { sessions, ready } = useSessions();
  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  const questions = allQuestions(sessions);
  const unanswered = countBy(questions, "unanswered");
  const liveSessions = sessions.filter((session) => session.status === "live");
  const hotspots = slideHeatmap(sessions).slice(0, 5);
  const maxHeat = hotspots[0]?.count ?? 0;
  const feed = recentQuestions(sessions, 6);

  return (
    <AdminShell>
      <div className="admin-page">
        <div className="page-head">
          <div><h1>{t("nav.dashboard")}</h1><p>{t("dashboard.description")}</p></div>
          <div className="page-actions"><Link className="btn secondary" href="/admin/insights"><BarChart3 />{t("dashboard.openInsights")}</Link><button className="btn primary" onClick={() => router.push("/")}><Plus />{t("dashboard.startLecture")}</button></div>
        </div>

        <div className="kpi-grid">
          <KpiCard label={t("dashboard.totalLectures")} value={sessions.length} hint={t("dashboard.liveLectures", { count: liveSessions.length })} />
          <KpiCard label={t("dashboard.totalQuestions")} value={questions.length} hint={t("dashboard.pinQuestions", { count: questions.filter((q) => q.x !== null).length })} />
          <KpiCard label={t("dashboard.unanswered")} value={unanswered} hint={questions.length ? t("dashboard.percentTotal", { percent: Math.round((unanswered / questions.length) * 100) }) : t("dashboard.noQuestions")} tone={unanswered > 0 ? "warning" : undefined} />
          <KpiCard label={t("dashboard.resolveRate")} value={`${resolveRate(questions)}%`} hint={t("common.resolvedCount", { count: countBy(questions, "resolved") })} tone="success" />
        </div>

        <div className="section-grid">
          <section className="panel">
            <div className="panel-head"><div><h2>{t("dashboard.lectureStatus")}</h2><p>{t("dashboard.lectureStatusHint")}</p></div><Link className="panel-link" href="/admin/materials">{t("dashboard.viewAll")}<ArrowRight /></Link></div>
            {sessions.length ? (
              <ul className="session-list">
                {sessions.slice(0, 5).map((session) => {
                  const open = countBy(session.questions, "unanswered");
                  return (
                    <li key={session.id}>
                      <Link className="session-row" href={`/admin/session/${session.id}`}>
                        <span className="session-row-main"><b>{session.title}</b><small>{t("common.slidesCount", { count: session.slides.length })} · {t("dashboard.code", { code: session.code })}</small></span>
                        <span className={`live-badge ${session.status}`}><i />{session.status === "live" ? t("common.live") : t("common.ended")}</span>
                        <span className="session-row-stat"><b>{session.questions.length}</b>{t("common.question")}</span>
                        <span className={`session-row-stat ${open ? "alert" : ""}`}><b>{open}</b>{t("status.unanswered")}</span>
                        <ArrowRight />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyBlock message={t("dashboard.noLectures")} hint={t("dashboard.noLecturesHint")} />}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h2>{t("dashboard.recentQuestions")}</h2><p>{t("dashboard.recentQuestionsHint")}</p></div></div>
            {feed.length ? (
              <ul className="feed-list">
                {feed.map(({ question, session }) => (
                  <li key={question.id}>
                    <Link className="feed-item" href={`/admin/session/${session.id}?tab=questions`}>
                      <span className="feed-top"><em className={`category ${question.category}`}>{categoryLabel(question.category)}</em><span className="feed-time"><Clock3 />{timeAgo(question.createdAt)}</span></span>
                      <p>{question.text}</p>
                      <span className="feed-bottom"><StatusBadge status={question.status} /><small>{session.title} · {t("common.page", { number: question.slideIndex + 1 })}</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyBlock message={t("dashboard.noRecentQuestions")} hint={t("dashboard.noRecentQuestionsHint")} />}
          </section>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>{t("dashboard.hotSlides")}</h2><p>{t("dashboard.hotSlidesHint")}</p></div><Link className="panel-link" href="/admin/insights">{t("nav.insights")}<ArrowRight /></Link></div>
          {hotspots.length ? (
            <ul className="heat-list">
              {hotspots.map((item) => (
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
          ) : <EmptyBlock message={t("dashboard.noAggregate")} hint={t("dashboard.noAggregateHint")} />}
        </section>
      </div>
    </AdminShell>
  );
}

function KpiCard({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone?: "warning" | "success" }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className={`kpi-value ${tone ?? ""}`}>{value}</b><small>{hint}</small></div>;
}

function EmptyBlock({ message, hint }: { message: string; hint: string }) {
  return <div className="panel-empty"><MessageCircleQuestion /><b>{message}</b><span>{hint}</span></div>;
}
