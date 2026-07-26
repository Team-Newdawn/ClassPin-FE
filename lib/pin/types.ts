/**
 * 민원이 아니라 피드백을 받는다. 문제만 모으면 민원함이 되므로 긍정(praise)을 1급으로 둔다.
 * 행사 회고·포스터·앱 UI 어디에 붙여도 말이 되는 중립 어휘로 고정한다.
 */
export type FeedbackCategory = "praise" | "improve" | "confusing" | "bug" | "idea";

export const feedbackCategoryLabel = {
  praise: "좋아요",
  improve: "아쉬워요",
  confusing: "헷갈려요",
  bug: "오류",
  idea: "제안"
} as const;

/** 참여자 화면에서 카테고리 뜻을 한 줄로 풀어 준다. 고르는 기준이 사람마다 달라지지 않게. */
export const feedbackCategoryHint = {
  praise: "잘된 점, 그대로 유지했으면",
  improve: "불편했거나 개선이 필요한 점",
  confusing: "무슨 뜻인지 알기 어려웠던 점",
  bug: "잘못된 정보이거나 동작하지 않음",
  idea: "이렇게 해보면 어떨까 하는 생각"
} as const;

/** 긍정으로 집계하는 카테고리. 나머지는 개선 신호로 본다. */
export const positiveCategories: readonly FeedbackCategory[] = ["praise"];

export interface FeedbackPin {
  id: string;
  campaignId: string;
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

export interface Campaign {
  id: string;
  code: string;
  title: string;
  guideText: string;
  status: "live" | "ended";
  /** 기준 이미지. 캔버스를 원본 비율로 맞춰야 좌표가 이미지상 위치와 일치한다. */
  imageUrl?: string;
  imagePath?: string;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: string;
  pins: FeedbackPin[];
}
