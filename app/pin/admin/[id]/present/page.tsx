"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, ChevronRight, MapPin, Maximize2, Minimize2, X } from "@/components/icons";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { ImageCanvas } from "@/components/pin/image-canvas";
import { useCampaignReactions } from "@/components/pin/use-campaign-reactions";
import { fetchCampaignPlayer, subscribeToCampaign } from "@/lib/pin/repository";
import { advancePinPlayback, crossedPinMilestone, rectanglesOverlap, resolvePinDisplayPositions } from "@/lib/pin/presentation-rotation";
import type { Campaign } from "@/lib/pin/types";
import { getAudienceSupabaseClient } from "@/lib/supabase/client";

const CONTROLS_HIDE_DELAY = 2800;
const FEEDBACK_REVEAL_DELAY = 1000;
const PAGE_ROTATION_DELAY = 12000;
const PLAYER_REFRESH_DELAY = 2000;
const LIVE_PIN_HIGHLIGHT_DELAY = 1000;
const PIN_MILESTONE_DISPLAY_DELAY = 3000;
const EMPTY_PLAYBACK = { shownPinIds: [] as string[], activePinId: null as string | null };

export default function FeedbackPresentation() {
  const { locale, t } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { reactions: liveReactions } = useCampaignReactions(params.id);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ready, setReady] = useState(false);
  const visiblePins = useMemo(() => campaign?.pins.filter((pin) => !pin.hidden) ?? [], [campaign]);
  const visiblePinIds = useMemo(() => visiblePins.map((pin) => pin.id), [visiblePins]);
  const visiblePinKey = visiblePinIds.join("|");
  const stageRef = useRef<HTMLElement>(null);
  const presentationCanvasRef = useRef<HTMLDivElement>(null);
  const visiblePinIdsRef = useRef<string[]>([]);
  const campaignIdRef = useRef<string | null>(null);
  const milestoneCampaignIdRef = useRef<string | null>(null);
  const highestVisiblePinCountRef = useRef<number | null>(null);
  const milestoneTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [livePinId, setLivePinId] = useState<string | null>(null);
  const [storedPlayback, setStoredPlayback] = useState(EMPTY_PLAYBACK);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pinMilestone, setPinMilestone] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof subscribeToCampaign> = null;
    const refresh = async () => {
      try {
        const next = await fetchCampaignPlayer(params.id);
        if (active) setCampaign(next);
      } catch (error) {
        const networkFailure = typeof error === "object" && error !== null
          && "message" in error && String(error.message).includes("Failed to fetch");
        if (active) console[networkFailure ? "warn" : "error"]("Feedback player refresh failed", error);
      } finally {
        if (active) setReady(true);
      }
    };
    void refresh().then(() => {
      if (active) channel = subscribeToCampaign(params.id, () => void refresh(), true);
    });
    const interval = window.setInterval(() => void refresh(), PLAYER_REFRESH_DELAY);
    return () => {
      active = false;
      window.clearInterval(interval);
      const client = getAudienceSupabaseClient();
      if (client && channel) void client.removeChannel(channel);
    };
  }, [params.id]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
  }, []);

  useEffect(() => {
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const currentCampaignId = campaign?.id;
    if (!currentCampaignId) return;
    const currentCount = visiblePins.length;
    if (milestoneCampaignIdRef.current !== currentCampaignId) {
      milestoneCampaignIdRef.current = currentCampaignId;
      highestVisiblePinCountRef.current = currentCount;
      setPinMilestone(null);
      if (milestoneTimerRef.current) {
        window.clearTimeout(milestoneTimerRef.current);
        milestoneTimerRef.current = null;
      }
      return;
    }

    // 최초 스냅샷보다 낮아졌다가 같은 구간을 다시 넘어도 한 번 본 이정표는 재생하지 않는다.
    const highestCount = highestVisiblePinCountRef.current;
    if (highestCount === null) return;
    highestVisiblePinCountRef.current = Math.max(highestCount, currentCount);
    const milestone = crossedPinMilestone(highestCount, currentCount);
    if (milestone === null) return;

    setPinMilestone(milestone);
    if (milestoneTimerRef.current) window.clearTimeout(milestoneTimerRef.current);
    milestoneTimerRef.current = window.setTimeout(() => {
      setPinMilestone((current) => current === milestone ? null : current);
      milestoneTimerRef.current = null;
    }, PIN_MILESTONE_DISPLAY_DELAY);
  }, [campaign?.id, visiblePins.length]);

  useEffect(() => () => {
    if (milestoneTimerRef.current) window.clearTimeout(milestoneTimerRef.current);
  }, []);

  // 새 스냅샷에 핀이 들어오면 자동 재생 차례를 기다리지 않고 해당 페이지로 이동한다.
  // 첫 스냅샷은 새 핀으로 보지 않아 플레이어가 항상 첫 페이지부터 시작한다.
  useEffect(() => {
    if (!campaign) return;
    const previousIds = visiblePinIdsRef.current;
    visiblePinIdsRef.current = visiblePinIds;
    const firstSnapshot = campaignIdRef.current !== campaign.id;
    campaignIdRef.current = campaign.id;
    const incomingPin = firstSnapshot ? null : visiblePins.find((pin) => !previousIds.includes(pin.id));
    if (firstSnapshot) {
      setActivePageIndex(0);
      setStoredPlayback(EMPTY_PLAYBACK);
    }
    if (incomingPin && campaign.presentationAutoplay) {
      setActivePageIndex(incomingPin.pageIndex);
      setLivePinId(incomingPin.id);
      setStoredPlayback((current) => ({
        shownPinIds: current.shownPinIds.includes(incomingPin.id) ? current.shownPinIds : [...current.shownPinIds, incomingPin.id],
        activePinId: incomingPin.id
      }));
    }
    // id 집합이 같으면 본문 수정만으로 순환 타이머를 다시 시작하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, campaign?.presentationAutoplay, visiblePinKey]);

  useEffect(() => {
    if (!livePinId) return;
    const timeout = window.setTimeout(() => setLivePinId(null), LIVE_PIN_HIGHLIGHT_DELAY);
    return () => window.clearTimeout(timeout);
  }, [livePinId]);

  const activePage = campaign?.pages[activePageIndex] ?? campaign?.pages[0];
  const pagePins = useMemo(
    () => visiblePins.filter((pin) => pin.pageIndex === (activePage?.pageIndex ?? 0)),
    [activePage?.pageIndex, visiblePins]
  );
  const playback = useMemo(() => {
    const validIds = new Set(pagePins.map((pin) => pin.id));
    const shownPinIds = storedPlayback.shownPinIds.filter((id) => validIds.has(id));
    if (shownPinIds.length) return {
      shownPinIds,
      activePinId: shownPinIds.includes(storedPlayback.activePinId ?? "") ? storedPlayback.activePinId : shownPinIds.at(-1) ?? null
    };
    const firstPinId = pagePins[0]?.id ?? null;
    return { shownPinIds: firstPinId ? [firstPinId] : [], activePinId: firstPinId };
  }, [pagePins, storedPlayback]);
  const shownPagePins = useMemo(
    () => pagePins.filter((pin) => playback.shownPinIds.includes(pin.id) || pin.id === livePinId),
    [livePinId, pagePins, playback.shownPinIds]
  );
  const pinDisplayPositions = useMemo(() => {
    if (!canvasSize) return undefined;
    return resolvePinDisplayPositions(pagePins, canvasSize.width, canvasSize.height);
  }, [canvasSize, pagePins]);
  const pagePinsRef = useRef(pagePins);

  useEffect(() => {
    pagePinsRef.current = pagePins;
  }, [pagePins]);

  useLayoutEffect(() => {
    const canvas = presentationCanvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setCanvasSize((current) => current?.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [campaign?.id]);

  const rotateFeedback = useCallback(() => {
    setStoredPlayback((current) => {
      const pins = pagePinsRef.current;
      const validIds = new Set(pins.map((pin) => pin.id));
      const storedIds = current.shownPinIds.filter((id) => validIds.has(id));
      const firstPinId = pins[0]?.id;
      const shownPinIds = storedIds.length ? storedIds : firstPinId ? [firstPinId] : [];
      return advancePinPlayback(pins, shownPinIds);
    });
  }, []);

  useEffect(() => {
    if (!campaign?.presentationAutoplay || pagePins.length < 2) return;
    const interval = window.setInterval(rotateFeedback, FEEDBACK_REVEAL_DELAY);
    return () => window.clearInterval(interval);
  }, [activePageIndex, campaign?.presentationAutoplay, pagePins.length, rotateFeedback]);

  useLayoutEffect(() => {
    const canvas = presentationCanvasRef.current;
    if (!canvas || !showPins) return;
    const labels = Array.from(canvas.querySelectorAll<HTMLElement>("[data-feedback-label-id]"));
    const pins = Array.from(canvas.querySelectorAll<HTMLElement>("[data-feedback-pin-id]"));
    labels.forEach((label) => { label.hidden = false; });
    const activeLabel = labels.find((label) => label.dataset.feedbackLabelId === playback.activePinId);
    const orderedLabels = activeLabel ? [activeLabel, ...labels.filter((label) => label !== activeLabel)] : labels;
    const retained: DOMRect[] = [];
    for (const label of orderedLabels) {
      const labelId = label.dataset.feedbackLabelId;
      const bounds = label.getBoundingClientRect();
      const overlapsPin = pins.some((pin) => pin.dataset.feedbackPinId !== labelId && rectanglesOverlap(bounds, pin.getBoundingClientRect()));
      const keep = label === activeLabel || (!overlapsPin && retained.every((other) => !rectanglesOverlap(bounds, other)));
      label.hidden = !keep;
      if (keep) retained.push(bounds);
    }
  }, [isFullscreen, pinDisplayPositions, playback.activePinId, showPins, shownPagePins]);

  useEffect(() => {
    if (!campaign) return;
    const previousTitle = document.title;
    document.title = `${campaign.title} — ${t("pin.presentation.title")}`;
    return () => { document.title = previousTitle; };
  }, [campaign, locale, t]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      revealControls();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [revealControls]);

  const changePage = useCallback((pageIndex: number, showControls = true) => {
    const pageCount = campaign?.pages.length ?? 0;
    if (!pageCount) return;
    const next = Math.min(pageCount - 1, Math.max(0, pageIndex));
    if (next === activePageIndex) {
      if (showControls) revealControls();
      return;
    }
    setActivePageIndex(next);
    setStoredPlayback(EMPTY_PLAYBACK);
    setLivePinId(null);
    if (showControls) revealControls();
  }, [activePageIndex, campaign?.pages.length, revealControls]);

  useEffect(() => {
    const pageCount = campaign?.pages.length ?? 0;
    if (!campaign?.presentationAutoplay || pageCount < 2) return;
    const timeout = window.setTimeout(
      () => changePage((activePageIndex + 1) % pageCount, false),
      Math.max(PAGE_ROTATION_DELAY, pagePins.length * FEEDBACK_REVEAL_DELAY) + FEEDBACK_REVEAL_DELAY / 2
    );
    return () => window.clearTimeout(timeout);
  }, [activePageIndex, campaign?.pages.length, campaign?.presentationAutoplay, changePage, pagePins.length]);

  const toggleFullscreen = useCallback(async () => {
    setActionError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Feedback player fullscreen failed: ${detail}`, error);
      setActionError(t("pin.presentation.fullscreenError"));
      revealControls();
    }
  }, [revealControls, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button") && (event.key === " " || event.key === "Enter")) return;
      if (event.key.toLowerCase() === "p" && !event.repeat) {
        event.preventDefault();
        setShowPins((current) => !current);
        revealControls();
      } else if (event.key.toLowerCase() === "f" && !event.repeat) {
        event.preventDefault();
        revealControls();
        void toggleFullscreen();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        changePage(activePageIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        changePage(activePageIndex + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePageIndex, changePage, revealControls, toggleFullscreen]);

  if (!ready) return <main className="presentation-shell presentation-message"><span className="spinner" /></main>;
  if (!campaign) return <main className="presentation-shell presentation-message"><h1>{t("pin.presentation.notFound")}</h1><button className="presentation-text-button" onClick={() => router.push("/pin")}>{t("common.homeBack")}</button></main>;

  const stageRatio = activePage ? activePage.imageWidth / activePage.imageHeight : 16 / 9;
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/pin/join/${campaign.code}`;
  const closePresentation = () => {
    if (window.opener && !window.opener.closed) window.close();
    else router.push("/pin");
  };
  return (
    <main
      ref={stageRef}
      className={`presentation-shell pin-presentation-shell ${campaign.showPresentationQr ? `qr-${campaign.presentationQrPosition}` : ""} ${controlsVisible ? "controls-visible" : ""}`}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      <div className="presentation-slide pin-presentation-slide" aria-label={t("pin.presentation.imageAria", { title: campaign.title })}>
        <div ref={presentationCanvasRef} className="pin-presentation-canvas" style={{ maxWidth: `min(100vw, ${(stageRatio * 100).toFixed(1)}dvh)` }}>
          <ImageCanvas
            campaign={campaign}
            page={activePage}
            pins={showPins ? shownPagePins : []}
            pinDisplayPositions={showPins ? pinDisplayPositions : undefined}
            selectedId={showPins ? playback.activePinId : null}
            livePinId={showPins ? livePinId : null}
            onSelectPin={(id) => {
              setStoredPlayback((current) => ({ ...current, activePinId: id }));
              setLivePinId(null);
              revealControls();
            }}
            showLabels
            labelMode="always"
            labelContent="body"
          />
        </div>
      </div>
      <div className="pin-presentation-reactions" aria-hidden="true">
        {liveReactions.map((reaction) => <span
          key={reaction.id}
          className="slide-emoji-reaction campaign-live-reaction"
          style={{ left: `${reaction.left}%`, animationDelay: `${reaction.delay}ms` }}
        >{reaction.emoji}</span>)}
      </div>
      {pinMilestone !== null && <output className="pin-presentation-milestone" role="status" aria-live="polite" aria-atomic="true">{pinMilestone}!</output>}

      <button className="presentation-side-control previous" onClick={() => changePage(activePageIndex - 1)} disabled={activePageIndex <= 0} aria-label={t("pin.pages.previous")}><ChevronLeft /></button>
      <button className="presentation-side-control next" onClick={() => changePage(activePageIndex + 1)} disabled={activePageIndex >= campaign.pages.length - 1} aria-label={t("pin.pages.next")}><ChevronRight /></button>

      {campaign.showPresentationQr && <aside className={`presentation-join-qr ${campaign.presentationQrPosition}`} role="img" aria-label={`${t("pin.presentation.joinQrAria")} · ${campaign.code}`}>
        <QRCodeSVG value={joinUrl} size={108} bgColor="#ffffff" fgColor="#101827" level="M" />
        <div><span>{t("pin.presentation.scanToJoin")}</span><b>{campaign.code}</b></div>
      </aside>}
      {campaign.showPresentationPinStatus && <output
        className={`pin-presentation-status ${campaign.presentationPinStatusPosition}`}
        aria-label={t("pin.presentation.pinTotal", { count: visiblePins.length })}
      ><span>PIN</span><b>{String(visiblePins.length).padStart(2, "0")}</b></output>}

      <header className="presentation-topbar">
        <div className="presentation-title">
          <span className={`status-dot ${campaign.status}`} />
          <b>{campaign.title}</b>
          {actionError && <span className="presentation-error" role="alert">{actionError}</span>}
        </div>
        <div className="presentation-top-actions">
          <LanguageSwitcher />
          <button
            className={showPins ? "active" : ""}
            onClick={() => { setShowPins((current) => !current); revealControls(); }}
            aria-label={t(showPins ? "pin.presentation.hidePins" : "pin.presentation.showPins")}
            title={`${t(showPins ? "pin.presentation.hidePins" : "pin.presentation.showPins")} (P)`}
            aria-pressed={showPins}
          ><MapPin /></button>
          <button onClick={() => void toggleFullscreen()} aria-label={t(isFullscreen ? "pin.presentation.exitFullscreen" : "pin.presentation.startFullscreen")} title={`${t(isFullscreen ? "pin.presentation.exitFullscreen" : "pin.presentation.startFullscreen")} (F)`}>
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </button>
          <button onClick={closePresentation} aria-label={t("pin.presentation.close")} title={t("pin.presentation.close")}><X /></button>
        </div>
      </header>
    </main>
  );
}
