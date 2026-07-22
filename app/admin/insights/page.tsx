"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminShell, AdminTopbar } from "@/components/admin-shell";
import { ArrowRight, MessageCircleQuestion, Sparkles } from "@/components/icons";
import { useSessions } from "@/components/session-store";
import { StatusBadge } from "@/components/status-badge";
import { categoryLabel, timeAgo } from "@/lib/format";
import { categoryBreakdown, countBy, heatLevel, pinRate, resolveRate, slideHeatmap } from "@/lib/stats";

export default function InsightsPage() {
  const { sessions, ready } = useSessions();
  const [scope, setScope] = useState<string>("all");
  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;

  const scoped = scope === "all" ? sessions : sessions.filter((session) => session.id === scope);
  const questions = scoped.flatMap((session) => session.questions);
  const unanswered = countBy(questions, "unanswered");
  const hotspots = slideHeatmap(scoped);
  const maxHeat = hotspots[0]?.count ?? 0;
  const categories = categoryBreakdown(questions);
  const maxCategory = categories[0]?.count ?? 0;
  const openQuestions = scoped
    .flatMap((session) => session.questions.filter((q) => q.status === "unanswered").map((question) => ({ question, session })))
    .sort((a, b) => new Date(b.question.createdAt).getTime() - new Date(a.question.createdAt).getTime());

  return (
    <AdminShell>
      <AdminTopbar title="인사이트" caption={scope === "all" ? "전체 강의" : scoped[0]?.title} />
      <div className="admin-page">
        <div className="page-head">
          <div><h1>인사이트</h1><p>질문이 몰린 위치와 유형을 집계해 다음 회차에 무엇을 바꿀지 찾습니다.</p></div>
          <div className="filter-tabs scope-tabs">
            <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>전체</button>
            {sessions.slice(0, 4).map((session) => <button key={session.id} className={scope === session.id ? "active" : ""} onClick={() => setScope(session.id)}>{session.title}</button>)}
          </div>
        </div>

        <div className="kpi-grid">
          <Kpi label="집계 질문" value={questions.length} hint={`슬라이드 ${hotspots.length}곳에서 발생`} />
          <Kpi label="미답변" value={unanswered} hint={questions.length ? `전체의 ${Math.round((unanswered / questions.length) * 100)}%` : "질문 없음"} tone={unanswered > 0 ? "warning" : undefined} />
          <Kpi label="핀 질문 비율" value={`${pinRate(questions)}%`} hint="좌표가 찍힌 질문" />
          <Kpi label="해결률" value={`${resolveRate(questions)}%`} hint={`해결 ${countBy(questions, "resolved")}건`} tone="success" />
        </div>

        <div className="section-grid">
          <section className="panel">
            <div className="panel-head"><div><h2>혼란 핫스팟</h2><p>질문 밀도가 높은 슬라이드 순</p></div><span className="heat-legend"><i className="heat-fill low" />낮음<i className="heat-fill mid" />중간<i className="heat-fill high" />높음<i className="heat-fill critical" />매우 높음</span></div>
            {hotspots.length ? (
              <ul className="heat-list">
                {hotspots.slice(0, 8).map((item) => (
                  <li key={`${item.sessionId}-${item.slideIndex}`}>
                    <Link className="heat-row" href={`/admin/session/${item.sessionId}`}>
                      <span className="heat-slide">{item.slideIndex + 1}p</span>
                      <span className="heat-title"><b>{item.title}</b><small>{item.sessionTitle}</small></span>
                      <span className="heat-track"><i className={`heat-fill ${heatLevel(item.count, maxHeat)}`} style={{ width: `${maxHeat ? (item.count / maxHeat) * 100 : 0}%` }} /></span>
                      <span className="heat-count">{item.count}건{item.unanswered > 0 && <em>미답변 {item.unanswered}</em>}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty message="집계할 질문이 없어요" hint="질문이 쌓이면 슬라이드별 밀도를 계산합니다." />}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h2>질문 유형</h2><p>카테고리 분포</p></div></div>
            {categories.length ? (
              <ul className="cat-list">
                {categories.map((item) => (
                  <li key={item.key}>
                    <span className="cat-head"><em className={`category ${item.key}`}>{item.label}</em><b>{item.count}</b></span>
                    <span className="cat-track"><i className={`cat-fill ${item.key}`} style={{ width: `${maxCategory ? (item.count / maxCategory) * 100 : 0}%` }} /></span>
                  </li>
                ))}
              </ul>
            ) : <Empty message="분류할 질문이 없어요" hint="질문이 들어오면 유형별로 집계합니다." />}
          </section>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>개선 후보</h2><p>근거 질문 2건 이상인 슬라이드만 제안합니다</p></div><span className="panel-note"><Sparkles />모든 제안은 원본 질문으로 역추적됩니다</span></div>
          {hotspots.filter((item) => item.count >= 2).length ? (
            <ul className="improve-list">
              {hotspots.filter((item) => item.count >= 2).slice(0, 4).map((item) => (
                <li key={`${item.sessionId}-${item.slideIndex}`} className="improve-card">
                  <span className="improve-slide">{item.sessionTitle} · {item.slideIndex + 1}p</span>
                  <b>{item.title}</b>
                  <p>이 슬라이드에서 질문 {item.count}건이 발생했습니다. 설명 보강이나 예시 추가를 검토하세요.</p>
                  <Link className="panel-link" href={`/admin/session/${item.sessionId}?tab=questions`}>근거 질문 보기<ArrowRight /></Link>
                </li>
              ))}
            </ul>
          ) : <Empty message="아직 제안할 개선 후보가 없어요" hint="같은 슬라이드에 질문이 2건 이상 쌓이면 후보로 올라옵니다." />}
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>미답변 질문</h2><p>{openQuestions.length}건이 답변을 기다리고 있어요</p></div></div>
          {openQuestions.length ? (
            <div className="question-table flat">
              <div className="table-head"><span>슬라이드</span><span>질문</span><span>카테고리</span><span>상태</span><span>등록 시간</span><span /></div>
              {openQuestions.slice(0, 8).map(({ question, session }) => (
                <Link className="table-row" key={question.id} href={`/admin/session/${session.id}?tab=questions`}>
                  <span className="slide-cell"><b>{question.slideIndex + 1}</b><small>{session.title}</small></span>
                  <span className="question-text">{question.text}</span>
                  <span><em className={`category ${question.category}`}>{categoryLabel[question.category]}</em></span>
                  <span><StatusBadge status={question.status} /></span>
                  <span className="muted">{timeAgo(question.createdAt)}</span>
                  <span><ArrowRight /></span>
                </Link>
              ))}
            </div>
          ) : <Empty message="미답변 질문이 없어요" hint="모든 질문에 답변이 등록됐습니다." />}
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
