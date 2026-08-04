"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { BarChart3, Check, Clock3, Copy, FileText, Link2, ListFilter, MessageCircleQuestion, Pause, Play, Search, Share2, Sparkles, Users, X } from "@/components/icons";
import { PinAdminShell } from "@/components/pin/admin-shell";
import { useCampaigns } from "@/components/pin/campaign-store";
import { ImageCanvas } from "@/components/pin/image-canvas";
import { useLanguage } from "@/components/language-context";
import { downloadPinsCsv } from "@/lib/pin/csv";
import { CATEGORY_KEYS, categoryBreakdown, countBy, hiddenPins, hotZone, latestPinAt, sentiment, topCategory, visiblePins } from "@/lib/pin/stats";
import { feedbackCategoryLabel, type FeedbackCategory, type FeedbackPin } from "@/lib/pin/types";

type CategoryFilter = FeedbackCategory | "all";

export default function CampaignResults() {
  const { timeAgo } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, campaigns, setPinHidden, setStatus } = useCampaigns();
  const campaign = campaigns.find((item) => item.id === params.id);
  // 같은 핀을 다시 눌러도 목록을 또 중앙으로 보내려면 매번 새 객체여야 한다.
  const [selected, setSelected] = useState<{ id: string } | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedId = selected?.id ?? null;
  const selectPin = (id: string) => setSelected({ id });

  const pins = useMemo(() => campaign?.pins ?? [], [campaign]);
  const matched = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return pins.filter((pin) => (filter === "all" || pin.category === filter) && (!keyword || pin.body.toLowerCase().includes(keyword)));
  }, [filter, pins, query]);
  // 이미지와 목록이 같은 배열을 나눠 써야 핀 번호와 목록 번호가 어긋나지 않는다.
  const stagePins = useMemo(() => matched.filter((pin) => !pin.hidden), [matched]);
  const hiddenMatched = useMemo(() => matched.filter((pin) => pin.hidden), [matched]);
  // 숨긴 의견은 번호가 없으므로 언제나 뒤로 몰아, 목록·CSV 순번이 이미지 번호와 같아진다.
  const orderedMatched = useMemo(() => [...stagePins, ...hiddenMatched], [hiddenMatched, stagePins]);
  const listPins = showHidden ? orderedMatched : stagePins;

  const visible = visiblePins(pins);
  const hidden = hiddenPins(pins);
  const categories = categoryBreakdown(visible);
  const top = topCategory(visible);
  const zone = hotZone(visible);
  const latest = latestPinAt(visible);
  const mood = sentiment(visible);
  const maxCategory = categories[0]?.count ?? 0;

  const runAction = (action: Promise<void>, message: string) => {
    setActionError(null);
    void action.catch((error) => {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${message}: ${detail}`, error);
      setActionError(message);
    });
  };

  // 핀으로 고른 의견이 목록 밖에 있으면 두 화면의 연결이 끊긴 것처럼 보인다.
  // scrollIntoView 는 페이지까지 끌고 오므로 목록 컨테이너만 직접 민다.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || !selected) return;
    const item = list.querySelector<HTMLElement>(`[data-pin-id="${selected.id}"]`);
    if (!item) return;
    // 좁은 화면에서는 목록이 이미지 아래로 내려가고 max-height 도 풀려 스크롤 컨테이너가 아니다.
    // 그때 scrollTo 는 0 으로 잘려 아무 일도 일어나지 않으므로 페이지 스크롤로 넘긴다.
    if (list.scrollHeight <= list.clientHeight) {
      item.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    const offset = (itemBox.top - listBox.top) - (listBox.height - itemBox.height) / 2;
    list.scrollTo({ top: list.scrollTop + offset, behavior: "smooth" });
  }, [selected]);

  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!campaign) return <div className="empty-state"><h1>캠페인을 찾을 수 없어요</h1><p>주소가 바뀌었거나 접근 권한이 없는 캠페인입니다.</p><button className="btn primary" onClick={() => router.push("/pin/admin")}>캠페인 목록</button></div>;

  const stageRatio = campaign.imageWidth && campaign.imageHeight ? campaign.imageWidth / campaign.imageHeight : 16 / 9;
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/pin/join/${campaign.code}`;
  const copy = async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const toggleHidden = (pin: FeedbackPin) => runAction(setPinHidden(campaign.id, pin.id, !pin.hidden), pin.hidden ? "피드백을 되돌리지 못했습니다." : "피드백을 제외하지 못했습니다.");

  return (
    <PinAdminShell>
      <div className="admin-page">
        <div className="page-head">
          <div>
            <h1>{campaign.title}</h1>
            <p>{campaign.guideText || "참여자가 이미지 위에 남긴 피드백을 한 화면에서 확인하고 정리하세요."}</p>
          </div>
          <div className="top-actions">
            <span className={`live-badge ${campaign.status}`}><i />{campaign.status === "live" ? "받는 중" : "마감"}</span>
            <button className="btn secondary" onClick={() => runAction(setStatus(campaign.id, campaign.status === "live" ? "ended" : "live"), "캠페인 상태를 저장하지 못했습니다.")}>{campaign.status === "live" ? <><Pause />수집 마감</> : <><Play />다시 열기</>}</button>
            {/* 화면에 보이는 것과 같은 것을 내보낸다. 숨김이 "공유 대상에서 뺀다"는 뜻인데
                내보내기에만 딸려 나오면 숨긴 의미가 없다. */}
            <button className="btn secondary" onClick={() => downloadPinsCsv(campaign, listPins)} disabled={!listPins.length} title={`화면에 보이는 ${listPins.length}건을 CSV 로 저장합니다`}><FileText />CSV 내보내기</button>
            <button className="btn primary" onClick={() => setShareOpen(true)}><Share2 />참여 링크</button>
          </div>
        </div>
        {actionError && <div className="login-error" role="alert">{actionError} 잠시 후 다시 시도해 주세요.</div>}

        {/* 개선 항목만 세면 어느 행사든 "문제 투성이"로 읽힌다. 잘된 점을 같은 크기로 보여준다. */}
        <div className="kpi-grid">
          <Kpi label="모인 피드백" value={pins.length} hint={hidden.length ? `표시 ${visible.length}건 · 제외 ${hidden.length}건` : "모두 표시 중"} />
          <Kpi label="좋아요 비율" value={visible.length ? `${mood.positiveShare}%` : "—"}
               hint={visible.length ? `좋아요 ${mood.positive}건 · 개선 신호 ${mood.improvement}건` : "피드백이 쌓이면 계산합니다"}
               tone={visible.length ? (mood.positiveShare >= 50 ? "success" : undefined) : undefined} />
          <Kpi label="가장 많은 유형" value={top ? top.label : "—"} hint={top ? `${top.count}건 · 전체의 ${top.share}%` : "분류할 피드백이 없습니다"} />
          <Kpi label="피드백이 몰린 곳" value={zone ? zone.label : "—"} hint={zone ? `${zone.count}건 · 전체의 ${zone.share}%` : "좌표가 모이면 계산합니다"} />
        </div>

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="피드백 내용 검색" /></div>
          <div className="filter-tabs">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>전체 {visible.length}</button>
            {CATEGORY_KEYS.map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{feedbackCategoryLabel[key]} {countBy(visible, key)}</button>)}
          </div>
          <button className={`btn secondary pin-hidden-toggle ${showHidden ? "active" : ""}`} onClick={() => setShowHidden(!showHidden)} disabled={!hidden.length} aria-pressed={showHidden}><ListFilter />제외한 것 보기 {hidden.length}</button>
        </div>

        <div className="pin-workspace">
          <section className="panel pin-stage-panel">
            <div className="panel-head">
              <div><h2>피드백 지도</h2><p>이미지 위 핀을 누르면 오른쪽 목록이 그 피드백으로 이동합니다</p></div>
              <span className="panel-note"><Sparkles />제외한 피드백은 이미지에 표시되지 않습니다</span>
            </div>
            {/* 캔버스는 폭 100%에 원본 비율이라, 세로 사진이면 화면을 넘긴다. 비율로 폭을 눌러 높이를 잡는다. */}
            <div className="pin-stage" style={{ maxWidth: `min(100%, calc(58dvh * ${stageRatio.toFixed(3)}))` }}>
              <ImageCanvas campaign={campaign} pins={stagePins} selectedId={selectedId} onSelectPin={selectPin} showLabels labelMode="selected" />
            </div>
          </section>

          <aside className="panel pin-list-panel">
            <div className="panel-head">
              <div><h2>피드백 목록</h2><p>{listPins.length}건 표시 중{latest ? ` · 마지막 피드백 ${timeAgo(latest)}` : ""}</p></div>
            </div>
            <div className="pin-feed" ref={listRef}>
              {listPins.length ? listPins.map((pin, index) => (
                <PinItem
                  key={pin.id}
                  pin={pin}
                  number={pin.hidden ? null : index + 1}
                  selected={selectedId === pin.id}
                  onSelect={() => selectPin(pin.id)}
                  onToggleHidden={() => toggleHidden(pin)}
                />
              )) : (
                <div className="panel-empty">
                  <MessageCircleQuestion />
                  <b>{pins.length ? "조건에 맞는 피드백이 없어요" : "아직 피드백이 없어요"}</b>
                  <span>{pins.length ? "검색어나 카테고리를 바꿔 보세요." : "참여 링크를 공유하면 여기에 피드백이 쌓입니다."}</span>
                </div>
              )}
            </div>
          </aside>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>유형 분포</h2><p>표시 중인 피드백 {visible.length}건 기준</p></div><span className="panel-note"><BarChart3 />제외한 피드백은 집계에서 빠집니다</span></div>
          {maxCategory ? (
            <ul className="cat-list">
              {categories.filter((item) => item.count).map((item) => (
                <li key={item.key}>
                  <span className="cat-head"><em className={`pin-category ${item.key}`}>{item.label}</em><b>{item.count}건 · {item.share}%</b></span>
                  <span className="cat-track"><i className={`cat-fill ${item.key}`} style={{ width: `${(item.count / maxCategory) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <div className="panel-empty"><MessageCircleQuestion /><b>집계할 피드백이 없어요</b><span>피드백이 쌓이면 유형별 분포를 계산합니다.</span></div>}
        </section>
      </div>

    {shareOpen && <div className="modal-backdrop" onMouseDown={() => setShareOpen(false)}><div className="share-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShareOpen(false)}><X /></button><div className="modal-icon"><Users /></div><h2>참여자를 초대하세요</h2><p>{campaign.status === "live" ? <>QR 코드를 보여주거나 참여 링크를 공유하세요.<br />로그인 없이 이미지 위에 피드백을 남길 수 있어요.</> : <>마감된 캠페인은 새 피드백을 받지 않습니다.<br />다시 열면 같은 링크와 코드로 참여할 수 있어요.</>}</p><div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div><div className="session-code"><span>참여 코드</span><b>{campaign.code}</b></div><div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={copy}>{copied ? <Check /> : <Copy />}</button></div><button className="btn primary large full" onClick={copy}>{copied ? <><Check />복사했어요</> : <><Copy />참여 링크 복사</>}</button></div></div>}
    </PinAdminShell>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone?: "warning" | "success" }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className={`kpi-value ${tone ?? ""}`}>{value}</b><small>{hint}</small></div>;
}

function PinItem({ pin, number, selected, onSelect, onToggleHidden }: { pin: FeedbackPin; number: number | null; selected: boolean; onSelect: () => void; onToggleHidden: () => void }) {
  const { timeAgo } = useLanguage();
  return (
    <div className={`question-card pin-item ${selected ? "selected" : ""}`} data-pin-id={pin.id}>
      <button className="pin-item-main" onClick={onSelect} aria-pressed={selected}>
        <span className={`pin-number ${pin.hidden ? "hidden" : ""}`}>{pin.hidden ? "제외" : number}</span>
        <span className="question-meta">
          <span className="question-copy">
            <em className={`pin-category ${pin.category}`}>{feedbackCategoryLabel[pin.category]}</em>
            <p>{pin.body}</p>
          </span>
          <span className="question-time"><Clock3 />{timeAgo(pin.createdAt)}</span>
        </span>
      </button>
      <div className="pin-item-foot">
        <span className="muted">이미지 좌 {Math.round(pin.x * 100)}% · 상 {Math.round(pin.y * 100)}%</span>
        <button className="btn tertiary" onClick={onToggleHidden}>{pin.hidden ? <><Check />되돌리기</> : <><X />제외</>}</button>
      </div>
    </div>
  );
}
