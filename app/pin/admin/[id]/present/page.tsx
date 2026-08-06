"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, ChevronRight, Clock3, MapPin, Maximize2, Minimize2, X } from "@/components/icons";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { useCampaigns } from "@/components/pin/campaign-store";
import { ImageCanvas } from "@/components/pin/image-canvas";
import { reconcileFeedbackRotation, shuffle } from "@/lib/pin/presentation-rotation";

const CONTROLS_HIDE_DELAY = 2800;
const FEEDBACK_ROTATION_DELAY = 2000;
const PAGE_ROTATION_DELAY = 8000;

export default function FeedbackPresentation() {
  const { feedbackCategoryLabel, locale, t, timeAgo } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { campaigns, ready } = useCampaigns();
  const campaign = campaigns.find((item) => item.id === params.id);
  const visiblePins = useMemo(() => campaign?.pins.filter((pin) => !pin.hidden) ?? [], [campaign]);
  const visiblePinIds = useMemo(() => visiblePins.map((pin) => pin.id), [visiblePins]);
  const visiblePinKey = visiblePinIds.join("|");
  const stageRef = useRef<HTMLElement>(null);
  const visiblePinIdsRef = useRef<string[]>([]);
  const campaignIdRef = useRef<string | null>(null);
  const rotationQueueRef = useRef<string[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [shownPinIds, setShownPinIds] = useState<string[]>([]);
  const [rotationCycle, setRotationCycle] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);

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

  // Realtime 으로 새 핀이 들어오면 자동 재생 차례를 기다리지 않고 해당 페이지로 이동한다.
  // 첫 스냅샷은 새 핀으로 보지 않아 플레이어가 항상 첫 페이지부터 시작한다.
  useEffect(() => {
    if (!campaign) return;
    const previousIds = visiblePinIdsRef.current;
    visiblePinIdsRef.current = visiblePinIds;
    const firstSnapshot = campaignIdRef.current !== campaign.id;
    campaignIdRef.current = campaign.id;
    const incomingPin = firstSnapshot ? null : shuffle(visiblePins.filter((pin) => !previousIds.includes(pin.id)))[0];
    const nextPageIndex = incomingPin?.pageIndex ?? (firstSnapshot ? 0 : activePageIndex);
    const pageIds = visiblePins.filter((pin) => pin.pageIndex === nextPageIndex).map((pin) => pin.id);
    const rotation = reconcileFeedbackRotation({
      previousIds: pageIds,
      visibleIds: pageIds,
      currentId: incomingPin?.id ?? (firstSnapshot ? null : activePinId)
    });
    const retained = firstSnapshot || (incomingPin && nextPageIndex !== activePageIndex)
      ? []
      : shownPinIds.filter((id) => pageIds.includes(id));
    const nextShown = rotation.activeId && !retained.includes(rotation.activeId) ? [...retained, rotation.activeId] : retained;
    setActivePageIndex(nextPageIndex);
    setActivePinId(rotation.activeId);
    setShownPinIds(nextShown);
    rotationQueueRef.current = shuffle(pageIds.filter((id) => !nextShown.includes(id)));
    setRotationCycle((current) => current + 1);
    // id 집합이 같으면 본문 수정만으로 순환 타이머를 다시 시작하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, visiblePinKey]);

  const activePage = campaign?.pages[activePageIndex] ?? campaign?.pages[0];
  const pagePins = useMemo(
    () => visiblePins.filter((pin) => pin.pageIndex === (activePage?.pageIndex ?? 0)),
    [activePage?.pageIndex, visiblePins]
  );
  const pagePinIds = useMemo(() => pagePins.map((pin) => pin.id), [pagePins]);
  const shownPagePins = useMemo(() => pagePins.filter((pin) => shownPinIds.includes(pin.id)), [pagePins, shownPinIds]);

  const rotateFeedback = useCallback(() => {
    let queue = rotationQueueRef.current.filter((id) => pagePinIds.includes(id) && id !== activePinId);
    if (!queue.length) queue = shuffle(pagePinIds.filter((id) => id !== activePinId));
    const next = queue.shift() ?? pagePinIds[0] ?? null;
    rotationQueueRef.current = queue;
    setActivePinId(next);
    if (next) setShownPinIds((current) => current.includes(next) ? current : [...current, next]);
    // 한 건뿐이어도 같은 태그가 다시 등장하는 애니메이션을 재생한다.
    setRotationCycle((current) => current + 1);
  }, [activePinId, pagePinIds]);

  useEffect(() => {
    if (!pagePinIds.length) return;
    const interval = window.setInterval(rotateFeedback, FEEDBACK_ROTATION_DELAY);
    return () => window.clearInterval(interval);
  }, [pagePinIds.length, rotateFeedback]);

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

  const activePin = shownPagePins.find((pin) => pin.id === activePinId) ?? null;

  const changePage = useCallback((pageIndex: number, showControls = true) => {
    const pageCount = campaign?.pages.length ?? 0;
    if (!pageCount) return;
    const next = Math.min(pageCount - 1, Math.max(0, pageIndex));
    const nextPage = campaign?.pages[next];
    const [nextPinId, ...queue] = shuffle(visiblePins.filter((pin) => pin.pageIndex === nextPage?.pageIndex).map((pin) => pin.id));
    setActivePageIndex(next);
    setActivePinId(nextPinId ?? null);
    setShownPinIds(nextPinId ? [nextPinId] : []);
    rotationQueueRef.current = queue;
    setRotationCycle((current) => current + 1);
    if (showControls) revealControls();
  }, [campaign?.pages, revealControls, visiblePins]);

  useEffect(() => {
    const pageCount = campaign?.pages.length ?? 0;
    if (pageCount < 2) return;
    const interval = window.setInterval(
      () => changePage((activePageIndex + 1) % pageCount, false),
      PAGE_ROTATION_DELAY
    );
    return () => window.clearInterval(interval);
  }, [activePageIndex, campaign?.pages.length, changePage]);

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
  if (!campaign) return <main className="presentation-shell presentation-message"><h1>{t("pin.presentation.notFound")}</h1><button className="presentation-text-button" onClick={() => router.push("/pin/admin")}>{t("pin.detail.campaignList")}</button></main>;

  const stageRatio = activePage ? activePage.imageWidth / activePage.imageHeight : 16 / 9;
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/pin/join/${campaign.code}`;
  const closePresentation = () => {
    if (window.opener && !window.opener.closed) window.close();
    else router.push(`/pin/admin/${campaign.id}`);
  };

  return (
    <main
      ref={stageRef}
      className={`presentation-shell pin-presentation-shell qr-bottom-right ${controlsVisible ? "controls-visible" : ""}`}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      <div className="presentation-slide pin-presentation-slide" aria-label={t("pin.presentation.imageAria", { title: campaign.title })}>
        <div className="pin-presentation-canvas" style={{ maxWidth: `min(88vw, calc((100dvh - var(--pin-presentation-safe-height)) * ${stageRatio.toFixed(3)}))` }}>
          <ImageCanvas
            campaign={campaign}
            page={activePage}
            pins={showPins ? shownPagePins : []}
            selectedId={showPins ? activePinId : null}
            onSelectPin={(id) => {
              setActivePinId(id);
              rotationQueueRef.current = rotationQueueRef.current.filter((queuedId) => queuedId !== id);
              setRotationCycle((current) => current + 1);
              revealControls();
            }}
            showLabels
            labelMode="selected"
            labelContent="body"
          />
        </div>
      </div>

      <button className="presentation-side-control previous" onClick={() => changePage(activePageIndex - 1)} disabled={activePageIndex <= 0} aria-label={t("pin.pages.previous")}><ChevronLeft /></button>
      <button className="presentation-side-control next" onClick={() => changePage(activePageIndex + 1)} disabled={activePageIndex >= campaign.pages.length - 1} aria-label={t("pin.pages.next")}><ChevronRight /></button>

      <aside className="presentation-join-qr bottom-right" role="img" aria-label={`${t("pin.presentation.joinQrAria")} · ${campaign.code}`}>
        <QRCodeSVG value={joinUrl} size={108} bgColor="#ffffff" fgColor="#101827" level="M" />
        <div><span>{t("pin.presentation.scanToJoin")}</span><b>{campaign.code}</b></div>
      </aside>

      <header className="presentation-topbar">
        <div className="presentation-title">
          <span className={`status-dot ${campaign.status}`} />
          <b>{campaign.title}</b>
          <span className="pin-presentation-count">{t("pin.presentation.feedbackCount", { count: visiblePins.length })}</span>
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

      {showPins && activePin ? (
        <aside key={`${activePin.id}-${rotationCycle}`} className={`pin-presentation-feedback ${activePin.category}`} aria-live="polite">
          <div>
            <span className="pin-presentation-feedback-meta"><em className={`pin-category ${activePin.category}`}>{feedbackCategoryLabel(activePin.category)}</em><time><Clock3 />{timeAgo(activePin.createdAt)}</time></span>
            <p>{activePin.body}</p>
          </div>
        </aside>
      ) : showPins ? <p className="pin-presentation-empty" role="status">{t("pin.presentation.empty")}</p> : null}

      <footer className="presentation-footer">
        {actionError && <span className="presentation-error" role="alert">{actionError}</span>}
        {campaign.pages.length > 1 && <span className="presentation-page">{t("pin.pages.position", { current: activePageIndex + 1, total: campaign.pages.length })}</span>}
        <span className="presentation-hint">{t("pin.presentation.hint")}</span>
      </footer>
    </main>
  );
}
