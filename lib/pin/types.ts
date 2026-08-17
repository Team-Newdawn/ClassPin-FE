import type { PresentationQrPosition } from "@/lib/types";

/**
 * 민원이 아니라 피드백을 받는다. 문제만 모으면 민원함이 되므로 긍정(praise)을 1급으로 둔다.
 * 행사 회고·포스터·앱 UI 어디에 붙여도 말이 되는 중립 어휘로 고정한다.
 */
export const LEGACY_FEEDBACK_CATEGORY_KEYS = ["praise", "improve", "confusing", "bug", "idea"] as const;
export type LegacyFeedbackCategory = typeof LEGACY_FEEDBACK_CATEGORY_KEYS[number];
export type FeedbackCategory = string | null;
export type FeedbackCategoryLabelKey = LegacyFeedbackCategory | "none";

export const FEEDBACK_CATEGORY_LABEL_MAX = 40;
export const FEEDBACK_CATEGORY_MAX = 20;
export const SESSION_FOLDER_NAME_MAX = 60;
const FEEDBACK_CATEGORY_STORED_MAX = 50;
const FEEDBACK_CATEGORY_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isLegacyFeedbackCategory = (category: string): category is LegacyFeedbackCategory =>
  (LEGACY_FEEDBACK_CATEGORY_KEYS as readonly string[]).includes(category);

export type FeedbackCategorySetting = {
  /** 비어 있으면 현재 언어의 기본 이름을 쓴다. */
  label: string;
  enabled: boolean;
  /** 과거 응답의 표시 이름만 보존하고 관리자 설정에서는 숨긴다. */
  archived: boolean;
};

export type FeedbackCategorySettings = Record<string, FeedbackCategorySetting>;

export const defaultFeedbackCategorySettings = (): FeedbackCategorySettings => ({
  praise: { label: "", enabled: true, archived: false },
  improve: { label: "", enabled: true, archived: false },
  confusing: { label: "", enabled: true, archived: false },
  bug: { label: "", enabled: true, archived: false },
  idea: { label: "", enabled: true, archived: false },
});

const normalizedCategoryLabel = (value: unknown) => typeof value === "string"
  ? [...value.trim()].slice(0, FEEDBACK_CATEGORY_LABEL_MAX).join("")
  : "";

/** RPC·Realtime에서 받은 동적 설정은 신뢰하지 않고 허용 범위만 복원한다. */
export function normalizeFeedbackCategorySettings(value: unknown): FeedbackCategorySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultFeedbackCategorySettings();
  const normalized: FeedbackCategorySettings = {};
  Object.entries(value as Record<string, unknown>).slice(0, FEEDBACK_CATEGORY_STORED_MAX).forEach(([key, item]) => {
    if (!FEEDBACK_CATEGORY_KEY.test(key) || !item || typeof item !== "object" || Array.isArray(item)) return;
    const setting = item as Record<string, unknown>;
    const label = normalizedCategoryLabel(setting.label);
    if (!isLegacyFeedbackCategory(key) && !label) return;
    normalized[key] = {
      label,
      enabled: typeof setting.enabled === "boolean" ? setting.enabled : true,
      archived: typeof setting.archived === "boolean" ? setting.archived : false,
    };
  });
  return normalized;
}

export function isValidFeedbackCategorySettings(value: unknown): value is FeedbackCategorySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= FEEDBACK_CATEGORY_STORED_MAX
    && entries.filter(([, item]) => (item as Partial<FeedbackCategorySetting> | null)?.archived !== true).length <= FEEDBACK_CATEGORY_MAX
    && entries.every(([key, item]) => {
      if (!FEEDBACK_CATEGORY_KEY.test(key) || !item || typeof item !== "object" || Array.isArray(item)) return false;
      const setting = item as Partial<FeedbackCategorySetting>;
      return typeof setting?.enabled === "boolean"
        && typeof setting?.archived === "boolean"
        && typeof setting?.label === "string"
        && setting.label === setting.label.trim()
        && [...setting.label].length <= FEEDBACK_CATEGORY_LABEL_MAX
        && (isLegacyFeedbackCategory(key) || setting.label.length > 0);
    });
}

const orderedFeedbackCategoryKeys = (settings: FeedbackCategorySettings) => [
  ...LEGACY_FEEDBACK_CATEGORY_KEYS.filter((key) => key in settings),
  ...Object.keys(settings)
    .filter((key) => !isLegacyFeedbackCategory(key))
    .sort((a, b) => settings[a].label.localeCompare(settings[b].label)),
];

export const enabledFeedbackCategories = (settings: FeedbackCategorySettings) =>
  orderedFeedbackCategoryKeys(settings).filter((key) => settings[key].enabled && !settings[key].archived);

export const configuredFeedbackCategories = (settings: FeedbackCategorySettings) =>
  orderedFeedbackCategoryKeys(settings).filter((key) => !settings[key].archived);

export const acceptsFeedbackCategory = (settings: FeedbackCategorySettings, category: FeedbackCategory) => {
  const enabled = enabledFeedbackCategories(settings);
  return category === null ? enabled.length === 0 : enabled.includes(category);
};

export const configuredFeedbackCategoryLabel = (
  settings: FeedbackCategorySettings,
  category: FeedbackCategory,
  fallback: (category: FeedbackCategoryLabelKey) => string
) => category === null
  ? fallback("none")
  : settings[category]?.label || (isLegacyFeedbackCategory(category) ? fallback(category) : category);

