"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ArrowRight, BarChart3, Clock3, MessageCircleQuestion, Plus } from "@/components/icons";
import { useSessions } from "@/components/session-store";
import { StatusBadge } from "@/components/status-badge";
import { categoryLabel, timeAgo } from "@/lib/format";
import { allQuestions, countBy, heatLevel, recentQuestions, resolveRate, slideHeatmap } from "@/lib/stats";

export default function DashboardPage() {
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
          <div><h1>대시보드</h1><p>지금 답해야 할 질문과 강의별 상태를 한 화면에서 확인하세요.</p></div>
          <div className="page-actions"><Link className="btn secondary" href="/admin/insights"><BarChart3 />인사이트 열기</Link><button className="btn primary" onClick={() => router.push("/")}><Plus />새 강의 시작</button></div>
        </div>

        <div className="kpi-grid">
          <KpiCard label="전체 강의" value={sessions.length} hint={`진행 중 ${liveSessions.length}개`} />
          <KpiCard label="누적 질문" value={questions.length} hint={`핀 질문 ${questions.filter((q) => q.x !== null).length}개`} />
          <KpiCard label="미답변" value={unanswered} hint={questions.length ? `전체의 ${Math.round((unanswered / questions.length) * 100)}%` : "질문 없음"} tone={unanswered > 0 ? "warning" : undefined} />
          <KpiCard label="해결률" value={`${resolveRate(questions)}%`} hint={`해결 ${countBy(questions, "resolved")}건`} tone="success" />
        </div>

        <div className="section-grid">
          <section className="panel">
            <div className="panel-head"><div><h2>강의 현황</h2><p>세션을 열어 질문에 답하고 슬라이드를 넘기세요.</p></div><Link className="panel-link" href="/admin/materials">전체 보기<ArrowRight /></Link></div>
            {sessions.length ? (
              <ul className="session-list">
                {sessions.slice(0, 5).map((session) => {
                  const open = countBy(session.questions, "unanswered");
                  return (
                    <li key={session.id}>
                      <Link className="session-row" href={`/admin/session/${session.id}`}>
                        <span className="session-row-main"><b>{session.title}</b><small>{session.slides.length}개 슬라이드 · 코드 {session.code}</small></span>
                        <span className={`live-badge ${session.status}`}><i />{session.status === "live" ? "진행 중" : session.status === "ended" ? "종료" : "초안"}</span>
                        <span className="session-row-stat"><b>{session.questions.length}</b>질문</span>
                        <span className={`session-row-stat ${open ? "alert" : ""}`}><b>{open}</b>미답변</span>
                        <ArrowRight />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyBlock message="아직 강의가 없어요" hint="강의 자료를 업로드하면 여기에 표시됩니다." />}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h2>최근 질문</h2><p>방금 들어온 질문부터</p></div></div>
            {feed.length ? (
              <ul className="feed-list">
                {feed.map(({ question, session }) => (
                  <li key={question.id}>
                    <Link className="feed-item" href={`/admin/session/${session.id}?tab=questions`}>
                      <span className="feed-top"><em className={`category ${question.category}`}>{categoryLabel[question.category]}</em><span className="feed-time"><Clock3 />{timeAgo(question.createdAt)}</span></span>
                      <p>{question.text}</p>
                      <span className="feed-bottom"><StatusBadge status={question.status} /><small>{session.title} · {question.slideIndex + 1}p</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyBlock message="아직 질문이 없어요" hint="수강생이 질문을 남기면 바로 표시됩니다." />}
          </section>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>질문이 몰린 슬라이드</h2><p>수강생이 가장 많이 막힌 지점 · 근거 질문 수 기준</p></div><Link className="panel-link" href="/admin/insights">인사이트<ArrowRight /></Link></div>
          {hotspots.length ? (
            <ul className="heat-list">
              {hotspots.map((item) => (
                <li key={`${item.sessionId}-${item.slideIndex}`}>
                  <Link className="heat-row" href={`/admin/session/${item.sessionId}?slide=${item.slideIndex}`}>
                    <span className="heat-slide">{item.slideIndex + 1}p</span>
                    <span className="heat-title"><b>{item.title}</b><small>{item.sessionTitle}</small></span>
                    <span className="heat-track"><i className={`heat-fill ${heatLevel(item.count, maxHeat)}`} style={{ width: `${maxHeat ? (item.count / maxHeat) * 100 : 0}%` }} /></span>
                    <span className="heat-count">{item.count}건{item.unanswered > 0 && <em>미답변 {item.unanswered}</em>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyBlock message="집계할 질문이 없어요" hint="질문이 쌓이면 혼란 핫스팟을 자동으로 계산합니다." />}
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
