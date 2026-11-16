"use client";

import { Check, Clock3 } from "@/app/component/icon/icons";
import { useLanguage } from "@/app/_controller/provider/language-context";
import type { QuestionStatus } from "@/app/_model/core/types";
import styles from "./status-badge.module.css";

export function StatusBadge({ status }: { status: QuestionStatus }) {
  const { statusLabel } = useLanguage();
  const label = statusLabel(status);
  return <span className={`${styles.root} status-badge ${status}`}>{status === "unanswered" ? <Clock3 /> : <Check />}{label}</span>;
}
