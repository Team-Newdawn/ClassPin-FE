"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Sparkles } from "@/app/component/icons";
import { useAiReportHistoryController } from "../controller";

export function AiReportSpotlight({ folderId, expectedSlideCount }: {
  folderId: string | null;
  expectedSlideCount: number;
}) {
  const { t, configured, reports, loading } = useAiReportHistoryController();
  if (!configured || loading || !folderId || expectedSlideCount < 1) return null;

  const report = reports.find((item) => (
    item.folderId === folderId
    && item.slideCount === expectedSlideCount
    && (item.productStatus === "ready" || item.productStatus === "confirmed")
  ));
  if (!report) return null;

  return (
    <section className="ai-report-spotlight" aria-labelledby="ai-report-spotlight-title">
      <div className="ai-report-spotlight-icon"><Sparkles /></div>
      <div className="ai-report-spotlight-copy">
        <span>{t("aiReport.folderSpotlightEyebrow")}</span>
        <h2 id="ai-report-spotlight-title">{t("aiReport.folderSpotlightTitle")}</h2>
        <p>{t("aiReport.folderSpotlightDescription", { slides: report.slideCount, questions: report.questionCount })}</p>
        <div className="ai-report-spotlight-features" aria-label={t("aiReport.folderSpotlightFeaturesLabel")}>
          <em><Sparkles />{t("aiReport.folderSpotlightSegmentation")}</em>
          <em><MapPin />{t("aiReport.folderSpotlightPinMapping")}</em>
          <em>{report.slideCount}/{expectedSlideCount} {t("aiReport.slides")}</em>
        </div>
      </div>
      <Link className="btn primary ai-report-spotlight-link" href={`/admin/ai-reports/${report.id}`}>
        {t("aiReport.folderSpotlightOpen")}<ArrowRight />
      </Link>
    </section>
  );
}
