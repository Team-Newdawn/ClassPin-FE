"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { BarChart3, Check, ChevronLeft, ChevronRight, Clock3, Copy, Grid2X2, LayoutDashboard, Link2, ListFilter, MessageCircleQuestion, MoreHorizontal, Pause, Play, Search, Share2, Users, X } from "@/components/icons";
import { PinLogo } from "@/components/pin-logo";
import { SlideCanvas } from "@/components/slide-canvas";
import { StatusBadge } from "@/components/status-badge";
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

  const visibleQuestions = useMemo(() => session?.questions.filter((q) => (filter === "all" || q.status === filter) && q.text.toLowerCase().includes(query.toLowerCase())) ?? [], [filter, query, session]);
  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!session) return <div className="empty-state"><h1>세션을 찾을 수 없어요</h1><button className="btn primary" onClick={() => router.push("/")}>홈으로</button></div>;

  const slide = session.slides[session.currentSlide];
  const slideQuestions = session.questions.filter((q) => q.slideIndex === session.currentSlide);
  const selected = session.questions.find((q) => q.id === selectedId) ?? slideQuestions[0];
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/join/${session.code}`;
  const copy = async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const submitAnswer = () => { if (!selected || !answer.trim()) return; answerQuestion(session.id, selected.id, answer.trim()); setAnswer(""); };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><PinLogo /></div>
        <nav>
          <button className="nav-item"><LayoutDashboard />대시보드</button>
          <button className="nav-item active"><Play />라이브 세션</button>
          <button className="nav-item"><Grid2X2 />강의 자료</button>
          <button className="nav-item"><BarChart3 />인사이트</button>
        </nav>
        <div className="sidebar-bottom"><span className="avatar">MP</span><span><b>민찬 강사</b><small>개인 워크스페이스</small></span><MoreHorizontal /></div>
      </aside>
      <main className="admin-main">
        <header className="topbar">
          <div className="session-identity"><button className="icon-btn" onClick={() => router.push("/")} aria-label="뒤로"><ChevronLeft /></button><span><b>{session.title}</b><small>{session.fileName}</small></span><span className={`live-badge ${session.status}`}><i />{session.status === "live" ? "진행 중" : session.status === "ended" ? "종료" : "초안"}</span></div>
          <div className="top-actions"><button className="btn secondary" onClick={() => setStatus(session.id, session.status === "live" ? "ended" : "live")}>{session.status === "live" ? <><Pause />세션 종료</> : <><Play />다시 시작</>}</button><button className="btn primary" onClick={() => setShareOpen(true)}><Share2 />참여 링크</button></div>
        </header>
        <div className="workspace-tabs"><button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}><Play />라이브 플레이어<span>{session.questions.filter((q) => q.status === "unanswered").length}</span></button><button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}><MessageCircleQuestion />질문 목록<span>{session.questions.length}</span></button></div>

        {tab === "live" ? (
          <div className="player-workspace">
            <section className="player-stage">
              <div className="stage-toolbar"><div><span className="status-dot" />수강생 화면과 동기화 중</div><span>{session.currentSlide + 1} / {session.slides.length}</span></div>
              <div className="stage-canvas-wrap"><SlideCanvas slide={slide} questions={slideQuestions} selectedId={selected?.id} onSelectPin={setSelectedId} /></div>
              <div className="player-controls"><button className="icon-btn" disabled={session.currentSlide === 0} onClick={() => setCurrentSlide(session.id, session.currentSlide - 1)} aria-label="이전 슬라이드"><ChevronLeft /></button><div className="slide-dots">{session.slides.map((_, i) => <button key={i} className={i === session.currentSlide ? "active" : ""} onClick={() => setCurrentSlide(session.id, i)} aria-label={`${i + 1}번 슬라이드`} />)}</div><button className="icon-btn" disabled={session.currentSlide === session.slides.length - 1} onClick={() => setCurrentSlide(session.id, session.currentSlide + 1)} aria-label="다음 슬라이드"><ChevronRight /></button></div>
              <div className="filmstrip">{session.slides.map((item, index) => <button key={item.id} className={index === session.currentSlide ? "active" : ""} onClick={() => setCurrentSlide(session.id, index)}><SlideCanvas slide={item} compact /><span>{index + 1}</span>{session.questions.some((q) => q.slideIndex === index) && <i>{session.questions.filter((q) => q.slideIndex === index).length}</i>}</button>)}</div>
            </section>
            <aside className="live-questions">
              <div className="panel-heading"><div><h2>실시간 질문</h2><p>현재 슬라이드 · {slideQuestions.length}개</p></div><span className="pulse-dot" /></div>
              <div className="question-stack">{slideQuestions.length ? slideQuestions.map((q) => <QuestionCard key={q.id} question={q} selected={selected?.id === q.id} onClick={() => setSelectedId(q.id)} />) : <div className="no-questions"><MessageCircleQuestion /><b>아직 질문이 없어요</b><span>수강생 질문이 들어오면<br />바로 여기에 표시됩니다.</span></div>}</div>
              {selected && <div className="answer-box"><label htmlFor="answer">빠른 답변</label><textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="수강생에게 보낼 답변을 입력하세요" /><div><button className="btn tertiary" onClick={() => resolveQuestion(session.id, selected.id)}><Check />해결 처리</button><button className="btn primary" onClick={submitAnswer}>답변 보내기</button></div></div>}
            </aside>
          </div>
        ) : (
          <div className="questions-page">
            <div className="questions-header"><div><h1>질문 목록</h1><p>슬라이드별 질문을 한눈에 확인하고 답변 상태를 관리하세요.</p></div><div className="kpi-inline"><span><b>{session.questions.length}</b>전체 질문</span><span><b>{session.questions.filter((q) => q.status === "unanswered").length}</b>미답변</span><span><b>{session.questions.filter((q) => q.status === "resolved").length}</b>해결됨</span></div></div>
            <div className="filterbar"><div className="searchbox"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="질문 내용 검색" /></div><div className="filter-tabs">{(["all", "unanswered", "answered", "resolved"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "전체" : item === "unanswered" ? "미답변" : item === "answered" ? "답변 완료" : "해결됨"}</button>)}</div><button className="btn secondary"><ListFilter />필터</button></div>
            <div className="question-table"><div className="table-head"><span>슬라이드</span><span>질문</span><span>카테고리</span><span>상태</span><span>등록 시간</span><span /></div>{visibleQuestions.map((q) => <button className="table-row" key={q.id} onClick={() => { setCurrentSlide(session.id, q.slideIndex); setSelectedId(q.id); setTab("live"); }}><span className="slide-cell"><b>{q.slideIndex + 1}</b><small>Slide {q.slideIndex + 1}</small></span><span className="question-text">{q.text}</span><span><em className={`category ${q.category}`}>{categoryLabel[q.category]}</em></span><span><StatusBadge status={q.status} /></span><span className="muted">{timeAgo(q.createdAt)}</span><span><ChevronRight /></span></button>)}</div>
          </div>
        )}
      </main>

      {shareOpen && <div className="modal-backdrop" onMouseDown={() => setShareOpen(false)}><div className="share-modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShareOpen(false)}><X /></button><div className="modal-icon"><Users /></div><h2>수강생을 초대하세요</h2><p>QR 코드를 보여주거나 참여 링크를 공유하세요.<br />로그인 없이 바로 질문을 남길 수 있어요.</p><div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div><div className="session-code"><span>참여 코드</span><b>{session.code}</b></div><div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={copy}>{copied ? <Check /> : <Copy />}</button></div><button className="btn primary large full" onClick={copy}>{copied ? <><Check />복사했어요</> : <><Copy />참여 링크 복사</>}</button></div></div>}
    </div>
  );
}

function QuestionCard({ question, selected, onClick }: { question: Question; selected: boolean; onClick: () => void }) {
  return <button className={`question-card ${selected ? "selected" : ""}`} onClick={onClick}><div className="question-meta"><span className={`category ${question.category}`}>{categoryLabel[question.category]}</span><span><Clock3 />{timeAgo(question.createdAt)}</span></div><p>{question.text}</p><div><StatusBadge status={question.status} />{question.x !== null && <span className="pin-context">핀 질문</span>}</div></button>;
}
