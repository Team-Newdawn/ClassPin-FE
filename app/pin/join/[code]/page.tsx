"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Send, Trash2, X } from "@/components/icons";
import { PinLogo } from "@/components/pin-logo";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { ImageCanvas } from "@/components/pin/image-canvas";
import { CampaignPageNavigation } from "@/components/pin/campaign-page-navigation";
import { useCampaigns } from "@/components/pin/campaign-store";
import { supabaseConfigured } from "@/lib/supabase/client";
import { pagesForAudience, type FeedbackCategory } from "@/lib/pin/types";

// DB 가 body 를 1~200자로 강제한다(feedback_pins CHECK).
const BODY_MAX = 200;
const DEFAULT_CATEGORY: FeedbackCategory = "praise";
type DraftPin = {
  pageIndex: number;
  x: number;
  y: number;
  category: FeedbackCategory;
  body: string;
};

export default function JoinCampaign() {
  const { feedbackCategoryHint, feedbackCategoryLabel, t } = useLanguage();
  const params = useParams<{ code: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { campaigns, ready, addPin, updatePin, loadCampaignByCode } = useCampaigns();
  const campaign = useMemo(() => campaigns.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, campaigns]);
  // 캠페인은 기준 이미지가 1장이라 draft 도 하나면 된다.
  const [draft, setDraft] = useState<DraftPin | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [viewingPinId, setViewingPinId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [audienceGroup, setAudienceGroup] = useState<string | null>(null);
  const [audienceReady, setAudienceReady] = useState(false);
  const [metadataLookupKey, setMetadataLookupKey] = useState("");
  const [audienceLookupKey, setAudienceLookupKey] = useState("");
  const pinDragged = useRef(false);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);
  const storageKey = `pin-audience:${params.code.toLowerCase()}`;
  const metadataRequestKey = params.code.toLowerCase();
  const selectedAudience = campaign?.audienceGroups.includes(audienceGroup ?? "") ? audienceGroup : null;
  const audienceRequestKey = selectedAudience ? `${metadataRequestKey}:${selectedAudience}` : "";

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setAudienceGroup(saved);
      setAudienceReady(true);
      setMetadataLookupKey("");
      setAudienceLookupKey("");
    });
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!ready || !audienceReady || metadataLookupKey === metadataRequestKey) return;
    let active = true;
    loadCampaignByCode(params.code, null)
      .catch((error) => console.error("Campaign lookup failed", error))
      .finally(() => { if (active) setMetadataLookupKey(metadataRequestKey); });
    return () => { active = false; };
  }, [audienceReady, loadCampaignByCode, metadataLookupKey, metadataRequestKey, params.code, ready]);

  useEffect(() => {
    if (!campaign || metadataLookupKey !== metadataRequestKey || !selectedAudience || audienceLookupKey === audienceRequestKey) return;
    let active = true;
    loadCampaignByCode(params.code, selectedAudience)
      .catch((error) => console.error("Campaign audience lookup failed", error))
      .finally(() => { if (active) setAudienceLookupKey(audienceRequestKey); });
    return () => { active = false; };
  }, [audienceLookupKey, audienceRequestKey, campaign, loadCampaignByCode, metadataLookupKey, metadataRequestKey, params.code, selectedAudience]);

  const selectAudience = (next: string | null) => {
    if (next) sessionStorage.setItem(storageKey, next);
    else sessionStorage.removeItem(storageKey);
    setAudienceGroup(next);
    setAudienceLookupKey("");
    setActivePageIndex(0);
    setDraft(null);
    setEditingPinId(null);
    setViewingPinId(null);
    setComposerOpen(false);
  };

  if (!supabaseConfigured) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.supabase.title")}</h1><p>{t("pin.supabase.participantDescription")}</p></div>;
  if (!ready || !audienceReady || metadataLookupKey !== metadataRequestKey) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!campaign) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.join.notFound")}</h1><p>{t("pin.join.checkLink")}</p></div>;
  const live = campaign.status === "live";
  if (!live) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.join.endedTitle")}</h1><p>{t("pin.join.endedDescription")}</p></div>;
  if (campaign.audienceGroups.length && !selectedAudience) return <main className="student-shell audience-selection-shell">
    <header className="student-header"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /></header>
    <section className="audience-selection" aria-labelledby="audience-selection-title">
      <span className="eyebrow">{t("pin.audience.eyebrow")}</span>
      <h1 id="audience-selection-title">{t("pin.audience.chooseTitle")}</h1>
      <p>{t("pin.audience.chooseDescription")}</p>
      <div>{campaign.audienceGroups.map((group) => <button key={group} className="audience-option" onClick={() => selectAudience(group)}>{group}</button>)}</div>
    </section>
  </main>;
  if (selectedAudience && audienceLookupKey !== audienceRequestKey) return <div className="loading-screen"><span className="spinner dark" /></div>;
  const visiblePages = selectedAudience ? pagesForAudience(campaign.pages, selectedAudience) : campaign.pages;
  if (!visiblePages.length) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.audience.noPagesTitle")}</h1><p>{t("pin.audience.noPagesDescription", { group: selectedAudience ?? "" })}</p>{selectedAudience && <button className="btn primary" onClick={() => selectAudience(null)}>{t("pin.audience.change")}</button>}</div>;
  const activePage = visiblePages[activePageIndex] ?? visiblePages[0];
  const stageRatio = activePage ? activePage.imageWidth / activePage.imageHeight : 16 / 9;
  // RLS 만 믿으면 안 된다. 캠페인 소유자가 자기 참여 링크를 열면 참여자 전원의 핀이 내려오는데,
  // 그대로 그리면 남의 의견이 "내 의견"으로 보이고 수정 컴포저까지 열려 덮어쓰게 된다.
  // 관리자가 숨긴 핀도 여기서 뺀다 — 지운 것처럼 보이는 게 반쯤 살아 있는 것보다 정직하다.
  const myPins = campaign.pins.filter((pin) => pin.pageIndex === (activePage?.pageIndex ?? 0) && pin.authorId && pin.authorId === userId && !pin.hidden);
  const viewingPin = viewingPinId ? myPins.find((pin) => pin.id === viewingPinId) : null;
  const activeCategory = draft?.category ?? DEFAULT_CATEGORY;
  const draftBody = draft?.body ?? "";
  const placeDraftPin = (x: number, y: number) => {
    setEditingPinId(null);
    setViewingPinId(null);
    setSubmitError(null);
    setDraft((current) => ({ pageIndex: activePage?.pageIndex ?? 0, x, y, category: current?.category ?? DEFAULT_CATEGORY, body: current?.body ?? "" }));
    setSubmitted(false);
    setComposerOpen(true);
  };
  const selectCategory = (nextCategory: FeedbackCategory) => {
    setDraft((current) => current ? { ...current, category: nextCategory } : current);
  };
  const startEditingPin = (pinId: string) => {
    const pin = myPins.find((item) => item.id === pinId);
    if (!pin) return;
    // 숨김된 의견과 종료된 캠페인은 RLS 가 수정을 막는다. 읽기 전용으로만 연다.
    if (!live || pin.hidden) {
      setEditingPinId(null);
      setViewingPinId(pin.id);
      setSubmitted(false);
      setSubmitError(null);
      setComposerOpen(true);
      return;
    }
    setDraft({ pageIndex: pin.pageIndex, x: pin.x, y: pin.y, category: pin.category, body: pin.body });
    setEditingPinId(pin.id);
    setViewingPinId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(true);
  };
  const updateDraftBody = (body: string) => {
    setDraft((current) => current ? { ...current, body } : current);
  };
  const clearDraft = () => setDraft(null);
  const moveDraftPin = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const canvas = event.currentTarget.closest(".pin-canvas")?.getBoundingClientRect();
    if (!canvas) return;
    const start = pinDragStart.current;
    if (!pinDragged.current && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    pinDragged.current = true;
    const x = Math.min(1, Math.max(0, (event.clientX - canvas.left) / canvas.width));
    const y = Math.min(1, Math.max(0, (event.clientY - canvas.top) / canvas.height));
    setDraft((current) => current ? { ...current, x, y } : current);
  };
  const finishMovingDraftPin = (event: React.PointerEvent<HTMLButtonElement>) => {
    moveDraftPin(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pinDragStart.current = null;
  };
  const submit = async () => {
    if (!draft || submitting) return;
    if (!live) {
      setSubmitError(t("pin.join.endedError"));
      return;
    }
    // 빈 본문은 DB CHECK 에 걸린다. 유형만 고른 참여자는 카테고리 라벨로 채워 보낸다.
    const values = { category: draft.category, body: draft.body.trim().slice(0, BODY_MAX) || feedbackCategoryLabel(draft.category) };
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingPinId) {
        await updatePin(campaign.id, editingPinId, values);
      } else {
        await addPin(campaign.id, { pageIndex: draft.pageIndex, x: draft.x, y: draft.y, ...values });
      }
      setSubmitted(true);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`Feedback pin save failed: ${detail}`, error);
      setSubmitError(t(editingPinId ? "pin.join.editError" : "pin.join.saveError"));
    } finally {
      setSubmitting(false);
    }
  };
  const closeComposer = () => {
    if (submitted || editingPinId) {
      clearDraft();
      setSubmitted(false);
    }
    setEditingPinId(null);
    setViewingPinId(null);
    setSubmitError(null);
    setComposerOpen(false);
  };
  const deleteDraftPin = () => {
    clearDraft();
    setEditingPinId(null);
    setViewingPinId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(false);
  };
  const changePage = (pageIndex: number) => {
    setActivePageIndex(pageIndex);
    clearDraft();
    setEditingPinId(null);
    setViewingPinId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(false);
  };
  return (
    <main className="student-shell student-slide-shell">
      <header className="student-header"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><div className="student-header-actions">{selectedAudience && <button className="student-audience-switch" onClick={() => selectAudience(null)}>{t("pin.audience.change")}</button>}<LanguageSwitcher /><span className="student-live-status"><i />{t(live ? "pin.status.live" : "pin.status.endedCampaign")}</span></div></header>
      {/* QR 로 바로 들어온 참여자는 무엇에 대한 피드백인지 알 방법이 여기밖에 없다. */}
      <p className="student-guide"><b>{campaign.title}{selectedAudience && <em>{selectedAudience}</em>}</b>{campaign.guideText && <span>{campaign.guideText}</span>}</p>
      <section className="student-stage" aria-label={t("pin.join.imageAria", { title: campaign.title })}>
        <CampaignPageNavigation pageIndex={activePageIndex} pageCount={visiblePages.length} onChange={changePage} className="participant-pages" />
        {/* 폭만 잡으면 세로로 긴 이미지는 화면 몇 배 높이가 되어 참여자가 일부만 보게 된다.
            관리자 화면과 같은 방식으로 뷰포트 높이에서 폭 상한을 역산해 한 화면에 담는다. */}
        <div className="student-canvas pin-fit" style={{ maxWidth: `min(86vw, calc(72dvh * ${stageRatio.toFixed(3)}))` }}>
          <ImageCanvas campaign={campaign} page={activePage} pins={myPins} selectedId={editingPinId ?? viewingPinId} onSelectPin={startEditingPin} onCanvasClick={live ? placeDraftPin : undefined} showLabels>
            {draft && !editingPinId && !submitted && <>
              <button
                className="draft-pin"
                style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                aria-label={t("pin.join.movePin")}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  pinDragged.current = false;
                  pinDragStart.current = { x: event.clientX, y: event.clientY };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={moveDraftPin}
                onPointerUp={finishMovingDraftPin}
                onPointerCancel={finishMovingDraftPin}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!pinDragged.current) setComposerOpen(true);
                  pinDragged.current = false;
                }}
              >!</button>
              <span className={`draft-tag pin-category ${draft.category}`} style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>{feedbackCategoryLabel(draft.category)}</span>
            </>}
          </ImageCanvas>
        </div>
        <p className="student-stage-hint">{t(live ? "pin.join.liveHint" : "pin.join.endedHint")}</p>
      </section>
      {composerOpen && <div className="student-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}>
        <section className="student-question-modal" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title">
          <button className="modal-close" onClick={closeComposer} aria-label={t("pin.join.closeComposer")}><X /></button>
          {viewingPin ? <div className="student-answer-view">
            <span className={`pin-category ${viewingPin.category}`}>{feedbackCategoryLabel(viewingPin.category)}</span>
            <h2 id="pin-modal-title">{t("pin.join.myFeedback")}</h2>
            <p className="student-answer-question">{viewingPin.body}</p>
            <button className="btn primary large full" onClick={closeComposer}>{t("common.confirm")}</button>
          </div> : submitted ? <div className="submitted"><span><Check /></span><h2 id="pin-modal-title">{t(editingPinId ? "pin.join.updated" : "pin.join.submitted")}</h2><p>{t("pin.join.delivered")}</p><button className="btn primary" onClick={closeComposer}>{t(editingPinId ? "common.confirm" : "pin.join.leaveAnother")}</button></div> : <>
            <div className="student-modal-heading">
              <span>!</span>
              <div><h2 id="pin-modal-title">{t(editingPinId ? "pin.join.editPrompt" : "pin.join.newPrompt")}</h2><p>{t(editingPinId ? "pin.join.editDescription" : "pin.join.newDescription")}</p></div>
            </div>
            <div className="category-scroll">{(["praise", "improve", "confusing", "bug", "idea"] as FeedbackCategory[]).map((item) => <button key={item} className={activeCategory === item ? "active" : ""} onClick={() => selectCategory(item)}>{feedbackCategoryLabel(item)}</button>)}</div>
            <div className="textarea-wrap"><textarea value={draftBody} onChange={(event) => updateDraftBody(event.target.value)} maxLength={BODY_MAX} placeholder={feedbackCategoryHint(activeCategory)} /><span>{draftBody.length}/{BODY_MAX}</span></div>
            {submitError && <div className="student-submit-error" role="alert">{submitError}</div>}
            <div className="student-composer-actions">
              <button className="btn primary large full" onClick={() => void submit()} disabled={submitting}>{submitting ? <span className="spinner" /> : <Send />}{t(editingPinId ? "pin.join.sendEdited" : "pin.join.send")}</button>
              {editingPinId
                ? <button className="btn secondary large full" onClick={closeComposer} disabled={submitting}>{t("pin.join.cancelEdit")}</button>
                : <button className="btn destructive large full" onClick={deleteDraftPin}><Trash2 />{t("pin.join.deletePin")}</button>}
            </div>
          </>}
        </section>
      </div>}
    </main>
  );
}
