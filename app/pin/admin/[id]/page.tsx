"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { BarChart3, Check, Clock3, Copy, FileText, Link2, ListFilter, MessageCircleQuestion, MonitorUp, Pause, Play, Plus, QrCode, Search, Share2, Sparkles, Trash2, Users, X } from "@/components/icons";
import { PinAdminShell } from "@/components/pin/admin-shell";
import { CampaignPageNavigation } from "@/components/pin/campaign-page-navigation";
import { useCampaigns } from "@/components/pin/campaign-store";
import { ImageCanvas } from "@/components/pin/image-canvas";
import { useLanguage } from "@/components/language-context";
import { downloadPinsCsv } from "@/lib/pin/csv";
import { categoryBreakdown, countBy, hiddenPins, hotZone, latestPinAt, sentiment, topCategory, visiblePins } from "@/lib/pin/stats";
import { analyzedFeedbackCategories, configuredFeedbackCategories, configuredFeedbackCategoryLabel, enabledFeedbackCategories, FEEDBACK_CATEGORY_LABEL_MAX, FEEDBACK_CATEGORY_MAX, feedbackCategoryClass, isValidFeedbackCategorySettings, type FeedbackCategory, type FeedbackCategorySettings, type FeedbackPin } from "@/lib/pin/types";
import type { PresentationQrPosition } from "@/lib/types";

type CategoryFilter = FeedbackCategory | "all";