export const feedbackCategoryClass = (settings: FeedbackCategorySettings, category: FeedbackCategory) => {
  if (category === null) return "none";
  if (isLegacyFeedbackCategory(category)) return category;
  const custom = orderedFeedbackCategoryKeys(settings).filter((key) => !isLegacyFeedbackCategory(key));
  return `custom-${Math.max(0, custom.indexOf(category)) % 5}`;
};

/** 비활성화한 유형도 과거 응답이 있으면 관리자 분석에서 계속 확인할 수 있어야 한다. */
export const analyzedFeedbackCategories = (settings: FeedbackCategorySettings, pins: FeedbackPin[]) => {
  const categories: FeedbackCategory[] = orderedFeedbackCategoryKeys(settings)
    .filter((key) => (settings[key].enabled && !settings[key].archived) || pins.some((pin) => pin.category === key));
  pins.forEach((pin) => {
    if (!categories.includes(pin.category)) categories.push(pin.category);
  });
  return categories;
};

export const isAudienceGroupName = (value: string) => {
  const length = [...value].length;
  return value === value.trim() && length >= 1 && length <= 40;
};

export const normalizeAudienceGroups = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && isAudienceGroupName(item)))]
    : [];

export const isSessionFolderName = (value: string) => {
  const length = [...value].length;
  return value === value.trim() && length >= 1 && length <= SESSION_FOLDER_NAME_MAX;
};

export interface SessionFolder {
  id: string;
  name: string;
}

/** 긍정으로 집계하는 카테고리. 나머지는 개선 신호로 본다. */
export const positiveCategories: readonly FeedbackCategory[] = ["praise"];

export const FEEDBACK_PIN_MARKERS = ["pin", "question", "smile", "idea"] as const;
export type FeedbackPinMarker = typeof FEEDBACK_PIN_MARKERS[number];

export const isFeedbackPinMarker = (value: unknown): value is FeedbackPinMarker =>
  typeof value === "string" && (FEEDBACK_PIN_MARKERS as readonly string[]).includes(value);

export const normalizeFeedbackPinMarker = (value: unknown): FeedbackPinMarker =>
  isFeedbackPinMarker(value) ? value : "pin";

export const feedbackPinMarkerEmoji = (marker: FeedbackPinMarker): string | null =>
  marker === "question" ? "❓" : marker === "smile" ? "🙂" : marker === "idea" ? "💡" : null;

export const normalizeFeedbackPinReactionCount = (value: unknown) => {
  const count = typeof value === "number" || typeof value === "string" ? Number(value) : 0;
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
};

export interface FeedbackPin {
  id: string;
  campaignId: string;
  /** 핀이 놓인 캠페인 페이지(0부터 시작). */
  pageIndex: number;
  /** 관리자는 RLS 로 캠페인의 모든 핀을 받는다. 참여자 화면이 "내 의견"을 가리려면 이 값이 필요하다. */
  authorId: string | null;
  /** 기준 이미지 좌상단 기준 0~1 정규화 좌표. 어떤 기기에서도 같은 지점을 가리킨다. */
  x: number;
  y: number;
  category: FeedbackCategory;
  body: string;
  /** 기본 물방울 핀 또는 작성자가 고른 이모지 핀. */
  marker: FeedbackPinMarker;
  reactionCount: number;
  reactedByMe: boolean;
  hidden: boolean;
  createdAt: string;
}

export interface CampaignPage {
  id: string;
  campaignId: string;
  pageIndex: number;
  imageUrl: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  audienceGroups: string[];
}

export const pagesForAudience = (pages: CampaignPage[], audienceGroup: string) =>
  pages.filter((page) => page.audienceGroups.includes(audienceGroup));

/** 한 참여 유형의 최신 응답만 교체해, 관리자 전체 목록과 이미 조회한 다른 유형을 보존한다. */
export function mergeAudiencePages(current: CampaignPage[], incoming: CampaignPage[], audienceGroup: string) {
  const retained = current.filter((page) => !page.audienceGroups.includes(audienceGroup));
  return [...new Map([...retained, ...incoming].map((page) => [page.id, page])).values()]
    .sort((a, b) => a.pageIndex - b.pageIndex);
}

export interface Campaign {
  id: string;
  /** null이면 어떤 폴더에도 들어 있지 않은 루트 세션이다. */
  folderId: string | null;
  code: string;
  title: string;
  guideText: string;
  status: "live" | "ended";
  showPresentationQr: boolean;
  presentationQrPosition: PresentationQrPosition;
  presentationAutoplay: boolean;
  showPresentationPinStatus: boolean;
  presentationPinStatusPosition: PresentationQrPosition;
  /** 관리자가 캠페인별로 만든 참여자 분기 이름. 비어 있으면 분기를 사용하지 않는다. */
  audienceGroups: string[];
  /** 캠페인별로 관리자가 추가·삭제하는 참여자 피드백 카테고리. */
  feedbackCategories: FeedbackCategorySettings;
  /** PDF는 모든 페이지, 이미지는 한 페이지로 정규화한다. */
  pages: CampaignPage[];
  createdAt: string;
  pins: FeedbackPin[];
}
