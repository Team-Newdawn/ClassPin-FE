import { isLegacyFeedbackCategory, positiveCategories, type FeedbackCategory, type FeedbackPin } from "./types";

/** 숨김은 삭제가 아니라 표시 제외다. 집계·이미지·기본 목록은 모두 이 결과만 본다. */
export const visiblePins = (pins: FeedbackPin[]) => pins.filter((pin) => !pin.hidden);

export const hiddenPins = (pins: FeedbackPin[]) => pins.filter((pin) => pin.hidden);

export const countBy = (pins: FeedbackPin[], category: FeedbackCategory) => pins.filter((pin) => pin.category === category).length;

const share = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);

export interface CategoryCount {
  key: FeedbackCategory;
  count: number;
  /** 전체 대비 비율(%) */
  share: number;
}

/** 설정·과거 데이터에 있는 동적 카테고리를 집계한다. */
export const categoryBreakdown = (pins: FeedbackPin[], categories: FeedbackCategory[] = [...new Set(pins.map((pin) => pin.category))]): CategoryCount[] =>
  categories
    .map((key) => {
      const count = countBy(pins, key);
      return { key, count, share: share(count, pins.length) };
    })
    .sort((a, b) => b.count - a.count);

export const topCategory = (pins: FeedbackPin[]): CategoryCount | null => categoryBreakdown(pins).find((item) => item.count > 0) ?? null;

export interface Sentiment {
  categorized: number;
  positive: number;
  improvement: number;
  /** 긍정 비율(%) */
  positiveShare: number;
}

/**
 * 잘된 점과 고칠 점의 균형. 개선 항목만 세면 어느 행사든 "문제 투성이"로 읽히고,
 * 회차를 비교할 때 나아졌는지 나빠졌는지도 알 수 없다.
 */
export const sentiment = (pins: FeedbackPin[]): Sentiment => {
  const categorized = pins.filter((pin) => pin.category !== null && isLegacyFeedbackCategory(pin.category));
  const positive = categorized.filter((pin) => positiveCategories.includes(pin.category)).length;
  return { categorized: categorized.length, positive, improvement: categorized.length - positive, positiveShare: share(positive, categorized.length) };
};

const ZONE_LABELS = ["좌측 상단", "상단 중앙", "우측 상단", "좌측 중앙", "정중앙", "우측 중앙", "좌측 하단", "하단 중앙", "우측 하단"] as const;

const zoneAxis = (value: number) => Math.min(2, Math.max(0, Math.floor(value * 3)));

export interface HotZone {
  index: number;
  label: string;
  count: number;
  share: number;
}

/** 기준 이미지를 3×3으로 갈라 의견이 가장 몰린 칸. 좌표를 모으는 제품에서만 나오는 지표다. */
export const hotZone = (pins: FeedbackPin[]): HotZone | null => {
  if (!pins.length) return null;
  const counts = ZONE_LABELS.map(() => 0);
  pins.forEach((pin) => { counts[zoneAxis(pin.y) * 3 + zoneAxis(pin.x)] += 1; });
  const best = counts.reduce((top, count, index) => (count > counts[top] ? index : top), 0);
  return { index: best, label: ZONE_LABELS[best], count: counts[best], share: share(counts[best], pins.length) };
};

// 문자열 비교는 타임존 표기가 섞이면 어긋난다. 시각으로 바꿔서 고른다.
export const latestPinAt = (pins: FeedbackPin[]) =>
  pins.reduce<string | null>((latest, pin) => (!latest || new Date(pin.createdAt).getTime() > new Date(latest).getTime() ? pin.createdAt : latest), null);
