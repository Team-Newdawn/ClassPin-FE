import { Check, Clock3 } from "lucide-react";
import type { QuestionStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: QuestionStatus }) {
  const label = status === "unanswered" ? "미답변" : "해결됨";
  return <span className={`status-badge ${status}`}>{status === "unanswered" ? <Clock3 /> : <Check />}{label}</span>;
}
