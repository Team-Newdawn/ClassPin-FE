"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-context";

export function PinLogo({ compact = false, href = "/", product = "Class", label }: {
  compact?: boolean;
  href?: string;
  product?: string;
  label?: string;
}) {
  const { t } = useLanguage();
  return (
    <Link className="pin-logo" href={href} aria-label={label ?? `Pin ${product} · ${t("common.home")}`}>
      <span className="pin-logo-mark"><span /></span>
      {!compact && <span>Pin{product ? <> <b>{product}</b></> : null}</span>}
    </Link>
  );
}
