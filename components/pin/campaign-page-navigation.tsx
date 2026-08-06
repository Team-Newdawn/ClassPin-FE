"use client";

import { ChevronLeft, ChevronRight } from "@/components/icons";
import { useLanguage } from "@/components/language-context";

export function CampaignPageNavigation({ pageIndex, pageCount, onChange, className = "" }: {
  pageIndex: number;
  pageCount: number;
  onChange: (pageIndex: number) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  if (pageCount <= 1) return null;
  return (
    <nav className={`pin-page-navigation ${className}`.trim()} aria-label={t("pin.pages.navigation")}>
      <button type="button" onClick={() => onChange(pageIndex - 1)} disabled={pageIndex <= 0} aria-label={t("pin.pages.previous")}><ChevronLeft /></button>
      <span>{t("pin.pages.position", { current: pageIndex + 1, total: pageCount })}</span>
      <button type="button" onClick={() => onChange(pageIndex + 1)} disabled={pageIndex >= pageCount - 1} aria-label={t("pin.pages.next")}><ChevronRight /></button>
    </nav>
  );
}
