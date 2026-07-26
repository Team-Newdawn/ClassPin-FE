"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, ChevronLeft, ChevronRight, Clock3, Copy, Link2, ListFilter, MessageCircleQuestion, Pause, Play, Search, Share2, Users, X } from "@/components/icons";
import { AdminSidebar } from "@/components/admin-shell";
import { SlideCanvas } from "@/components/slide-canvas";
import { StatusBadge } from "@/components/status-badge";
import { useHorizontalSlideWheel } from "@/components/use-horizontal-slide-wheel";
import { useSessions } from "@/components/session-store";
import { categoryLabel, timeAgo } from "@/lib/format";
import type { Question, QuestionStatus } from "@/lib/types";

type Tab = "live" | "questions";

export default function SessionAdmin() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { sessions, ready, answerQuestion, resolveQuestion, setCurrentSlide, setStatus } = useSessions();
  const session = sessions.find((item) => item.id === params.id);
  const [tab, setTab] = useState<Tab>(search.get("tab") === "questions" ? "questions" : "live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuestionStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const visibleQuestions = useMemo(() => session?.questions.filter((q) => (filter === "all" || q.status === filter) && q.text.toLowerCase().includes(query.toLowerCase())) ?? [], [filter, query, session]);
  const runAction = (action: Promise<void>, message: string) => {
    setActionError(null);
    void action.catch((error) => {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${message}: ${detail}`, error);
      setActionError(message);
    });
  };

  // 화살표나 점으로 슬라이드를 넘길 때 필름스트립이 따라오지 않으면, 장수가 많을수록
  // 지금 어디인지 놓친다. scrollIntoView 는 창까지 움직여서 컨테이너만 직접 민다.
  const filmstripRef = useRef<HTMLDivElement>(null);
  const currentSlide = session?.currentSlide;
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip || currentSlide == null) return;
    const active = strip.children[currentSlide] as HTMLElement | undefined;
    if (!active) return;
    const stripBox = strip.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const offset = (activeBox.left - stripBox.left) - (stripBox.width - activeBox.width) / 2;
    strip.scrollTo({ left: strip.scrollLeft + offset, behavior: "smooth" });
  }, [currentSlide]);
  const handleSlideWheel = useHorizontalSlideWheel({
    currentIndex: session?.currentSlide ?? 0,
    slideCount: session?.slides.length ?? 0,
    onIndexChange: (index) => {
      if (session) runAction(setCurrentSlide(session.id, index), "슬라이드 상태를 저장하지 못했습니다.");
    }
  });

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!session) return <div className="empty-state"><h1>세션을 찾을 수 없어요</h1><button className="btn primary" onClick={() => router.push("/")}>홈으로</button></div>;

  const slide = session.slides[session.currentSlide];
  const slideQuestions = session.questions.filter((q) => q.slideIndex === session.currentSlide);
  const selected = session.questions.find((q) => q.id === selectedId) ?? slideQuestions[0];
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/join/${session.code}`;
  const copy = async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const submitAnswer = () => {
    if (!selected || !answer.trim()) return;
    const body = answer.trim();
    setActionError(null);
    void answerQuestion(session.id, selected.id, body)
      .then(() => setAnswer(""))
      .catch((error) => {
        const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
        console.error(`답변을 저장하지 못했습니다: ${detail}`, error);
        setActionError("답변을 저장하지 못했습니다.");
      });
  };

  return (
    <div className="app-shell">
      <AdminSidebar />
      <main className="admin-main">
        <header className="topbar">
          <div className="session-identity"><button className="icon-btn" onClick={() => router.push("/admin/dashboard")} aria-label="뒤로"><ChevronLeft /></button><span><b>{session.title}</b><small>{session.fileName}</small></span><span className={`live-badge ${session.status}`}><i />{session.status === "live" ? "진행 중" : session.status === "ended" ? "종료" : "초안"}</span></div>
          <div className="top-actions"><button className="btn secondary" onClick={() => runAction(setStatus(session.id, session.status === "live" ? "ended" : "live"), "강의 상태를 저장하지 못했습니다.")}>{session.status === "live" ? <><Pause />세션 종료</> : <><Play />다시 시작</>}</button><button className="btn primary" onClick={() => setShareOpen(true)}><Share2 />참여 링크</button></div>
        </header>
        {actionError && <div className="login-error" role="alert">{actionError} 잠시 후 다시 시도해 주세요.</div>}
        <div className="workspace-tabs"><button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}><Play />라이브 플레이어<span>{session.questions.filter((q) => q.status === "unanswered").length}</span></button><button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}><MessageCircleQuestion />질문 목록<span>{session.questions.length}</span></button></div>

        {tab === "live" ? (
          <div className="player-workspace">
            <section className="player-stage">
              <div className="stage-toolbar"><div><span className="status-dot" />수강생 화면과 동기화 중</div><span>{session.currentSlide + 1} / {session.slides.length}</span></div>
              <div className="stage-canvas-wrap" onWheel={handleSlideWheel}><SlideCanvas slide={slide} questions={slideQuestions} selectedId={selected?.id} onSelectPin={setSelectedId} /></div>
              <div className="player-controls"><button className="icon-btn" disabled={session.currentSlide === 0} onClick={() => runAction(setCurrentSlide(session.id, session.currentSlide - 1), "슬라이드 상태를 저장하지 못했습니다.")} aria-label="이전 슬라이드"><ChevronLeft /></button><div className="slide-dots">{session.slides.map((_, i) => <button key={i} className={i === session.currentSlide ? "active" : ""} onClick={() => runAction(setCurrentSlide(session.id, i), "슬라이드 상태를 저장하지 못했습니다.")} aria-label={`${i + 1}번 슬라이드`} />)}</div><button className="icon-btn" disabled={session.currentSlide === session.slides.length - 1} onClick={() => runAction(setCurrentSlide(session.id, session.currentSlide + 1), "슬라이드 상태를 저장하지 못했습니다.")} aria-label="다음 슬라이드"><ChevronRight /></button></div>
              <div className="filmstrip" ref={filmstripRef}>{session.slides.map((item, index) => <button key={item.id} className={index === session.currentSlide ? "active" : ""} onClick={() => runAction(setCurrentSlide(session.id, index), "슬라이드 상태를 저장하지 못했습니다.")}><SlideCanvas slide={item} compact /><span>{index + 1}</span>{session.questions.some((q) => q.slideIndex === index) && <i>{session.questions.filter((q) => q.slideIndex === index).length}</i>}</button>)}</div>
            </section>
            <aside className="live-questions">
              <div className="panel-heading"><div><h2>실시간 질문</h2><p>현재 슬라이드 · {slideQuestions.length}개</p></div><span className="pulse-dot" /></div>
              <div className="question-stack">{slideQuestions.length ? slideQuestions.map((q) => <QuestionCard key={q.id} question={q} selected={selected?.id === q.id} onClick={() => setSelectedId(q.id)} />) : <div className="no-questions"><MessageCircleQuestion /><b>아직 질문이 없어요</b><span>수강생 질문이 들어오면<br />바로 여기에 표시됩니다.</span></div>}</div>
              {selected && <div className="answer-box">
                {selected.answer && <div className="saved-answer"><span>최근 답변</span><p>{selected.answer}</p></div>}
                <label htmlFor="answer">{selected.answer ? "추가 답변" : "빠른 답변"}</label>
                <textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="수강생에게 보낼 답변을 입력하세요" />
                <div className="answer-actions"><button className="btn tertiary" onClick={() => runAction(resolveQuestion(session.id, selected.id), "질문 상태를 저장하지 못했습니다.")}><Check />해결 처리</button><button className="btn primary" onClick={submitAnswer}>답변 보내기</button></div>
              </div>}
            </aside>
          </div>
        ) : (
          <div className="questions-page">
            <div className="questions-header"><div><h1>질문 목록</h1><p>슬라이드별 질문을 한눈에 확인하고 답변 상태를 관리하세요.</p></div><div className="kpi-inline"><span><b>{session.questions.length}</b>전체 질문</span><span><b>{session.questions.filter((q) => q.status === "unanswered").length}</b>미답변</span><span><b>{session.questions.filter((q) => q.status === "resolved").length}</b>해결됨</span></div></div>
            <div className="filterbar"><div className="searchbox"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="질문 내용 검색" /></div><div className="filter-tabs">{(["all", "unanswered", "answered", "resolved"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "전체" : item === "unanswered" ? "미답변" : item === "answered" ? "답변 완료" : "해결됨"}</button>)}</div><button className="btn secondary"><ListFilter />필터</button></div>
            <div className="question-table"><div className="table-head"><span>슬라이드</span><span>질문</span><span>카테고리</span><span>상태</span><span>등록 시간</span><span /></div>{visibleQuestions.map((q) => <button className="table-row" key={q.id} onClick={() => { runAction(setCurrentSlide(session.id, q.slideIndex), "슬라이드 상태를 저장하지 못했습니다."); setSelectedId(q.id); setTab("live"); }}><span className="slide-cell"><b>{q.slideIndex + 1}</b><small>Slide {q.slideIndex + 1}</small></span><span className="question-text">{q.text}</span><span><em className={`category ${q.category}`}>{categoryLabel[q.category]}</em></span><span><StatusBadge status={q.status} /></span><span className="muted">{timeAgo(q.createdAt)}</span><span><ChevronRight /></span></button>)}</div>
          </div>
        )}
      </main>

      {shareOpen && <div className="modal-backdrop" onMouseDown={() => setShareOpen(false)}><div className="share-modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShareOpen(false)}><X /></button><div className="modal-icon"><Users /></div><h2>수강생을 초대하세요</h2><p>QR 코드를 보여주거나 참여 링크를 공유하세요.<br />로그인 없이 바로 질문을 남길 수 있어요.</p><div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div><div className="session-code"><span>참여 코드</span><b>{session.code}</b></div><div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={copy}>{copied ? <Check /> : <Copy />}</button></div><button className="btn primary large full" onClick={copy}>{copied ? <><Check />복사했어요</> : <><Copy />참여 링크 복사</>}</button></div></div>}
    </div>
  );
}

function QuestionCard({ question, selected, onClick }: { question: Question; selected: boolean; onClick: () => void }) {
  return <button className={`question-card ${selected ? "selected" : ""}`} onClick={onClick}><div className="question-meta"><div className="question-copy"><span className={`category ${question.category}`}>{categoryLabel[question.category]}</span><p>{question.text}</p></div><span className="question-time"><Clock3 />{timeAgo(question.createdAt)}</span></div>{question.answer && <div className="question-answer"><span>내 답변</span><p>{question.answer}</p></div>}<div><StatusBadge status={question.status} />{question.x !== null && <span className="pin-context">핀 질문</span>}</div></button>;
}
