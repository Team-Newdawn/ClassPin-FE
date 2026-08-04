"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-context";

export function PinLocaleDocumentTitle() {
  const pathname = usePathname();
  const { t } = useLanguage();

  useEffect(() => {
    if (pathname.endsWith("/present")) return;
    document.title = `Pin — ${t("pin.brand.tagline")}`;
  }, [pathname, t]);

  return null;
}
