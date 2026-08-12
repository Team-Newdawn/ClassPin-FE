"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, MapPin, Send, Smile, Trash2, X } from "@/components/icons";
import { PinLogo } from "@/components/pin-logo";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { ImageCanvas } from "@/components/pin/image-canvas";
import { CampaignPageNavigation } from "@/components/pin/campaign-page-navigation";
import { useCampaigns } from "@/components/pin/campaign-store";
import { useCampaignReactions } from "@/components/pin/use-campaign-reactions";
import { clampImageZoom, imageZoomFromPinch } from "@/lib/pin/image-zoom";
import {
  CAMPAIGN_REACTION_EMOJIS,
  CAMPAIGN_REACTION_EVENT,
  campaignReactionTopic,
  type CampaignReactionEmoji
} from "@/lib/pin/reactions";
import { fetchCampaignPlayer } from "@/lib/pin/repository";
import { ensureAnonymousUser, getAudienceSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";
import {
  acceptsFeedbackCategory,
  configuredFeedbackCategoryLabel,
  enabledFeedbackCategories,
  feedbackCategoryClass,
  isLegacyFeedbackCategory,
  pagesForAudience,
  type FeedbackCategory,
  type FeedbackPin
} from "@/lib/pin/types";

// DB 가 body 를 1~200자로 강제한다(feedback_pins CHECK).
const BODY_MAX = 200;
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
  const finalHref = `/pin/join/${encodeURIComponent(params.code)}/final`;
  const { user } = useAuth();
  const primaryUserId = user && !user.is_anonymous ? user.id : null;
  const [audienceUserId, setAudienceUserId] = useState<string | null>(null);
  const userId = primaryUserId ?? audienceUserId;
  const { campaigns, ready, addPin, updatePin, loadCampaignByCode } = useCampaigns();
  const campaign = useMemo(() => campaigns.find((item) => item.code.toLowerCase() === params.code.toLowerCase()), [params.code, campaigns]);
  const { reactions: liveReactions, addReaction } = useCampaignReactions(campaign?.id ?? null);
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
  const [publicPins, setPublicPins] = useState<FeedbackPin[]>([]);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<"pin" | "emoji">("pin");
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const pinDragged = useRef(false);
  const pinDragStart = useRef<{ x: number; y: number } | null>(null);
  const imagePointers = useRef(new Map<number, { x: number; y: number }>());
  const imagePinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const blockCanvasClick = useRef(false);
  const canvasClickResetTimer = useRef<number | null>(null);
  const storageKey = `pin-audience:${params.code.toLowerCase()}`;
  const metadataRequestKey = params.code.toLowerCase();
  const selectedAudience = campaign?.audienceGroups.includes(audienceGroup ?? "") ? audienceGroup : null;
  const audienceRequestKey = selectedAudience ? `${metadataRequestKey}:${selectedAudience}` : "";
  const attachZoomGuard = useCallback((shell: HTMLElement | null) => {
    if (!shell) return;
    const zoomImageWithTrackpad = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (!(event.target instanceof Element) || !event.target.closest(".student-image-viewport")) return;
      setImageZoom((current) => clampImageZoom(current * Math.exp(-event.deltaY * 0.01)));
    };
    shell.addEventListener("wheel", zoomImageWithTrackpad, { passive: false });
    return () => {
      shell.removeEventListener("wheel", zoomImageWithTrackpad);
      if (canvasClickResetTimer.current) window.clearTimeout(canvasClickResetTimer.current);
    };
  }, []);

  useEffect(() => {
    if (primaryUserId) return;
    let active = true;
    void ensureAnonymousUser()
      .then((audienceUser) => { if (active) setAudienceUserId(audienceUser?.id ?? null); })
      .catch((error) => console.error("Audience identity lookup failed", error));
    return () => { active = false; };
  }, [primaryUserId]);

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

  useEffect(() => {
    if (!campaign?.id) return;
    let active = true;
    const refresh = async () => {
      try {
        const snapshot = await fetchCampaignPlayer(campaign.id);
        if (active) setPublicPins(snapshot?.pins ?? []);
      } catch (error) {
        console.error("Audience feedback list refresh failed", error);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [campaign?.id]);

  const selectAudience = (next: string | null) => {
    if (next) sessionStorage.setItem(storageKey, next);
    else sessionStorage.removeItem(storageKey);
    setAudienceGroup(next);
    setAudienceLookupKey("");
    setActivePageIndex(0);
    setImageZoom(1);
    imagePointers.current.clear();
    imagePinchStart.current = null;
    setDraft(null);
    setEditingPinId(null);
    setViewingPinId(null);
    setComposerOpen(false);
  };

  if (!supabaseConfigured) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.supabase.title")}</h1><p>{t("pin.supabase.participantDescription")}</p></div>;
  if (!ready || !audienceReady || metadataLookupKey !== metadataRequestKey) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!campaign) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.join.notFound")}</h1><p>{t("pin.join.checkLink")}</p></div>;
  const live = campaign.status === "live";
  if (!live) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.join.endedTitle")}</h1><p>{t("pin.join.endedDescription")}</p><Link className="btn primary" href={finalHref}>{t("experience.complete")}</Link></div>;
  if (campaign.audienceGroups.length && !selectedAudience) return <main className="student-shell audience-selection-shell">
    <header className="student-header"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><div className="student-header-actions"><Link className="student-complete-button" href={finalHref}>{t("experience.complete")}</Link><LanguageSwitcher /></div></header>
    <section className="audience-selection" aria-labelledby="audience-selection-title">
      <span className="eyebrow">{t("pin.audience.eyebrow")}</span>
      <h1 id="audience-selection-title">{t("pin.audience.chooseTitle")}</h1>
      <p>{t("pin.audience.chooseDescription")}</p>
      <div>{campaign.audienceGroups.map((group) => <button key={group} className="audience-option" onClick={() => selectAudience(group)}>{group}</button>)}</div>
    </section>
  </main>;
  if (selectedAudience && audienceLookupKey !== audienceRequestKey) return <div className="loading-screen"><span className="spinner dark" /></div>;
  const visiblePages = selectedAudience ? pagesForAudience(campaign.pages, selectedAudience) : campaign.pages;
  if (!visiblePages.length) return <div className="student-empty"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><LanguageSwitcher /><h1>{t("pin.audience.noPagesTitle")}</h1><p>{t("pin.audience.noPagesDescription", { group: selectedAudience ?? "" })}</p><div className="student-empty-actions">{selectedAudience && <button className="btn secondary" onClick={() => selectAudience(null)}>{t("pin.audience.change")}</button>}<Link className="btn primary" href={finalHref}>{t("experience.complete")}</Link></div></div>;
  const activePage = visiblePages[activePageIndex] ?? visiblePages[0];
  const categoryOptions = enabledFeedbackCategories(campaign.feedbackCategories);
  const defaultCategory = categoryOptions[0] ?? null;
  const categoryLabel = (category: FeedbackCategory) =>
    configuredFeedbackCategoryLabel(campaign.feedbackCategories, category, feedbackCategoryLabel);
  const categoryClass = (category: FeedbackCategory) => feedbackCategoryClass(campaign.feedbackCategories, category);
  // 공개 핀은 목록에 모두 보여주고, 이미지에는 내 핀과 목록에서 선택한 핀만 보여준다.
  // 관리자가 숨긴 핀도 여기서 뺀다 — 지운 것처럼 보이는 게 반쯤 살아 있는 것보다 정직하다.
  const pagePins = [...new Map([...publicPins, ...campaign.pins].map((pin) => [pin.id, pin])).values()]
    .filter((pin) => pin.campaignId === campaign.id && pin.pageIndex === (activePage?.pageIndex ?? 0) && !pin.hidden)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const myPins = pagePins.filter((pin) => pin.authorId && pin.authorId === userId);
  const selectedImagePinId = editingPinId ?? viewingPinId ?? selectedFeedbackId;
  const visibleImagePinIds = new Set(myPins.map((pin) => pin.id));
  if (selectedImagePinId) visibleImagePinIds.add(selectedImagePinId);
  const viewingPin = viewingPinId ? myPins.find((pin) => pin.id === viewingPinId) : null;
  const activeCategory = draft?.category ?? defaultCategory;
  const draftBody = draft?.body ?? "";
  const placeDraftPin = (x: number, y: number) => {
    setSelectedFeedbackId(null);
    setEditingPinId(null);
    setViewingPinId(null);
    setSubmitError(null);
    setDraft((current) => ({
      pageIndex: activePage?.pageIndex ?? 0,
      x,
      y,
      category: current && acceptsFeedbackCategory(campaign.feedbackCategories, current.category) ? current.category : defaultCategory,
      body: current?.body ?? ""
    }));
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
    setDraft({
      pageIndex: pin.pageIndex,
      x: pin.x,
      y: pin.y,
      category: acceptsFeedbackCategory(campaign.feedbackCategories, pin.category) ? pin.category : defaultCategory,
      body: pin.body
    });
    setEditingPinId(pin.id);
    setViewingPinId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(true);
  };
  const selectImagePin = (pinId: string) => {
    setSelectedFeedbackId(pinId);
    if (myPins.some((pin) => pin.id === pinId)) startEditingPin(pinId);
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
    // 카테고리가 없는 캠페인은 라벨로 빈 본문을 보완할 수 없으므로 답변을 직접 입력해야 한다.
    const body = draft.body.trim().slice(0, BODY_MAX);
    if (draft.category === null && !body) {
      setSubmitError(t("pin.join.bodyRequired"));
      return;
    }
    const values = { category: draft.category, body: body || categoryLabel(draft.category) };
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (editingPinId) {
        await updatePin(campaign.id, editingPinId, values);
      } else {
        await addPin(campaign.id, { pageIndex: draft.pageIndex, x: draft.x, y: draft.y, ...values });
        setDraft(null);
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
    setImageZoom(1);
    imagePointers.current.clear();
    imagePinchStart.current = null;
    setSelectedFeedbackId(null);
    clearDraft();
    setEditingPinId(null);
    setViewingPinId(null);
    setSubmitted(false);
    setSubmitError(null);
    setComposerOpen(false);
  };
  const startImageGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    imagePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imagePointers.current.size !== 2) return;
    const [first, second] = [...imagePointers.current.values()];
    imagePinchStart.current = {
      distance: Math.hypot(first.x - second.x, first.y - second.y),
      zoom: imageZoom
    };
  };
  const moveImageGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imagePointers.current.has(event.pointerId)) return;
    imagePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinchStart = imagePinchStart.current;
    if (!pinchStart || imagePointers.current.size !== 2) return;
    event.preventDefault();
    const [first, second] = [...imagePointers.current.values()];
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    blockCanvasClick.current = true;
    setImageZoom(imageZoomFromPinch(pinchStart.zoom, pinchStart.distance, distance));
  };
  const finishImageGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    imagePointers.current.delete(event.pointerId);
    imagePinchStart.current = null;
    if (!blockCanvasClick.current) return;
    if (canvasClickResetTimer.current) window.clearTimeout(canvasClickResetTimer.current);
    canvasClickResetTimer.current = window.setTimeout(() => {
      blockCanvasClick.current = false;
      canvasClickResetTimer.current = null;
    }, 300);
  };
  const sendEmojiReaction = async (emoji: CampaignReactionEmoji) => {
    setReactionError(null);
    const reaction = { id: crypto.randomUUID(), emoji };
    addReaction(reaction);
    try {
      await ensureAnonymousUser();
      const client = getAudienceSupabaseClient();
      if (!client) throw new Error("Supabase is not configured");
      const channel = client.channel(campaignReactionTopic(campaign.id));
      try {
        await channel.httpSend(CAMPAIGN_REACTION_EVENT, reaction);
      } finally {
        await client.removeChannel(channel);
      }
    } catch (error) {
      console.error("Campaign emoji reaction failed", error);
      setReactionError(t("pin.join.reactionError"));
    }
  };
  return (
    <main ref={attachZoomGuard} className="student-shell student-slide-shell">
      {/* <header className="student-header"><PinLogo href="/pin" product="" label={t("pin.logo.home")} /><div className="student-header-actions">{selectedAudience && <button className="student-audience-switch" onClick={() => selectAudience(null)}>{t("pin.audience.change")}</button>}<Link className="student-complete-button" href={finalHref}>{t("experience.complete")}</Link><LanguageSwitcher /><span className="student-live-status"><i />{t(live ? "pin.status.live" : "pin.status.endedCampaign")}</span></div></header> */}
      {/* QR 로 바로 들어온 참여자는 무엇에 대한 피드백인지 알 방법이 여기밖에 없다. */}
      <p className="student-guide"><b>{campaign.title}{selectedAudience && <em>{selectedAudience}</em>}</b>{campaign.guideText && <span>{campaign.guideText}</span>}</p>
      <section className={`student-stage ${imageZoom > 1 ? "image-zoomed" : ""}`}>
        <div className="student-image-stage" role="region" aria-label={t("pin.join.imageAria", { title: campaign.title })}>
          <div
            className="student-image-viewport"
            onPointerDown={startImageGesture}
            onPointerMove={moveImageGesture}
            onPointerUp={finishImageGesture}
            onPointerCancel={finishImageGesture}
          >
            <div className="student-canvas pin-fit" style={{
              "--student-image-width": `${(imageZoom * 100).toFixed(2)}%`,
              width: `min(${(imageZoom * 100).toFixed(2)}vw, ${((activePage.imageWidth / activePage.imageHeight) * 50 * imageZoom).toFixed(2)}dvh)`,
              aspectRatio: `${activePage.imageWidth} / ${activePage.imageHeight}`
            } as React.CSSProperties}>
              <ImageCanvas campaign={campaign} page={activePage} pins={pagePins} visiblePinIds={visibleImagePinIds} selectedId={selectedImagePinId} onSelectPin={selectImagePin} onCanvasClick={live && activeTool === "pin" ? (x, y) => {
                if (!blockCanvasClick.current) placeDraftPin(x, y);
              } : undefined} showLabels labelMode="selected">
              {activeTool === "pin" && draft && !editingPinId && !submitted && <>
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
                {draft.category !== null && <span className={`draft-tag pin-category ${categoryClass(draft.category)}`} style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>{categoryLabel(draft.category)}</span>}
              </>}
              </ImageCanvas>
            </div>
          </div>
          <div className="participant-controls">
            <CampaignPageNavigation pageIndex={activePageIndex} pageCount={visiblePages.length} onChange={changePage} className="participant-pages" />
            <div className="participant-reaction-tools">
              {activeTool === "emoji" && <div className="student-emoji-picker participant-emoji-picker" role="group" aria-label={t("student.chooseEmoji")}>
                {CAMPAIGN_REACTION_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => void sendEmojiReaction(emoji)} aria-label={t("student.sendReaction", { emoji })}>{emoji}</button>)}
              </div>}
              <div className="participant-tool-switch" role="toolbar" aria-label={t("pin.join.feedbackTools")}>
                <button type="button" className={activeTool === "pin" ? "active" : ""} onClick={() => setActiveTool("pin")} aria-label={t("pin.join.pinTool")} title={t("student.pin")} aria-pressed={activeTool === "pin"}><MapPin /></button>
                <button type="button" className={activeTool === "emoji" ? "active" : ""} onClick={() => setActiveTool((current) => current === "emoji" ? "pin" : "emoji")} aria-label={t("student.emojiTool")} title={t("student.emoji")} aria-pressed={activeTool === "emoji"}><Smile /></button>
              </div>
              {reactionError && <span className="participant-reaction-error" role="alert">{reactionError}</span>}
            </div>
          </div>
        </div>
        <section className="student-feedback-panel" aria-labelledby="student-feedback-title">
          <header className="student-feedback-head">
            <h2 id="student-feedback-title">{t("pin.join.feedbackListTitle")}</h2>
            <span>{t("pin.detail.listSummary", { count: pagePins.length })}</span>
          </header>
          {pagePins.length ? <ul className="student-feedback-list">
            {pagePins.map((pin, index) => <li key={pin.id} className={`question-card ${selectedFeedbackId === pin.id ? "selected" : ""}`}>
              <button type="button" className="student-feedback-item" onClick={() => setSelectedFeedbackId(pin.id)} aria-pressed={selectedFeedbackId === pin.id}>
                <span className="pin-number">{index + 1}</span>
                <span className="question-copy">
                  <em className={`pin-category ${categoryClass(pin.category)}`}>{categoryLabel(pin.category)}</em>
                  <p>{pin.body}</p>
                </span>
              </button>
            </li>)}
          </ul> : <p className="student-feedback-empty">{t("pin.detail.none")}</p>}
        </section>
      </section>
      <div className="participant-page-reactions" aria-hidden="true">
        {liveReactions.map((reaction) => <span
          key={reaction.id}
          className="slide-emoji-reaction campaign-live-reaction"
          style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}
        >{reaction.emoji}</span>)}
      </div>
      {composerOpen && <div className="student-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}>
        <section className="student-question-modal" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title">
          <button className="modal-close" onClick={closeComposer} aria-label={t("pin.join.closeComposer")}><X /></button>
          {viewingPin ? <div className="student-answer-view">
            <span className={`pin-category ${categoryClass(viewingPin.category)}`}>{categoryLabel(viewingPin.category)}</span>
            <h2 id="pin-modal-title">{t("pin.join.myFeedback")}</h2>
            <p className="student-answer-question">{viewingPin.body}</p>
            <button className="btn primary large full" onClick={closeComposer}>{t("common.confirm")}</button>
          </div> : submitted ? <div className="submitted"><span><Check /></span><h2 id="pin-modal-title">{t(editingPinId ? "pin.join.updated" : "pin.join.submitted")}</h2><p>{t("pin.join.delivered")}</p><button className="btn primary" onClick={closeComposer}>{t(editingPinId ? "common.confirm" : "pin.join.leaveAnother")}</button></div> : <>
            <div className="student-modal-heading">
              <span>!</span>
              <div><h2 id="pin-modal-title">{t(editingPinId ? "pin.join.editPrompt" : "pin.join.newPrompt")}</h2><p>{t(categoryOptions.length ? (editingPinId ? "pin.join.editDescription" : "pin.join.newDescription") : "pin.join.noCategoryDescription")}</p></div>
            </div>
            {categoryOptions.length > 0 && <div className="category-scroll">{categoryOptions.map((item) => <button key={item} className={activeCategory === item ? "active" : ""} onClick={() => selectCategory(item)}>{categoryLabel(item)}</button>)}</div>}
            <div className="textarea-wrap"><textarea value={draftBody} onChange={(event) => updateDraftBody(event.target.value)} maxLength={BODY_MAX} placeholder={activeCategory && isLegacyFeedbackCategory(activeCategory) ? feedbackCategoryHint(activeCategory) : t("pin.join.feedbackPlaceholder")} /><span>{draftBody.length}/{BODY_MAX}</span></div>
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
