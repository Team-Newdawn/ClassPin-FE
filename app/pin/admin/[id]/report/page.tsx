"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BarChart3, ChevronLeft, FileText, MessageCircleQuestion } from "@/components/icons";
import { useLanguage } from "@/components/language-context";
import { PinAdminShell } from "@/components/pin/admin-shell";
import { CampaignPageNavigation } from "@/components/pin/campaign-page-navigation";
import { useCampaigns } from "@/components/pin/campaign-store";
import { ImageCanvas } from "@/components/pin/image-canvas";
import { buildReportSignals, type ReportSignalCategory } from "@/lib/pin/report";
import { categoryBreakdown, hotZone, sentiment, topCategory, visiblePins } from "@/lib/pin/stats";
import { analyzedFeedbackCategories, configuredFeedbackCategoryLabel, feedbackCategoryClass, type FeedbackCategory } from "@/lib/pin/types";

export default function CampaignReport() {
  const { feedbackCategoryLabel, feedbackZoneLabel, t } = useLanguage();
  const params = useParams<{ id: string }>();
  const { campaigns, ready } = useCampaigns();
  const campaign = campaigns.find((item) => item.id === params.id);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const visible = useMemo(() => visiblePins(campaign?.pins ?? []), [campaign]);
  const activePage = campaign?.pages[activePageIndex] ?? campaign?.pages[0];
  const pagePins = visible.filter((pin) => pin.pageIndex === (activePage?.pageIndex ?? 0));
  const analysisCategoryKeys = campaign ? analyzedFeedbackCategories(campaign.feedbackCategories, visible) : [];
  const categories = categoryBreakdown(visible, analysisCategoryKeys);
  const mood = sentiment(visible);
  const top = topCategory(visible);
  const zone = hotZone(pagePins);
  const signals = buildReportSignals(campaign?.pins ?? []);
  const praise = visible.filter((pin) => pin.category === "praise");
  const pagesWithFeedback = new Set(visible.map((pin) => pin.pageIndex)).size;
  if (!ready) return <div className="loading-screen"><span className="spinner dark" /></div>;
  if (!campaign) return <div className="empty-state"><h1>{t("pin.detail.notFound")}</h1><p>{t("pin.detail.notFoundDescription")}</p><Link className="btn primary" href="/pin/admin">{t("pin.detail.campaignList")}</Link></div>;

  const categoryLabel = (category: FeedbackCategory) =>
    configuredFeedbackCategoryLabel(campaign.feedbackCategories, category, feedbackCategoryLabel);
  const categoryClass = (category: FeedbackCategory) => feedbackCategoryClass(campaign.feedbackCategories, category);

  const signalCopy = (key: ReportSignalCategory) => {
    if (key === "bug") return { title: t("pin.report.signalBugTitle"), body: t("pin.report.signalBugBody") };
    if (key === "confusing") return { title: t("pin.report.signalConfusingTitle"), body: t("pin.report.signalConfusingBody") };
    if (key === "improve") return { title: t("pin.report.signalImproveTitle"), body: t("pin.report.signalImproveBody") };
    return { title: t("pin.report.signalIdeaTitle"), body: t("pin.report.signalIdeaBody") };
  };

  return (
    <PinAdminShell>
      <article className="admin-page pin-report-page">
        <header className="page-head pin-report-head">
          <div>
            <span className="eyebrow">{t("pin.report.eyebrow")}</span>
            <h1>{campaign.title}</h1>
            <p>{campaign.guideText || t("pin.detail.defaultGuide")}</p>
          </div>
          <div className="top-actions pin-report-screen-only">
            <Link className="btn secondary" href={`/pin/admin/${campaign.id}`}><ChevronLeft />{t("pin.report.back")}</Link>
            <button className="btn primary" onClick={() => window.print()}><FileText />{t("pin.report.print")}</button>
          </div>
        </header>

        <section className="panel pin-report-image-panel" aria-labelledby="pin-report-image-title">
          <div className="panel-head">
            <div><h2 id="pin-report-image-title">{t("pin.report.referenceImage")}</h2><p>{t("pin.report.referenceDescription", { count: pagePins.length })}</p></div>
            <CampaignPageNavigation pageIndex={activePageIndex} pageCount={campaign.pages.length} onChange={setActivePageIndex} />
          </div>
          <div className="pin-report-image">
            <ImageCanvas campaign={campaign} page={activePage} pins={pagePins} />
          </div>
        </section>

        <section aria-labelledby="pin-report-summary-title">
          <div className="pin-report-section-head">
            <div><h2 id="pin-report-summary-title">{t("pin.report.summary")}</h2><p>{t("pin.report.summaryDescription")}</p></div>
            <span>{t("pin.report.excludedNote")}</span>
          </div>
          <div className="kpi-grid">
            <Kpi label={t("pin.report.analyzedFeedback")} value={visible.length} hint={t("pin.report.feedbackPages", { count: pagesWithFeedback })} />
            <Kpi label={t("pin.detail.positiveRate")} value={mood.categorized ? `${mood.positiveShare}%` : "—"} hint={t("pin.detail.positiveHint", { positive: mood.positive, improvement: mood.improvement })} tone={mood.categorized && mood.positiveShare >= 50 ? "success" : undefined} />
            <Kpi label={t("pin.detail.topCategory")} value={top ? categoryLabel(top.key) : "—"} hint={top ? t("pin.detail.categoryHint", { count: top.count, percent: top.share }) : t("pin.detail.noCategory")} />
            <Kpi label={t("pin.detail.hotZone")} value={zone ? feedbackZoneLabel(zone.index) : "—"} hint={zone ? t("pin.detail.categoryHint", { count: zone.count, percent: zone.share }) : t("pin.detail.noZone")} />
          </div>
          {visible.length > 0 && visible.length < 3 && <p className="pin-report-caution">{t("pin.report.smallSample")}</p>}
        </section>

        <div className="section-grid pin-report-overview">
          <section className="panel">
            <div className="panel-head"><div><h2>{t("pin.detail.distributionTitle")}</h2><p>{t("pin.detail.distributionBasis", { count: visible.length })}</p></div><BarChart3 /></div>
            {categories.some((item) => item.count) ? <ul className="cat-list">
              {categories.filter((item) => item.count).map((item) => <li key={item.key ?? "none"}>
                <span className="cat-head"><em className={`pin-category ${categoryClass(item.key)}`}>{categoryLabel(item.key)}</em><b>{t("pin.detail.categoryStat", { count: item.count, percent: item.share })}</b></span>
                <span className="cat-track"><i className={`cat-fill ${categoryClass(item.key)}`} style={{ width: `${item.share}%` }} /></span>
              </li>)}
            </ul> : <ReportEmpty title={t("pin.detail.noAggregate")} body={t("pin.detail.aggregateHint")} />}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h2>{t("pin.report.keep")}</h2><p>{t("pin.report.keepDescription")}</p></div></div>
            {praise.length ? <ul className="pin-report-quote-list">
              {praise.slice(0, 5).map((pin) => <li key={pin.id}><span>{t("pin.pages.position", { current: pin.pageIndex + 1, total: campaign.pages.length })}</span><p>{pin.body}</p></li>)}
            </ul> : <ReportEmpty title={t("pin.report.noPraise")} body={t("pin.report.noPraiseHint")} />}
          </section>
        </div>

        <section className="panel" aria-labelledby="pin-report-priority-title">
          <div className="panel-head"><div><h2 id="pin-report-priority-title">{t("pin.report.priority")}</h2><p>{t("pin.report.priorityDescription")}</p></div></div>
          {signals.length ? <ol className="pin-report-signal-list">
            {signals.map((signal, index) => {
              const copy = signalCopy(signal.key);
              return <li key={signal.key} className={`pin-report-signal ${signal.key}`}>
                <span className="pin-report-rank">{index + 1}</span>
                <div>
                  <span className="pin-report-signal-meta"><em className={`pin-category ${categoryClass(signal.key)}`}>{categoryLabel(signal.key)}</em>{t("pin.report.signalCount", { count: signal.pins.length, percent: signal.share })}</span>
                  <h3>{copy.title}</h3>
                  <p>{copy.body}</p>
                  <ul>{signal.pins.slice(0, 3).map((pin) => <li key={pin.id}><b>{t("pin.pages.position", { current: pin.pageIndex + 1, total: campaign.pages.length })}</b>{pin.body}</li>)}</ul>
                </div>
              </li>;
            })}
          </ol> : <ReportEmpty title={t("pin.report.noImprovement")} body={t("pin.report.noImprovementHint")} />}
        </section>

        <section className="panel" aria-labelledby="pin-report-evidence-title">
          <div className="panel-head"><div><h2 id="pin-report-evidence-title">{t("pin.report.evidence")}</h2><p>{t("pin.report.evidenceDescription")}</p></div></div>
          {visible.length ? <div className="pin-report-evidence">
            {analysisCategoryKeys.map((category) => {
              const matching = visible.filter((pin) => pin.category === category);
              if (!matching.length) return null;
              return <section key={category ?? "none"}>
                <h3><em className={`pin-category ${categoryClass(category)}`}>{categoryLabel(category)}</em><span>{t("pin.report.feedbackCount", { count: matching.length })}</span></h3>
                <ol>{matching.map((pin) => <li key={pin.id}>
                  <span>{t("pin.pages.position", { current: pin.pageIndex + 1, total: campaign.pages.length })}</span>
                  <p>{pin.body}</p>
                </li>)}</ol>
              </section>;
            })}
          </div> : <ReportEmpty title={t("pin.detail.none")} body={t("pin.detail.emptyHint")} />}
        </section>
      </article>
    </PinAdminShell>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone?: "success" }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><b className={`kpi-value ${tone ?? ""}`}>{value}</b><small>{hint}</small></div>;
}

function ReportEmpty({ title, body }: { title: string; body: string }) {
  return <div className="panel-empty"><MessageCircleQuestion /><b>{title}</b><span>{body}</span></div>;
}
