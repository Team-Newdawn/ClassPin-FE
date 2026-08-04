"use client";

import { Check, Clock3 } from "lucide-react";
import { useLanguage } from "@/components/language-context";
import type { QuestionStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: QuestionStatus }) {
  const { statusLabel } = useLanguage();
  const label = statusLabel(status);
  return <span className={`status-badge ${status}`}>{status === "unanswered" ? <Clock3 /> : <Check />}{label}</span>;
}
