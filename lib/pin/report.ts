import type { FeedbackPin, LegacyFeedbackCategory } from "./types";

export type ReportSignalCategory = Exclude<LegacyFeedbackCategory, "praise">;

export interface ReportSignal {
  key: ReportSignalCategory;
  share: number;
  pins: FeedbackPin[];
}

/** 오류를 먼저 확인하고, 그다음 이해·사용 불편과 제안을 살핀다. */
const SIGNAL_ORDER: readonly ReportSignalCategory[] = ["bug", "confusing", "improve", "idea"];

/** 숨긴 의견은 리포트의 수치·근거 어디에도 남지 않는다. */
export function buildReportSignals(pins: FeedbackPin[]): ReportSignal[] {
  const visible = pins.filter((pin) => !pin.hidden);
  return SIGNAL_ORDER.flatMap((key) => {
    const matching = visible.filter((pin) => pin.category === key);
    if (!matching.length) return [];
    return [{
      key,
      share: Math.round((matching.length / visible.length) * 100),
      pins: matching,
    }];
  });
}
