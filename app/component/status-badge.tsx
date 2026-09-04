"use client";

import { Check, Clock3 } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import type { QuestionStatus } from "@/app/_model/types";
import styles from "./status-badge.module.css";

export function StatusBadge({ status }: { status: QuestionStatus }) {
  const { statusLabel } = useLanguage();
  const label = statusLabel(status);
  return <span className={`${styles.root} status-badge ${status}`}>{status === "unanswered" ? <Clock3 /> : <Check />}{label}</span>;
}
