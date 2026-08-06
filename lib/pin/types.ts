/**
 * 민원이 아니라 피드백을 받는다. 문제만 모으면 민원함이 되므로 긍정(praise)을 1급으로 둔다.
 * 행사 회고·포스터·앱 UI 어디에 붙여도 말이 되는 중립 어휘로 고정한다.
 */
export type FeedbackCategory = "praise" | "improve" | "confusing" | "bug" | "idea";

export const AUDIENCE_GROUPS = ["design_sprint", "ai_playground", "event"] as const;
export type AudienceGroup = typeof AUDIENCE_GROUPS[number];

export const isAudienceGroup = (value: string | null): value is AudienceGroup =>
  AUDIENCE_GROUPS.includes(value as AudienceGroup);

export const feedbackCategoryLabel = {
  praise: "좋아요",
  improve: "아쉬워요",
  confusing: "헷갈려요",
  bug: "오류",
  idea: "제안"
} as const;

/** 긍정으로 집계하는 카테고리. 나머지는 개선 신호로 본다. */
export const positiveCategories: readonly FeedbackCategory[] = ["praise"];

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
  audienceGroups: AudienceGroup[];
}

export const pagesForAudience = (pages: CampaignPage[], audienceGroup: AudienceGroup) =>
  pages.filter((page) => page.audienceGroups.includes(audienceGroup));

/** 한 참여 유형의 최신 응답만 교체해, 관리자 전체 목록과 이미 조회한 다른 유형을 보존한다. */
export function mergeAudiencePages(current: CampaignPage[], incoming: CampaignPage[], audienceGroup: AudienceGroup) {
  const retained = current.filter((page) => !page.audienceGroups.includes(audienceGroup));
  return [...new Map([...retained, ...incoming].map((page) => [page.id, page])).values()]
    .sort((a, b) => a.pageIndex - b.pageIndex);
}

export interface Campaign {
  id: string;
  code: string;
  title: string;
  guideText: string;
  status: "live" | "ended";
  /** PDF는 모든 페이지, 이미지는 한 페이지로 정규화한다. */
  pages: CampaignPage[];
  createdAt: string;
  pins: FeedbackPin[];
}