export default function CampaignResults() {
  const { feedbackCategoryLabel, feedbackZoneLabel, locale, t, timeAgo } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, campaigns, setAudienceGroups, setPageAudienceGroups, setPinHidden, setPresentationAutoplay, setPresentationPinStatusPosition, setPresentationQrPosition, setShowPresentationPinStatus, setStatus, setShowPresentationQr } = useCampaigns();
  const campaign = campaigns.find((item) => item.id === params.id);
  // 같은 핀을 다시 눌러도 목록을 또 중앙으로 보내려면 매번 새 객체여야 한다.
  const [selected, setSelected] = useState<{ id: string } | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingAudience, setSavingAudience] = useState(false);
  const [newAudienceName, setNewAudienceName] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(0);
  const selectedId = selected?.id ?? null;

  const pins = useMemo(() => campaign?.pins ?? [], [campaign]);
  const activePage = campaign?.pages[activePageIndex] ?? campaign?.pages[0];
  const pagePins = useMemo(() => pins.filter((pin) => pin.pageIndex === (activePage?.pageIndex ?? 0)), [activePage?.pageIndex, pins]);
  const visible = visiblePins(pins);
  const hidden = hiddenPins(pins);
  const pageVisible = visible.filter((pin) => pin.pageIndex === (activePage?.pageIndex ?? 0));
  const pageHidden = hidden.filter((pin) => pin.pageIndex === (activePage?.pageIndex ?? 0));
  const analysisCategoryKeys = campaign ? analyzedFeedbackCategories(campaign.feedbackCategories, pins) : [];
  const activeFilter = filter !== "all" && analysisCategoryKeys.includes(filter) ? filter : "all";
  const selectPin = (id: string) => {
    const pin = pins.find((item) => item.id === id);
    if (pin) setActivePageIndex(pin.pageIndex);
    setSelected({ id });
  };
  const changePage = (pageIndex: number) => {
    setActivePageIndex(pageIndex);
    setSelected(null);
  };
  const matched = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return pagePins.filter((pin) => (activeFilter === "all" || pin.category === activeFilter) && (!keyword || pin.body.toLowerCase().includes(keyword)));
  }, [activeFilter, pagePins, query]);
  const stagePins = useMemo(() => matched.filter((pin) => !pin.hidden), [matched]);
  const hiddenMatched = useMemo(() => matched.filter((pin) => pin.hidden), [matched]);
  const orderedMatched = useMemo(() => [...stagePins, ...hiddenMatched], [hiddenMatched, stagePins]);
  const listPins = showHidden ? orderedMatched : stagePins;

  const categories = categoryBreakdown(visible, analysisCategoryKeys);
  const top = topCategory(visible);
  const zone = hotZone(pageVisible);
  const latest = latestPinAt(pageVisible);
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

  const saveAudienceGroups = async (audienceGroups: string[]) => {
    if (!campaign || savingAudience) return false;
    setActionError(null);
    setSavingAudience(true);
    try {
      await setAudienceGroups(campaign.id, audienceGroups);
      return true;
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${t("pin.detail.groupSaveError")}: ${detail}`, error);
      setActionError(t("pin.detail.groupSaveError"));
      return false;
    } finally {
      setSavingAudience(false);
    }
  };

  const addAudience = async () => {
    if (!campaign) return;
    const name = newAudienceName.trim();
    if (!name || campaign.audienceGroups.some((group) => group.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setActionError(t(name ? "pin.detail.groupDuplicate" : "pin.detail.groupNameRequired"));
      return;
    }
    if (await saveAudienceGroups([...campaign.audienceGroups, name])) setNewAudienceName("");
  };

  const removeAudience = async (audienceGroup: string) => {
    if (!campaign || !window.confirm(t("pin.detail.groupDeleteConfirm", { group: audienceGroup }))) return;
    await saveAudienceGroups(campaign.audienceGroups.filter((group) => group !== audienceGroup));
  };

  const toggleAudience = async (audienceGroup: string) => {
    if (!campaign || !activePage || savingAudience) return;
    const audienceGroups = activePage.audienceGroups.includes(audienceGroup)
      ? activePage.audienceGroups.filter((group) => group !== audienceGroup)
      : [...activePage.audienceGroups, audienceGroup];
    setActionError(null);
    setSavingAudience(true);
    try {
      await setPageAudienceGroups(campaign.id, activePage.id, audienceGroups);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${t("pin.detail.audienceSaveError")}: ${detail}`, error);
      setActionError(t("pin.detail.audienceSaveError"));
    } finally {
      setSavingAudience(false);
    }
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
  if (!campaign) return <div className="empty-state"><h1>{t("pin.detail.notFound")}</h1><p>{t("pin.detail.notFoundDescription")}</p><button className="btn primary" onClick={() => router.push("/pin/admin")}>{t("pin.detail.campaignList")}</button></div>;

  const stageRatio = activePage ? activePage.imageWidth / activePage.imageHeight : 16 / 9;
  const qrPositions: PresentationQrPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const qrPositionLabel = (position: PresentationQrPosition) => position === "top-left"
    ? t("session.qrTopLeft")
    : position === "top-right"
      ? t("session.qrTopRight")
      : position === "bottom-left"
        ? t("session.qrBottomLeft")
        : t("session.qrBottomRight");
  const joinUrl = typeof window === "undefined" ? "" : `${window.location.origin}/pin/join/${campaign.code}`;
  const copy = async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const toggleHidden = (pin: FeedbackPin) => runAction(setPinHidden(campaign.id, pin.id, !pin.hidden), t(pin.hidden ? "pin.detail.restoreError" : "pin.detail.excludeError"));
  const categoryLabel = (category: FeedbackCategory) =>
    configuredFeedbackCategoryLabel(campaign.feedbackCategories, category, feedbackCategoryLabel);
  const categoryClass = (category: FeedbackCategory) => feedbackCategoryClass(campaign.feedbackCategories, category);
  const openPlayer = () => {
    setActionError(null);
    const player = window.open(`/pin/admin/${campaign.id}/present`, `pin-feedback-player-${campaign.id}`, "popup=yes,width=1440,height=900");
    if (!player) {
      setActionError(t("pin.detail.popupBlocked"));
      return;
    }
    player.focus();
  };

  return (
    <PinAdminShell>
      <div className="admin-page">
        <div className="page-head">
          <div>
            <h1>{campaign.title}</h1>
            <p>{campaign.guideText || t("pin.detail.defaultGuide")}</p>
          </div>
          <div className="top-actions">
            <span className={`live-badge ${campaign.status}`}><i />{t(campaign.status === "live" ? "pin.status.live" : "pin.status.ended")}</span>
            <button className="btn secondary" onClick={() => runAction(setStatus(campaign.id, campaign.status === "live" ? "ended" : "live"), t("pin.detail.saveStatusError"))}>{campaign.status === "live" ? <><Pause />{t("pin.detail.endCollection")}</> : <><Play />{t("pin.detail.reopen")}</>}</button>
            <button className="btn secondary" onClick={openPlayer}><MonitorUp />{t("pin.detail.openPlayer")}</button>
            <button className="btn secondary" onClick={() => router.push(`/pin/admin/${campaign.id}/report`)}><BarChart3 />{t("pin.detail.viewReport")}</button>
            {/* 화면에 보이는 것과 같은 것을 내보낸다. 숨김이 "공유 대상에서 뺀다"는 뜻인데
                내보내기에만 딸려 나오면 숨긴 의미가 없다. */}
            <button className="btn secondary" onClick={() => downloadPinsCsv(campaign, listPins, locale)} disabled={!listPins.length} title={t("pin.detail.csvTitle", { count: listPins.length })}><FileText />{t("pin.detail.csvExport")}</button>
            <button className="btn primary" onClick={() => setShareOpen(true)}><Share2 />{t("pin.detail.joinLink")}</button>
          </div>
        </div>
        {actionError && <div className="login-error" role="alert">{actionError} {t("common.tryAgain")}</div>}

        <section className="qr-position-setting pin-player-qr-setting pin-player-autoplay-setting" aria-labelledby="pin-player-autoplay-title">
          <div className="qr-position-heading">
            <span><Play /></span>
            <div><b id="pin-player-autoplay-title">{t("pin.presentation.autoplaySetting")}</b><small>{t("pin.presentation.autoplaySettingHint")}</small></div>
            <div className="panel-heading-actions">
              <span className="pin-toggle-label">{t("pin.presentation.autoplay")}</span>
              <button
                type="button"
                className={`pin-toggle ${campaign.presentationAutoplay ? "on" : ""}`}
                role="switch"
                aria-checked={campaign.presentationAutoplay}
                aria-label={t(campaign.presentationAutoplay ? "pin.presentation.disableAutoplay" : "pin.presentation.enableAutoplay")}
                onClick={() => runAction(
                  setPresentationAutoplay(campaign.id, !campaign.presentationAutoplay),
                  t("pin.presentation.saveAutoplayError")
                )}
              >
                <span className="pin-toggle-thumb" />
                <span className="pin-toggle-state">{campaign.presentationAutoplay ? "ON" : "OFF"}</span>
              </button>
            </div>
          </div>
        </section>

        <section className="qr-position-setting pin-player-qr-setting" aria-labelledby="pin-player-qr-title">
          <div className="qr-position-heading">
            <span><QrCode /></span>
            <div><b id="pin-player-qr-title">{t("session.qrPosition")}</b><small>{t("session.qrPositionHint")}</small></div>
            <div className="panel-heading-actions">
              <span className="pin-toggle-label">{t("presentation.showQr")}</span>
              <button
                type="button"
                className={`pin-toggle ${campaign.showPresentationQr ? "on" : ""}`}
                role="switch"
                aria-checked={campaign.showPresentationQr}
                aria-label={campaign.showPresentationQr ? t("presentation.turnQrOff") : t("presentation.turnQrOn")}
                onClick={() => runAction(
                  setShowPresentationQr(campaign.id, !campaign.showPresentationQr),
                  t("presentation.saveQrSettingError")
                )}
              >
                <span className="pin-toggle-thumb" />
                <span className="pin-toggle-state">{campaign.showPresentationQr ? "ON" : "OFF"}</span>
              </button>
            </div>
          </div>
          <div className="qr-position-options" role="group" aria-label={t("session.qrPosition")}>
            {qrPositions.map((position) => (
              <button
                type="button"
                key={position}
                className={campaign.presentationQrPosition === position ? "active" : ""}
                aria-pressed={campaign.presentationQrPosition === position}
                onClick={() => runAction(
                  setPresentationQrPosition(campaign.id, position),
                  t("session.saveQrPositionError")
                )}
              >
                <span className={`qr-corner-preview ${position}`} aria-hidden="true"><i /></span>
                {qrPositionLabel(position)}
              </button>
            ))}
          </div>
        </section>

        <section className="qr-position-setting pin-player-qr-setting" aria-labelledby="pin-player-status-title">
          <div className="qr-position-heading">
            <span><BarChart3 /></span>
            <div><b id="pin-player-status-title">{t("pin.presentation.pinStatusSetting")}</b><small>{t("pin.presentation.pinStatusSettingHint")}</small></div>
            <div className="panel-heading-actions">
              <span className="pin-toggle-label">{t("pin.presentation.showPinStatus")}</span>
              <button
                type="button"
                className={`pin-toggle ${campaign.showPresentationPinStatus ? "on" : ""}`}
                role="switch"
                aria-checked={campaign.showPresentationPinStatus}
                aria-label={t(campaign.showPresentationPinStatus ? "pin.presentation.hidePinStatus" : "pin.presentation.showPinStatus")}
                onClick={() => runAction(
                  setShowPresentationPinStatus(campaign.id, !campaign.showPresentationPinStatus),
                  t("pin.presentation.savePinStatusError")
                )}
              >
                <span className="pin-toggle-thumb" />
                <span className="pin-toggle-state">{campaign.showPresentationPinStatus ? "ON" : "OFF"}</span>
              </button>
            </div>
          </div>
          <div className="qr-position-options" role="group" aria-label={t("pin.presentation.pinStatusPosition")}>
            {qrPositions.map((position) => (
              <button
                type="button"
                key={position}
                className={campaign.presentationPinStatusPosition === position ? "active" : ""}
                aria-pressed={campaign.presentationPinStatusPosition === position}
                onClick={() => runAction(
                  setPresentationPinStatusPosition(campaign.id, position),
                  t("pin.presentation.savePinStatusPositionError")
                )}
              >
                <span className={`qr-corner-preview ${position}`} aria-hidden="true"><i /></span>
                {qrPositionLabel(position)}
              </button>
            ))}
          </div>
        </section>

        <FeedbackCategoryManager
          key={JSON.stringify(campaign.feedbackCategories)}
          campaignId={campaign.id}
          initialSettings={campaign.feedbackCategories}
          usedCategories={pins.map((pin) => pin.category)}
          onError={setActionError}
        />

        {/* 개선 항목만 세면 어느 행사든 "문제 투성이"로 읽힌다. 잘된 점을 같은 크기로 보여준다. */}
        <div className="kpi-grid">
          <Kpi label={t("pin.detail.collectedFeedback")} value={pins.length} hint={hidden.length ? t("pin.detail.visibleExcluded", { visible: visible.length, hidden: hidden.length }) : t("pin.detail.allVisible")} />
          <Kpi label={t("pin.detail.positiveRate")} value={mood.categorized ? `${mood.positiveShare}%` : "—"}
               hint={mood.categorized ? t("pin.detail.positiveHint", { positive: mood.positive, improvement: mood.improvement }) : t("pin.detail.positivePending")}
               tone={mood.categorized ? (mood.positiveShare >= 50 ? "success" : undefined) : undefined} />
          <Kpi label={t("pin.detail.topCategory")} value={top ? categoryLabel(top.key) : "—"} hint={top ? t("pin.detail.categoryHint", { count: top.count, percent: top.share }) : t("pin.detail.noCategory")} />
          <Kpi label={t("pin.detail.hotZone")} value={zone ? feedbackZoneLabel(zone.index) : "—"} hint={zone ? t("pin.detail.categoryHint", { count: zone.count, percent: zone.share }) : t("pin.detail.noZone")} />
        </div>

        <div className="filterbar">
          <div className="searchbox"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("pin.detail.searchFeedback")} /></div>
          <div className="filter-tabs">
            <button className={activeFilter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{t("common.all")} {pageVisible.length}</button>
            {analysisCategoryKeys.map((key) => <button key={key ?? "none"} className={activeFilter === key ? "active" : ""} onClick={() => setFilter(key)}>{categoryLabel(key)} {countBy(pageVisible, key)}</button>)}
          </div>
          <button className={`btn secondary pin-hidden-toggle ${showHidden ? "active" : ""}`} onClick={() => setShowHidden(!showHidden)} disabled={!pageHidden.length} aria-pressed={showHidden}><ListFilter />{t("pin.detail.showExcluded", { count: pageHidden.length })}</button>
        </div>

        <div className="pin-workspace">
          <section className="panel pin-stage-panel">
            <div className="panel-head">
              <div><h2>{t("pin.detail.mapTitle")}</h2><p>{t("pin.detail.mapDescription")}</p></div>
              <div className="pin-panel-page-tools"><CampaignPageNavigation pageIndex={activePageIndex} pageCount={campaign.pages.length} onChange={changePage} /><span className="panel-note"><Sparkles />{t("pin.detail.mapNote")}</span></div>
            </div>
            <div className="pin-audience-manager">
              <div><b>{t("pin.detail.groupTitle")}</b><small>{t("pin.detail.groupDescription")}</small></div>
              <form onSubmit={(event) => { event.preventDefault(); void addAudience(); }}>
                <input value={newAudienceName} onChange={(event) => setNewAudienceName(event.target.value)} maxLength={40} placeholder={t("pin.detail.groupPlaceholder")} aria-label={t("pin.detail.groupPlaceholder")} disabled={savingAudience || campaign.audienceGroups.length >= 20} />
                <button className="btn secondary" disabled={savingAudience || !newAudienceName.trim() || campaign.audienceGroups.length >= 20}>{t("pin.detail.groupAdd")}</button>
              </form>
              {campaign.audienceGroups.length > 0 && <div className="pin-audience-list" aria-label={t("pin.detail.groupTitle")}>
                {campaign.audienceGroups.map((group) => <span key={group}>{group}<button onClick={() => void removeAudience(group)} disabled={savingAudience} aria-label={t("pin.detail.groupDelete", { group })}><X /></button></span>)}
              </div>}
            </div>
            {activePage && <div className="pin-audience-setting">
              <div><b>{t("pin.detail.audienceTitle")}</b><small>{!campaign.audienceGroups.length ? t("pin.detail.audienceUnconfigured") : activePage.audienceGroups.length ? t("pin.detail.audienceDescription") : t("pin.detail.audienceAdminOnly")}</small></div>
              {campaign.audienceGroups.length > 0 && <div role="group" aria-label={t("pin.detail.audienceTitle")}>
                {campaign.audienceGroups.map((group) => <button key={group} className={activePage.audienceGroups.includes(group) ? "active" : ""} aria-pressed={activePage.audienceGroups.includes(group)} disabled={savingAudience} onClick={() => void toggleAudience(group)}>{activePage.audienceGroups.includes(group) && <Check />}{group}</button>)}
              </div>}
            </div>}
            {/* 캔버스는 폭 100%에 원본 비율이라, 세로 사진이면 화면을 넘긴다. 비율로 폭을 눌러 높이를 잡는다. */}
            <div className="pin-stage" style={{ maxWidth: `min(100%, calc(58dvh * ${stageRatio.toFixed(3)}))` }}>
              <ImageCanvas campaign={campaign} page={activePage} pins={stagePins} selectedId={selectedId} onSelectPin={selectPin} showLabels labelMode="selected" />
            </div>
          </section>

          <aside className="panel pin-list-panel">
            <div className="panel-head">
              <div><h2>{t("pin.detail.listTitle")}</h2><p>{latest ? t("pin.detail.listSummaryLatest", { count: listPins.length, time: timeAgo(latest) }) : t("pin.detail.listSummary", { count: listPins.length })}</p></div>
            </div>
            <div className="pin-feed" ref={listRef}>
              {listPins.length ? listPins.map((pin) => (
                <PinItem
                  key={pin.id}
                  pin={pin}
                  selected={selectedId === pin.id}
                  onSelect={() => selectPin(pin.id)}
                  onToggleHidden={() => toggleHidden(pin)}
                  categoryLabel={categoryLabel}
                  categoryClass={categoryClass}
                />
              )) : (
                <div className="panel-empty">
                  <MessageCircleQuestion />
                  <b>{t(pagePins.length ? "pin.detail.noMatch" : "pin.detail.none")}</b>
                  <span>{t(pagePins.length ? "pin.detail.changeFilters" : "pin.detail.emptyHint")}</span>
                </div>
              )}
            </div>
          </aside>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>{t("pin.detail.distributionTitle")}</h2><p>{t("pin.detail.distributionBasis", { count: visible.length })}</p></div><span className="panel-note"><BarChart3 />{t("pin.detail.distributionNote")}</span></div>
          {maxCategory ? (
            <ul className="cat-list">
              {categories.filter((item) => item.count).map((item) => (
                <li key={item.key ?? "none"}>
                  <span className="cat-head"><em className={`pin-category ${categoryClass(item.key)}`}>{categoryLabel(item.key)}</em><b>{t("pin.detail.categoryStat", { count: item.count, percent: item.share })}</b></span>
                  <span className="cat-track"><i className={`cat-fill ${categoryClass(item.key)}`} style={{ width: `${(item.count / maxCategory) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <div className="panel-empty"><MessageCircleQuestion /><b>{t("pin.detail.noAggregate")}</b><span>{t("pin.detail.aggregateHint")}</span></div>}
        </section>
      </div>

    {shareOpen && <div className="modal-backdrop" onMouseDown={() => setShareOpen(false)}><div className="share-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShareOpen(false)} aria-label={t("pin.admin.close")}><X /></button><div className="modal-icon"><Users /></div><h2>{t("pin.admin.shareTitle")}</h2><p>{campaign.status === "live" ? <>{t("pin.admin.shareDescription1")}<br />{t("pin.detail.shareLiveDescription2")}</> : <>{t("pin.detail.shareEndedDescription1")}<br />{t("pin.detail.shareEndedDescription2")}</>}</p><div className="qr-frame"><QRCodeSVG value={joinUrl} size={180} fgColor="#171D26" /></div><div className="session-code"><span>{t("pin.admin.joinCode")}</span><b>{campaign.code}</b></div><div className="link-copy"><Link2 /><span>{joinUrl}</span><button onClick={copy} aria-label={t("pin.admin.copyJoinLink")}>{copied ? <Check /> : <Copy />}</button></div><button className="btn primary large full" onClick={copy}>{copied ? <><Check />{t("pin.admin.copied")}</> : <><Copy />{t("pin.admin.copyJoinLink")}</>}</button></div></div>}
    </PinAdminShell>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone?: "warning" | "success" }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className={`kpi-value ${tone ?? ""}`}>{value}</b><small>{hint}</small></div>;
}

function FeedbackCategoryManager({ campaignId, initialSettings, usedCategories, onError }: { campaignId: string; initialSettings: FeedbackCategorySettings; usedCategories: FeedbackCategory[]; onError: (message: string | null) => void }) {
  const { feedbackCategoryLabel, t } = useLanguage();
  const { setFeedbackCategories } = useCampaigns();
  const [settings, setSettings] = useState(initialSettings);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const categories = configuredFeedbackCategories(settings);
  const activeCategories = enabledFeedbackCategories(settings);
  const categoryLabel = (category: string) => configuredFeedbackCategoryLabel(settings, category, feedbackCategoryLabel);

  const addCategory = () => {
    const label = newCategory.trim();
    if (!label) return;
    if (categories.length >= FEEDBACK_CATEGORY_MAX) {
      onError(t("pin.detail.categoryLimit", { count: FEEDBACK_CATEGORY_MAX }));
      return;
    }
    const existing = Object.keys(settings).find((key) => categoryLabel(key).toLocaleLowerCase() === label.toLocaleLowerCase());
    if (existing && !settings[existing].archived) {
      onError(t("pin.detail.categoryDuplicate"));
      return;
    }
    setSettings((current) => existing
      ? { ...current, [existing]: { ...current[existing], enabled: true, archived: false } }
      : { ...current, [`custom-${crypto.randomUUID()}`]: { label, enabled: true, archived: false } });
    setNewCategory("");
    onError(null);
  };

  const deleteCategory = (key: string) => {
    setSettings((current) => {
      if (usedCategories.includes(key)) return { ...current, [key]: { ...current[key], enabled: false, archived: true } };
      const next = { ...current };
      delete next[key];
      return next;
    });
    onError(null);
  };

  const save = async () => {
    if (saving) return;
    const next = Object.fromEntries(Object.entries(settings).map(([key, setting]) => [key, { ...setting, label: setting.label.trim() }]));
    if (!isValidFeedbackCategorySettings(next)) {
      onError(t("pin.detail.categoryNameRequired"));
      return;
    }
    onError(null);
    setSaving(true);
    try {
      await setFeedbackCategories(campaignId, next);
      setSettings(next);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      console.error(`${t("pin.detail.categorySaveError")}: ${detail}`, error);
      onError(t("pin.detail.categorySaveError"));
    } finally {
      setSaving(false);
    }
  };

  return <section className="pin-category-manager" aria-labelledby="pin-category-manager-title">
    <div className="pin-category-manager-head">
      <div><b id="pin-category-manager-title">{t("pin.detail.categoryManagerTitle")}</b><small>{t("pin.detail.categoryManagerDescription")}</small></div>
      <button type="button" className="btn primary" onClick={() => void save()} disabled={saving}>{saving ? <span className="spinner" /> : <Check />}{t(saving ? "pin.detail.categorySaving" : "pin.detail.categorySave")}</button>
    </div>
    <form className="pin-category-add" onSubmit={(event) => { event.preventDefault(); addCategory(); }}>
      <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={FEEDBACK_CATEGORY_LABEL_MAX} placeholder={t("pin.detail.categoryAddPlaceholder")} aria-label={t("pin.detail.categoryAddPlaceholder")} disabled={saving || categories.length >= FEEDBACK_CATEGORY_MAX} />
      <button className="btn secondary" disabled={saving || !newCategory.trim() || categories.length >= FEEDBACK_CATEGORY_MAX}><Plus />{t("pin.detail.categoryAdd")}</button>
    </form>
    {categories.length ? <div className="pin-category-manager-list">
      {categories.map((key) => <div className={`pin-category-manager-row ${settings[key].enabled ? "" : "disabled"}`} key={key}>
        <div className="pin-category-manager-row-head">
          <span className={`pin-category ${feedbackCategoryClass(settings, key)}`}>{categoryLabel(key)}</span>
          <label><input type="checkbox" checked={settings[key].enabled} onChange={(event) => setSettings((current) => ({ ...current, [key]: { ...current[key], enabled: event.target.checked } }))} aria-label={t("pin.detail.categoryUseAria", { category: categoryLabel(key) })} disabled={saving} />{t("pin.detail.categoryUse")}</label>
        </div>
        <label>
          <span>{t("pin.detail.categoryDisplayName")}</span>
          <input value={settings[key].label} onChange={(event) => setSettings((current) => ({ ...current, [key]: { ...current[key], label: event.target.value } }))} maxLength={FEEDBACK_CATEGORY_LABEL_MAX} placeholder={categoryLabel(key)} aria-label={t("pin.detail.categoryDisplayNameAria", { category: categoryLabel(key) })} disabled={saving} />
        </label>
        <button type="button" className="icon-btn category-delete" onClick={() => deleteCategory(key)} aria-label={t("pin.detail.categoryDelete", { category: categoryLabel(key) })} disabled={saving}><Trash2 /></button>
      </div>)}
    </div> : <div className="pin-category-none"><b>{t("pin.detail.categoryNoneTitle")}</b><span>{t("pin.detail.categoryNoneDescription")}</span></div>}
    <p>{t(activeCategories.length ? "pin.detail.categoryEnabledHint" : "pin.detail.categoryDisabledHint")}</p>
  </section>;
}

function PinItem({ pin, selected, onSelect, onToggleHidden, categoryLabel, categoryClass }: { pin: FeedbackPin; selected: boolean; onSelect: () => void; onToggleHidden: () => void; categoryLabel: (category: FeedbackCategory) => string; categoryClass: (category: FeedbackCategory) => string }) {
  const { t, timeAgo } = useLanguage();
  return (
    <div className={`question-card pin-item ${selected ? "selected" : ""}`} data-pin-id={pin.id}>
      <button className="pin-item-main" onClick={onSelect} aria-pressed={selected}>
        <span className="question-meta">
          <span className="question-copy">
            <em className={`pin-category ${categoryClass(pin.category)}`}>{categoryLabel(pin.category)}</em>
            <p>{pin.body}</p>
          </span>
          <span className="question-time"><Clock3 />{timeAgo(pin.createdAt)}</span>
        </span>
      </button>
      <div className="pin-item-foot">
        <span className="muted">{t("pin.detail.position", { x: Math.round(pin.x * 100), y: Math.round(pin.y * 100) })}</span>
        <button className="btn tertiary" onClick={onToggleHidden}>{pin.hidden ? <><Check />{t("pin.detail.restore")}</> : <><X />{t("pin.detail.exclude")}</>}</button>
      </div>
    </div>
  );
}
